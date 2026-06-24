import { db } from "@/lib/db/client";
import { signals, competitors, approvedSignals, contestedResolutions } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { SignalOutput, Tier, SignalType, Polarity, Importance } from "@/lib/utils/types";
import { inngest } from "@/lib/jobs/client";
import { evaluateAndApplyTransition } from "./tier-runner";
import { getEmbedding } from "@/lib/llm/openai";

/**
 * Signal Bank Agent — Phase 2.
 *
 * Owns: the signal database. Every signal extracted by the SOAP Agent
 * flows through here.
 *
 * Phase 2: Three-check dedup (cosine similarity + type + polarity),
 *          tier state machine wiring, contested resolution.
 */

/**
 * Resolve the LLM-emitted `contestedAgainst` title text to a real
 * approvedSignals.id UUID so the dashboard's side-by-side render has
 * something to join against. Two-step match:
 *   1. Case-insensitive exact title match.
 *   2. Case-insensitive substring either direction (the LLM often shortens
 *      or paraphrases the title slightly).
 * Returns null when no plausible match — the side-by-side falls back to the
 * "no specific Concrete named" empty-state copy.
 */
function resolveContestedAgainst(
  raw: string,
  approved: { id: string; title: string }[]
): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  const exact = approved.find((a) => a.title.trim().toLowerCase() === t);
  if (exact) return exact.id;
  const sub = approved.find(
    (a) => a.title.trim().toLowerCase().includes(t) || t.includes(a.title.trim().toLowerCase())
  );
  return sub ? sub.id : null;
}

/**
 * Inline embed + dedup wrapper. Eliminates the 24-hour Inngest cron lag for
 * the in-line transcript path. The cron stays as a safety net for any signal
 * the inline path missed (OpenAI down, exception, etc.).
 *
 * Returns the dedup action so the caller can decide whether to skip downstream
 * work (e.g. tier evaluation is pointless on a "reinforced" outcome — the
 * survivor already had it run, the duplicate is about to be archived).
 */
async function embedAndDedupeSignalInline(
  signalId: string,
  workspaceId: string,
  text: string,
  openaiKey: string | null
): Promise<{ action: "reinforced" | "flagged" | "new" | "skipped"; matchedId?: string }> {
  let embedding: number[];
  try {
    embedding = await getEmbedding(text, openaiKey);
  } catch (err) {
    console.warn("Inline signal embedding failed; falling back to cron:", err);
    return { action: "skipped" };
  }

  // Write the embedding back so the row matches what the Inngest job would do.
  await db
    .update(signals)
    .set({ embedding })
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspaceId)));

  return deduplicateSignal(signalId, workspaceId);
}

// Scale a float in [min, max] to an int in [min*scale, max*scale], clamping
// out-of-range or non-numeric input to `fallback * scale` (or to the bound
// closest to the input).
function clampScaled(
  value: unknown,
  min: number,
  max: number,
  scale: number,
  fallback = 0
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return Math.round(fallback * scale);
  return Math.round(Math.max(min, Math.min(max, n)) * scale);
}

// ─── Ingest signals from a SOAP run ────────────────────────────────

