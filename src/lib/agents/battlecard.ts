import { db } from "@/lib/db/client";
import {
  battlecards,
  competitors,
  signals,
  transcripts,
  users,
} from "@/lib/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { callSoap } from "@/lib/llm/anthropic";
import {
  buildBattlecardSystemPrompt,
  buildBattlecardUserMessage,
  type CompetitorContext,
  type BattlecardSignal,
} from "@/lib/llm/prompts/battlecard-universal";
import { getCanonicalContext, getCompetitors } from "./canonical-context";
import type { CanonicalContextBlock } from "@/lib/utils/types";

/**
 * Battlecard Agent (Phase 4).
 *
 * Owns: battlecard generation from accumulated competitor-tagged signals.
 * Battlecards are generated from signals, NOT from PMM memory.
 *
 * v1: Universal archetype only. Other archetypes (Just-Say-This, Topical,
 * Role-Based, Dynamic) deferred to v2.
 */

// ─── Battlecard section shape ──────────────────────────────────────

export interface BattlecardSections {
  companyOverview: string;
  howToPositionUs: string;
  whyWeWin: Array<{ reason: string; quote: string }>;
  objectionHandling: Array<{
    objection: string;
    response: string;
    proof: string;
  }>;
  quickDismisses: string[];
  landminesToPlant: string[];
  whyWeLose: string[];
  featureComparison: Array<{ feature: string; us: string; them: string }>;
  whenToWatchOut: string[];
  additionalResources: Array<{ label: string; url: string }>;
  confidence: number;
  evidenceFootnote: string;
}

const EMPTY_SECTIONS: BattlecardSections = {
  companyOverview: "",
  howToPositionUs: "",
  whyWeWin: [],
  objectionHandling: [],
  quickDismisses: [],
  landminesToPlant: [],
  whyWeLose: [],
  featureComparison: [],
  whenToWatchOut: [],
  additionalResources: [],
  confidence: 1,
  evidenceFootnote: "Insufficient signal data to populate this card.",
};

// ─── Build the context window for one competitor ───────────────────

interface BattlecardContext {
  canonicalCtx: CanonicalContextBlock;
  competitor: CompetitorContext;
  competitorSignals: BattlecardSignal[];
  progressedCount: number;
  lostCount: number;
}

async function buildBattlecardContext(
  workspaceId: string,
  competitorId: string
): Promise<BattlecardContext | null> {
  // 1. Canonical context
  const canonicalCtx = await getCanonicalContext(workspaceId);
  if (!canonicalCtx) return null;

  // 2. Competitor record
  const allComps = await getCompetitors(workspaceId);
  const comp = allComps.find((c) => c.id === competitorId);
  if (!comp) return null;

  // 3. Competitor-tagged signals + their source call outcomes
  const rows = await db
    .select({
      type: signals.signalType,
      quote: signals.verbatimQuote,
      inferredMeaning: signals.inferredMeaning,
      polarity: signals.polarity,
      transcriptId: signals.sourceTranscriptId,
      callOutcome: transcripts.callOutcome,
      callDate: transcripts.callDate,
      repName: users.name,
    })
    .from(signals)
    .leftJoin(transcripts, eq(signals.sourceTranscriptId, transcripts.id))
    .leftJoin(users, eq(transcripts.repId, users.id))
    .where(
      and(
        eq(signals.workspaceId, workspaceId),
        sql`(${signals.competitorTagged} = ${competitorId} OR LOWER(${signals.competitorName}) = LOWER(${comp.name}))`,
        sql`${signals.tier} NOT IN ('dismissed', 'archived')`
      )
    )
    .orderBy(desc(transcripts.callDate))
    .limit(40);

  const competitorSignals: BattlecardSignal[] = rows.map((r) => ({
    type: r.type || "",
    quote: r.quote || "",
    inferredMeaning: r.inferredMeaning || "",
    polarity: r.polarity || "Neutral",
    callOutcome: r.callOutcome || "unclear",
    callDate: r.callDate ? new Date(r.callDate).toISOString().slice(0, 10) : "",
    rep: r.repName || "(unknown)",
  }));

  const progressedCount = rows.filter((r) => r.callOutcome === "progressed").length;
  const lostCount = rows.filter((r) => r.callOutcome === "lost").length;

  return {
    canonicalCtx,
    competitor: {
      id: comp.id,
      name: comp.name,
      url: comp.url || "",
      battlecardNotes: comp.battlecardNotes || "",
    },
    competitorSignals,
    progressedCount,
    lostCount,
  };
}

// ─── Public API ────────────────────────────────────────────────────

export async function listBattlecards(workspaceId: string, competitorId?: string) {
  const conditions = [eq(battlecards.workspaceId, workspaceId)];
  if (competitorId) {
    conditions.push(eq(battlecards.competitorId, competitorId));
  }

  return db
    .select({
      id: battlecards.id,
      competitorId: battlecards.competitorId,
      competitorName: competitors.name,
      archetype: battlecards.archetype,
      roleVariant: battlecards.roleVariant,
      status: battlecards.status,
      generatedAt: battlecards.generatedAt,
      approvedAt: battlecards.approvedAt,
    })
    .from(battlecards)
    .leftJoin(competitors, eq(battlecards.competitorId, competitors.id))
    .where(and(...conditions))
    .orderBy(desc(battlecards.generatedAt));
}

