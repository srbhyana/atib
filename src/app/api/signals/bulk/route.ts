import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { signals, competitors } from "@/lib/db/schema";
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
const POLARITY = new Set(["Reinforces", "Contradicts", "Extends", "Neutral"]);
const IMPORTANCE = new Set(["Low", "Medium", "High", "Critical"]);
const TIERS = new Set([
  "suggestion",
  "evolving",
  "contested",
  "concrete",
  "archived",
  "dismissed",
]);

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

type Polarity = "Reinforces" | "Contradicts" | "Extends" | "Neutral";
type Importance = "Low" | "Medium" | "High" | "Critical";
type Tier =
  | "suggestion"
  | "evolving"
  | "contested"
  | "concrete"
  | "archived"
  | "dismissed";

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

    const comps = await db
      .select()
      .from(competitors)
      .where(eq(competitors.workspaceId, session.workspaceId));
    const compMap = new Map(comps.map((c) => [c.name.toLowerCase(), c.id]));

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

      const tier = String(row.tier || row.state || "suggestion").trim();
      const polarity = String(row.polarity || "Neutral").trim();
      const importance = String(
        row.strategicImportance || row.importance || "Medium"
      ).trim();
      const pillarRaw = Number(row.pillarTag ?? row.pillar ?? 0);
      const competitorName = String(row.competitorName || "").trim();

      valid.push({
        workspaceId: session.workspaceId,
        signalType: signalType as SignalType,
        title,
        content,
        verbatimQuote: String(row.verbatimQuote || row.quote || "").trim(),
        inferredMeaning: String(row.inferredMeaning || content).trim(),
        pillarTag: Number.isFinite(pillarRaw) ? pillarRaw : 0,
        polarity: (POLARITY.has(polarity) ? polarity : "Neutral") as Polarity,
        strategicImportance: (IMPORTANCE.has(importance)
          ? importance
          : "Medium") as Importance,
        tier: (TIERS.has(tier) ? tier : "suggestion") as Tier,
        competitorTagged: competitorName
          ? compMap.get(competitorName.toLowerCase()) || null
          : null,
        competitorName,
        personaTagged: String(row.personaTagged || "").trim(),
        segmentTagged: String(row.segmentTagged || "").trim(),
        canonicalContradiction: String(row.canonicalContradiction || "no").trim(),
        route: String(row.route || "signal_library").trim(),
        sourceSection: String(row.sourceSection || "bulk_import").trim(),
      });
    });

    let inserted = 0;
    if (valid.length > 0) {
      const result = await db.insert(signals).values(valid).returning({ id: signals.id });
      inserted = result.length;
    }

    return NextResponse.json({
      ok: true,
      inserted,
      skipped: errors.length,
      errors,
      message: `Inserted ${inserted} signals. ${errors.length} rows skipped.`,
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