export async function ingestSignals(
  workspaceId: string,
  transcriptId: string,
  soapNoteId: string,
  rawSignals: SignalOutput[],
  callContext: {
    callLevelPersona?: string;
    callLevelSegment?: string;
    openaiKey?: string | null;
  } = {}
): Promise<void> {
  if (!rawSignals || rawSignals.length === 0) return;

  // One round-trip up front: pull competitors (FK match for competitor_tagged)
  // and approved Concrete signals (FK match for contested_against).
  const [comps, approved] = await Promise.all([
    db.select().from(competitors).where(eq(competitors.workspaceId, workspaceId)),
    db
      .select({ id: approvedSignals.id, title: approvedSignals.title })
      .from(approvedSignals)
      .where(eq(approvedSignals.workspaceId, workspaceId)),
  ]);

  const compMap = new Map(comps.map((c) => [c.name.toLowerCase(), c.id]));

  for (const signal of rawSignals) {
    const competitorId = signal.competitorTagged
      ? compMap.get(signal.competitorTagged.toLowerCase()) || null
      : null;

    // Resolve the LLM's text reference (e.g. "Pricing is not our differentiator")
    // to the actual approvedSignals row UUID. NULL when no match — the
    // contested side-by-side renders the empty-state copy in that case.
    const contestedAgainstId =
      signal.canonicalContradiction !== "no" && signal.contestedAgainst
        ? resolveContestedAgainst(signal.contestedAgainst, approved)
        : null;

    // Persona/segment fallback: prefer per-signal LLM output when it eventually
    // emits those fields; for now we denormalise from the call-level analysis.
    const persona = callContext.callLevelPersona || "";
    const segment = callContext.callLevelSegment || "";

    // Scale the float framework scores to integers for storage.
    // marketMaturityScore: -1.0..+1.0 → -100..+100
    // confidenceScore: 0.0..1.0 → 0..100
    const maturity = clampScaled(signal.marketMaturityScore, -1, 1, 100);
    const confidence = clampScaled(signal.confidenceScore, 0, 1, 100, 50);

    const [inserted] = await db
      .insert(signals)
      .values({
        workspaceId,
        sourceTranscriptId: transcriptId,
        sourceSoapNoteId: soapNoteId,
        signalType: signal.type as SignalType,
        title: signal.title || "",
        content: signal.content || "",
        verbatimQuote: signal.quote || "",
        inferredMeaning: signal.inferredMeaning || "",
        pillarTag: signal.pillarTag || 0,
        polarity: (signal.polarity || "Neutral") as Polarity,
        strategicImportance: (signal.strategicImportance || "Medium") as Importance,
        tier: (signal.state || "suggestion") as Tier,
        competitorTagged: competitorId,
        competitorName: signal.competitorTagged || "",
        personaTagged: persona,
        segmentTagged: segment,
        canonicalContradiction: signal.canonicalContradiction || "no",
        contestedAgainst: contestedAgainstId,
        route: signal.route || "signal_library",
        sourceSection: signal.sourceSection || "",
        // v3.1 framework tags
        switchingForce: signal.switchingForce || "",
        needscopeLayer: signal.needscopeLayer || "",
        marketMaturityScore: maturity,
        ladderFeature: signal.ladder?.feature || "",
        ladderAdvantage: signal.ladder?.advantage || "",
        ladderTerminalBenefit: signal.ladder?.terminalBenefit || "",
        seniority: signal.seniority || "",
        industryTagged: signal.industryTagged || "",
        needGap: signal.needGap || "",
        confidenceScore: confidence,
        promptVersion: "v3.1",
      })
      .returning({ id: signals.id });

    if (inserted?.id) {
      // Best-effort Inngest event so the existing cron stays a safety net
      // for any signal the inline path misses (OpenAI outage etc.).
      try {
        await inngest.send({
          name: "signal/created",
          data: { signalId: inserted.id, workspaceId },
        });
      } catch (err) {
        console.warn("Inngest send failed (signal/created):", err);
      }

      // Inline embed + dedup: removes the 24h cron lag. Survivor of a dedup
      // hit gets reinforced; the new (duplicate) row is archived in-place.
      const dedupText = [
        signal.title,
        signal.content,
        signal.quote,
        signal.inferredMeaning,
      ].filter(Boolean).join("\n");
      let dedupAction: "reinforced" | "flagged" | "new" | "skipped" = "skipped";
      let matchedSurvivorId: string | undefined;
      try {
        const dedupResult = await embedAndDedupeSignalInline(
          inserted.id,
          workspaceId,
          dedupText,
          callContext.openaiKey ?? null
        );
        dedupAction = dedupResult.action;
        matchedSurvivorId = dedupResult.matchedId;
      } catch (err) {
        console.warn("Inline signal dedup failed:", err);
      }

      // Tier transition fires on:
      //   - the survivor when this signal got merged into one (reinforced)
      //   - the new row when it's genuinely new (or dedup skipped)
      const targetForTier =
        dedupAction === "reinforced" && matchedSurvivorId ? matchedSurvivorId : inserted.id;
      try {
        await evaluateAndApplyTransition(targetForTier, workspaceId);
      } catch (err) {
        console.warn("Tier transition evaluation failed:", err);
      }
    }
  }
}

