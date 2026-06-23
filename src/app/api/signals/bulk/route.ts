import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { signals, competitors, canonicalContext } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SIGNAL_TYPES = new Set([
  "objection",
  "language_pattern",
  "competitor_mention",
  "use_case",
  "ICP_signal",
  "pricing_signal",
  "feature_request",
  "buying_trigger",
  "churn_risk",
  "expansion_signal",
]);
const TIERS = new Set([
  "suggestion",
  "evolving",
  "contested",
  "concrete",
  "archived",
  "dismissed",
]);

function normalizePolarity(raw: string): "Reinforces" | "Contradicts" | "Extends" | "Neutral" {
  const v = raw.trim().toLowerCase();
  if (v === "reinforces" || v === "positive" || v === "+") return "Reinforces";
  if (v === "contradicts" || v === "negative" || v === "-") return "Contradicts";
  if (v === "extends" || v === "neutral-positive") return "Extends";
  return "Neutral";
}

function normalizeImportance(raw: string): "Low" | "Medium" | "High" | "Critical" {
  const v = raw.trim().toLowerCase();
  if (v === "critical") return "Critical";
  if (v === "high") return "High";
  if (v === "low") return "Low";
  return "Medium";
}

function normalizeTier(raw: string): "suggestion" | "evolving" | "contested" | "concrete" | "archived" | "dismissed" {
  const v = raw.trim().toLowerCase();
  if (TIERS.has(v)) return v as "suggestion" | "evolving" | "contested" | "concrete" | "archived" | "dismissed";
  return "suggestion";
}

// CSV pillarTag values are usually descriptive strings like "pillar_identification".
// We match each label against the workspace's three canonical pillars by keyword
// overlap so the dashboard's pillar traffic lights have something to count.
function inferPillarTag(raw: string, pillarTexts: string[]): number {
  if (!raw) return 0;
  const v = raw.trim().toLowerCase().replace(/^pillar[_\s-]*/, "");
  if (/^[123]$/.test(v)) return Number(v);
  if (!v) return 0;
  const tokens = v.split(/[\s_\-/]+/).filter(Boolean);
  let bestPillar = 0;
  let bestScore = 0;
  for (let i = 0; i < pillarTexts.length; i++) {
    const pillar = (pillarTexts[i] || "").toLowerCase();
    if (!pillar) continue;
    let score = 0;
    for (const token of tokens) {
      if (token.length >= 3 && pillar.includes(token)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPillar = i + 1;
    }
  }
  return bestPillar;
}

type SignalType =
  | "objection"
  | "language_pattern"
  | "competitor_mention"
  | "use_case"
  | "ICP_signal"
  | "pricing_signal"
  | "feature_request"
  | "buying_trigger"
  | "churn_risk"
  | "expansion_signal";

export async function POST(request: Request) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No rows in CSV." },
        { status: 400 }
      );
    }

    const [comps, ctxRow] = await Promise.all([
      db.select().from(competitors).where(eq(competitors.workspaceId, session.workspaceId)),
      db.select().from(canonicalContext).where(eq(canonicalContext.workspaceId, session.workspaceId)).limit(1),
    ]);
    const compMap = new Map(comps.map((c) => [c.name.toLowerCase(), c.id]));
    const pillarTexts = ctxRow[0]
      ? [ctxRow[0].pillar1, ctxRow[0].pillar2, ctxRow[0].pillar3]
      : ["", "", ""];

    const errors: { row: number; reason: string }[] = [];
    const valid: Array<typeof signals.$inferInsert> = [];

    items.forEach((row: Record<string, unknown>, index: number) => {
      const title = String(row.title || "").trim();
      const content = String(row.content || "").trim();
      const signalType = String(row.signalType || row.type || "").trim();

      if (!title || !content) {
        errors.push({ row: index + 1, reason: "Missing title or content." });
        return;
      }
      if (!SIGNAL_TYPES.has(signalType)) {
        errors.push({
          row: index + 1,
          reason: `Unknown signalType "${signalType}". Allowed: ${[...SIGNAL_TYPES].join(", ")}.`,
        });
        return;
      }

      const tier = normalizeTier(String(row.tier || row.state || ""));
      const polarity = normalizePolarity(String(row.polarity || ""));
      const importance = normalizeImportance(String(row.strategicImportance || row.importance || ""));
      const pillarTag = inferPillarTag(String(row.pillarTag ?? row.pillar ?? ""), pillarTexts);
      const competitorName = String(row.competitorName || "").trim();
      // CSV "mentions" → reinforcement_count so bulk-imported signals can
      // promote past Suggestion based on their prior frequency.
      const mentionsRaw = Number(row.mentions ?? row.reinforcementCount ?? 1);
      const reinforcementCount = Number.isFinite(mentionsRaw) && mentionsRaw > 0
        ? Math.min(Math.floor(mentionsRaw), 1000)
        : 1;

      valid.push({
        workspaceId: session.workspaceId,
        signalType: signalType as SignalType,
        title,
        content,
        verbatimQuote: String(row.verbatimQuote || row.quote || "").trim(),
        inferredMeaning: String(row.inferredMeaning || content).trim(),
        pillarTag,
        polarity,
        strategicImportance: importance,
        tier,
        competitorTagged: competitorName
          ? compMap.get(competitorName.toLowerCase()) || null
          : null,
        competitorName,
        personaTagged: String(row.personaTagged || "").trim(),
        segmentTagged: String(row.segmentTagged || "").trim(),
        canonicalContradiction: String(row.canonicalContradiction || "no").trim(),
        route: String(row.route || "signal_library").trim(),
        sourceSection: String(row.sourceSection || "bulk_import").trim(),
        reinforcementCount,
      });
    });

    let inserted = 0;
    let promoted = 0;
    if (valid.length > 0) {
      const result = await db.insert(signals).values(valid).returning({ id: signals.id });
      inserted = result.length;

      // Run tier evaluation on every inserted signal. Bulk CSVs frequently land
      // with mention counts >= 3, so this is where Suggestion → Evolving
      // promotions actually fire for the demo dataset.
      const { evaluateAndApplyTransitions } = await import("@/lib/agents/tier-runner");
      const outcome = await evaluateAndApplyTransitions(
        result.map((r) => r.id),
        session.workspaceId,
        session.id
      );
      promoted = outcome.promoted;
    }

    return NextResponse.json({
      ok: true,
      inserted,
      promoted,
      skipped: errors.length,
      errors,
      message: `Inserted ${inserted} signals. ${promoted} auto-promoted past Suggestion. ${errors.length} rows skipped.`,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Bulk signals error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to bulk-insert signals.",
      },
      { status: 500 }
    );
  }
}