export async function getBattlecard(workspaceId: string, battlecardId: string) {
  const [row] = await db
    .select()
    .from(battlecards)
    .where(
      and(
        eq(battlecards.id, battlecardId),
        eq(battlecards.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return row || null;
}

/**
 * Generate a new Universal battlecard for one competitor.
 * Falls back to an empty draft if the LLM is unavailable.
 */
export async function generateUniversalBattlecard(
  workspaceId: string,
  competitorId: string,
  anthropicApiKey?: string | null
): Promise<{ id: string; sections: BattlecardSections; source: "llm" | "fallback" }> {
  const ctx = await buildBattlecardContext(workspaceId, competitorId);
  if (!ctx) {
    throw new Error("Competitor not found or canonical context missing.");
  }

  let sections: BattlecardSections = EMPTY_SECTIONS;
  let source: "llm" | "fallback" = "fallback";

  // Try LLM generation
  try {
    const systemPrompt = buildBattlecardSystemPrompt(
      ctx.canonicalCtx,
      ctx.competitor
    );
    const userMessage = buildBattlecardUserMessage(
      ctx.competitor,
      ctx.competitorSignals,
      ctx.progressedCount,
      ctx.lostCount
    );

    const raw = await callSoap(systemPrompt, userMessage, anthropicApiKey);
    const parsed = parseBattlecardResponse(raw);
    if (parsed) {
      sections = parsed;
      source = "llm";
    }
  } catch (error) {
    console.error("Battlecard LLM generation failed:", error);
  }

  // If we have no signals at all, prepopulate the honest empty state
  if (ctx.competitorSignals.length === 0 && source === "fallback") {
    sections = {
      ...EMPTY_SECTIONS,
      companyOverview: ctx.competitor.battlecardNotes || `${ctx.competitor.name} — competitor record on file. No signal data yet.`,
      howToPositionUs:
        "Insufficient signal data. Submit transcripts that mention this competitor to build the card.",
      whyWeLose: ["No documented losses to this competitor in the last 90 days."],
      evidenceFootnote: "0 signals on file for this competitor.",
    };
  }

  // Persist as draft
  const [inserted] = await db
    .insert(battlecards)
    .values({
      workspaceId,
      competitorId,
      archetype: "universal",
      sections,
      status: "draft",
    })
    .returning({ id: battlecards.id });

  return { id: inserted.id, sections, source };
}

/**
 * Update a battlecard's sections (PMM editing).
 */
export async function updateBattlecardSections(
  workspaceId: string,
  battlecardId: string,
  sections: Partial<BattlecardSections>
): Promise<void> {
  const existing = await getBattlecard(workspaceId, battlecardId);
  if (!existing) throw new Error("Battlecard not found");

  const currentSections = (existing.sections as BattlecardSections) || EMPTY_SECTIONS;
  const merged = { ...currentSections, ...sections };

  await db
    .update(battlecards)
    .set({ sections: merged })
    .where(
      and(
        eq(battlecards.id, battlecardId),
        eq(battlecards.workspaceId, workspaceId)
      )
    );
}

export async function publishBattlecard(
  workspaceId: string,
  battlecardId: string,
  userId: string
): Promise<void> {
  await db
    .update(battlecards)
    .set({
      status: "published",
      approvedBy: userId,
      approvedAt: new Date(),
    })
    .where(
      and(
        eq(battlecards.id, battlecardId),
        eq(battlecards.workspaceId, workspaceId)
      )
    );
}

export async function archiveBattlecard(
  workspaceId: string,
  battlecardId: string
): Promise<void> {
  await db
    .update(battlecards)
    .set({ status: "archived" })
    .where(
      and(
        eq(battlecards.id, battlecardId),
        eq(battlecards.workspaceId, workspaceId)
      )
    );
}

// ─── Parsing helpers ───────────────────────────────────────────────

function parseBattlecardResponse(text: string): BattlecardSections | null {
  try {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);

    // Coerce expected fields with safe defaults
    return {
      companyOverview: String(parsed.companyOverview || ""),
      howToPositionUs: String(parsed.howToPositionUs || ""),
      whyWeWin: Array.isArray(parsed.whyWeWin) ? parsed.whyWeWin : [],
      objectionHandling: Array.isArray(parsed.objectionHandling)
        ? parsed.objectionHandling
        : [],
      quickDismisses: Array.isArray(parsed.quickDismisses) ? parsed.quickDismisses : [],
      landminesToPlant: Array.isArray(parsed.landminesToPlant)
        ? parsed.landminesToPlant
        : [],
      whyWeLose: Array.isArray(parsed.whyWeLose) ? parsed.whyWeLose : [],
      featureComparison: Array.isArray(parsed.featureComparison)
        ? parsed.featureComparison
        : [],
      whenToWatchOut: Array.isArray(parsed.whenToWatchOut)
        ? parsed.whenToWatchOut
        : [],
      additionalResources: Array.isArray(parsed.additionalResources)
        ? parsed.additionalResources
        : [],
      confidence: Number(parsed.confidence) || 1,
      evidenceFootnote: String(parsed.evidenceFootnote || ""),
    };
  } catch (error) {
    console.error("Failed to parse battlecard response:", error);
    return null;
  }
}

// Suppress unused import warnings for fields used by future role-based variants
void inArray;