// ─── Query signals ─────────────────────────────────────────────────

export interface SignalFilters {
  tier?: Tier;
  type?: SignalType;
  competitorId?: string;
  pillar?: number;
  limit?: number;
  offset?: number;
}

export async function getSignals(
  workspaceId: string,
  filters: SignalFilters = {}
) {
  const conditions = [eq(signals.workspaceId, workspaceId)];

  if (filters.tier) {
    conditions.push(eq(signals.tier, filters.tier));
  }
  if (filters.type) {
    conditions.push(eq(signals.signalType, filters.type));
  }
  if (filters.competitorId) {
    conditions.push(eq(signals.competitorTagged, filters.competitorId));
  }
  if (filters.pillar !== undefined) {
    conditions.push(eq(signals.pillarTag, filters.pillar));
  }

  return db
    .select()
    .from(signals)
    .where(and(...conditions))
    .orderBy(desc(signals.lastReinforced))
    .limit(filters.limit || 50)
    .offset(filters.offset || 0);
}

// ─── Basic mutations ────────────────────────────────────────────────

export async function approveSignal(signalId: string, workspaceId: string, userId: string) {
  const [signal] = await db
    .select()
    .from(signals)
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspaceId)))
    .limit(1);

  if (!signal) throw new Error("Signal not found");

  await db
    .update(signals)
    .set({ tier: "concrete" })
    .where(eq(signals.id, signalId));

  await db.insert(approvedSignals).values({
    workspaceId,
    title: signal.title,
    content: signal.content,
    approvedBy: userId,
    promotedFromSignalId: signal.id,
  });
}

export async function dismissSignal(signalId: string, workspaceId: string) {
  await db
    .update(signals)
    .set({ tier: "dismissed" })
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspaceId)));
}

export async function promoteSignal(signalId: string, workspaceId: string, toTier: Tier) {
  await db
    .update(signals)
    .set({ tier: toTier })
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspaceId)));
}

export async function demoteSignal(signalId: string, workspaceId: string) {
  const [signal] = await db
    .select()
    .from(signals)
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspaceId)))
    .limit(1);

  if (!signal) throw new Error("Signal not found");

  const demotionMap: Record<string, Tier> = {
    concrete: "evolving",
    evolving: "suggestion",
    suggestion: "archived",
  };

  const newTier = demotionMap[signal.tier] || "archived";
  await db
    .update(signals)
    .set({ tier: newTier })
    .where(eq(signals.id, signalId));
}

// ─── Phase 2: Three-check deduplication ────────────────────────────

/**
 * Run the three-check dedup logic against a newly-embedded signal.
 *
 * Three checks (all three must pass to reinforce an existing signal):
 *   1. Cosine similarity of embeddings > 0.85  (distance < 0.15)
 *   2. signal_type matches
 *   3. polarity matches
 *
 * If all three pass  → reinforce existing, archive the duplicate.
 * If two pass        → flag as "possibly related" (leave both; PMM review).
 * If one or zero     → treat as a genuinely new signal.
 */
export async function deduplicateSignal(
  signalId: string,
  workspaceId: string
): Promise<{ action: "reinforced" | "flagged" | "new"; matchedId?: string }> {
  const [target] = await db
    .select({
      id: signals.id,
      signalType: signals.signalType,
      polarity: signals.polarity,
      embedding: signals.embedding,
    })
    .from(signals)
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspaceId)))
    .limit(1);

  if (!target || !target.embedding) {
    return { action: "new" };
  }

  const embeddingStr = `[${target.embedding.join(",")}]`;

  const result = await db.execute<{
    id: string;
    signal_type: string;
    polarity: string;
    distance: number;
  }>(sql`
    SELECT id, signal_type, polarity,
           (embedding <=> ${embeddingStr}::vector) AS distance
    FROM signals
    WHERE workspace_id = ${workspaceId}
      AND id != ${signalId}
      AND embedding IS NOT NULL
      AND tier NOT IN ('dismissed', 'archived')
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT 5
  `);

  for (const candidate of result.rows) {
    const semanticMatch = candidate.distance < 0.15;
    const typeMatch = candidate.signal_type === target.signalType;
    const polarityMatch = candidate.polarity === target.polarity;

    const matchCount = [semanticMatch, typeMatch, polarityMatch].filter(Boolean).length;

    if (matchCount === 3) {
      // Full match — reinforce the existing, archive the duplicate
      await db
        .update(signals)
        .set({
          reinforcementCount: sql`reinforcement_count + 1`,
          lastReinforced: new Date(),
        })
        .where(eq(signals.id, candidate.id));

      await db
        .update(signals)
        .set({ tier: "archived" })
        .where(eq(signals.id, signalId));

      // Reinforcement may push the survivor across a tier threshold.
      // This is where most Suggestion → Evolving promotions actually fire.
      try {
        await evaluateAndApplyTransition(candidate.id, workspaceId);
      } catch (err) {
        console.warn("Tier transition after dedup-reinforce failed:", err);
      }

      return { action: "reinforced", matchedId: candidate.id };
    }

    if (matchCount === 2) {
      return { action: "flagged", matchedId: candidate.id };
    }
  }

  return { action: "new" };
}

// ─── Contested signal resolution ───────────────────────────────────

export type ContestedResolution =
  | "in_favor_of_concrete"
  | "in_favor_of_new"
  | "hold_for_review";

/**
 * Resolve a contested signal — the three options from the spec:
 *
 *   in_favor_of_concrete  → keep current canon, dismiss the new signal.
 *   in_favor_of_new       → promote the new signal to evolving; mark the
 *                           Concrete approved-signal as superseded.
 *   hold_for_review       → 14-day hold; tier stays contested; just records intent.
 */
export async function resolveContestedSignal(
  signalId: string,
  resolution: ContestedResolution,
  notes: string,
  resolvedBy: string,
  workspaceId: string
): Promise<void> {
  const [signal] = await db
    .select()
    .from(signals)
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspaceId)))
    .limit(1);

  if (!signal) throw new Error("Signal not found");
  if (signal.tier !== "contested") throw new Error("Signal is not in contested state");

  // Write the audit record
  await db.insert(contestedResolutions).values({
    workspaceId,
    signalId,
    resolvedBy,
    resolution,
    resolutionNotes: notes,
  });

  if (resolution === "in_favor_of_concrete") {
    await db
      .update(signals)
      .set({ tier: "dismissed" })
      .where(eq(signals.id, signalId));
  } else if (resolution === "in_favor_of_new") {
    await db
      .update(signals)
      .set({ tier: "evolving", canonicalContradiction: "no" })
      .where(eq(signals.id, signalId));

    // Mark the superseded approved signal (soft label — don't delete it for audit trail)
    if (signal.contestedAgainst) {
      await db
        .update(approvedSignals)
        .set({ title: sql`title || ' [archived — superseded]'` })
        .where(
          and(
            eq(approvedSignals.id, signal.contestedAgainst),
            eq(approvedSignals.workspaceId, workspaceId)
          )
        );
    }
  }
  // hold_for_review: no tier change; the daily decay cron will force-resolve after 14d
}

// ─── Signal counts for dashboard ───────────────────────────────────

export async function getSignalCounts(workspaceId: string) {
  const result = await db
    .select({
      tier: signals.tier,
      count: sql<number>`count(*)::int`,
    })
    .from(signals)
    .where(eq(signals.workspaceId, workspaceId))
    .groupBy(signals.tier);

  return Object.fromEntries(result.map((r) => [r.tier, r.count]));
}
