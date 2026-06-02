import { db } from "@/lib/db/client";
import { signals, positioningAudits, soapNotes } from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { callHaiku } from "@/lib/llm/anthropic";
import type { CanonicalContextBlock } from "@/lib/utils/types";

/**
 * Positioning Engine Agent — LLM-powered, scheduled.
 *
 * Owns: seven positioning frameworks run against incoming signals.
 * PMM sees output. The AI never auto-adjusts canonical positioning.
 *
 * Cadence: daily for dynamic checks, weekly for framework runs,
 * monthly for the Positioning Statement Audit.
 */

type Framework =
  | "5c"
  | "need_gap"
  | "pop_pod"
  | "laddering"
  | "needscope"
  | "kindergarten"
  | "positioning_statement";

// ─── Framework Runners ─────────────────────────────────────────────

export async function run5CFeasibility(
  workspaceId: string,
  ctx: CanonicalContextBlock
) {
  const recentSignals = await db
    .select()
    .from(signals)
    .where(eq(signals.workspaceId, workspaceId))
    .orderBy(desc(signals.lastReinforced))
    .limit(30);

  const failureCounts: Record<string, number> = {};
  for (const s of recentSignals) {
    // Parse 5C failures from signal metadata if stored
    // For now, aggregate from signal content
    const content = `${s.title} ${s.content} ${s.verbatimQuote}`.toLowerCase();
    if (content.includes("don't understand") || content.includes("confusing"))
      failureCounts["Customer"] = (failureCounts["Customer"] || 0) + 1;
    if (content.includes("not relevant") || content.includes("market changed"))
      failureCounts["Context"] = (failureCounts["Context"] || 0) + 1;
    if (content.includes("don't have") || content.includes("missing feature"))
      failureCounts["Company"] = (failureCounts["Company"] || 0) + 1;
    if (content.includes("competitor also") || content.includes("everyone does"))
      failureCounts["Competition"] = (failureCounts["Competition"] || 0) + 1;
    if (content.includes("too expensive") || content.includes("budget"))
      failureCounts["Profitability"] = (failureCounts["Profitability"] || 0) + 1;
  }

  const flags = Object.entries(failureCounts)
    .filter(([, cnt]) => cnt >= 2)
    .map(([c, cnt]) => ({
      category: c,
      count: cnt,
      severity: cnt >= 5 ? "high" : "medium",
      message: `${c} feasibility concern: ${cnt} signals suggest positioning claim may fail the ${c} check.`,
    }));

  const output = {
    framework: "5c" as const,
    totalSignalsAnalyzed: recentSignals.length,
    failureCounts,
    alerts: flags,
    summary:
      flags.length > 0
        ? `${flags.length} of 5 Cs show potential positioning drift.`
        : "All 5 Cs pass. Positioning claims are feasible based on current signal data.",
  };

  await db.insert(positioningAudits).values({
    workspaceId,
    framework: "5c",
    output,
    flags,
  });

  return output;
}

export async function runKindergartenTest(
  workspaceId: string,
  ctx: CanonicalContextBlock
) {
  const recentSignals = await db
    .select()
    .from(signals)
    .where(eq(signals.workspaceId, workspaceId))
    .orderBy(desc(signals.lastReinforced))
    .limit(20);

  const quotes = recentSignals
    .filter((s) => s.verbatimQuote)
    .map((s) => s.verbatimQuote)
    .slice(0, 10);

  let kindergartenSummary = "";
  let variance = "";

  if (quotes.length >= 3) {
    try {
      const prompt = `You are a positioning analyst. Given these verbatim prospect quotes from sales calls, write ONE sentence that a five-year-old would understand describing what this product does, based purely on how prospects describe it. Then compare that sentence to the company's positioning statement and describe the variance.

Prospect quotes:
${quotes.map((q, i) => `${i + 1}. "${q}"`).join("\n")}

Company positioning statement: "${ctx.positioningStatement}"

Respond in JSON: {"kindergartenSummary": "...", "variance": "...", "coherent": true/false}`;

      const response = await callHaiku("You are a concise positioning analyst.", prompt);
      const parsed = JSON.parse(response.replace(/```json\s*/g, "").replace(/```/g, "").trim());
      kindergartenSummary = parsed.kindergartenSummary || "";
      variance = parsed.variance || "";
    } catch (e) {
      kindergartenSummary = "Insufficient data for Kindergarten Test.";
      variance = "";
    }
  } else {
    kindergartenSummary = "Need at least 3 calls with verbatim quotes to run the Kindergarten Test.";
  }

  const output = {
    framework: "kindergarten" as const,
    kindergartenSummary,
    canonicalStatement: ctx.positioningStatement,
    variance,
    quotesUsed: quotes.length,
  };

  await db.insert(positioningAudits).values({
    workspaceId,
    framework: "kindergarten",
    output,
    flags: variance ? [{ message: variance, severity: "medium" }] : [],
  });

  return output;
}

export async function runNeedGapMapping(workspaceId: string) {
  const gapCounts = await db
    .select({
      gap: sql<string>`COALESCE(NULLIF(
        (${soapNotes.confidence}->>'needGap')::text, ''), 'unknown')`,
      cnt: sql<number>`count(*)::int`,
    })
    .from(soapNotes)
    .where(eq(soapNotes.workspaceId, workspaceId))
    .groupBy(sql`COALESCE(NULLIF((${soapNotes.confidence}->>'needGap')::text, ''), 'unknown')`);

  // Fallback: count from signals
  const signalNeedGaps = await db
    .select({
      route: signals.route,
      cnt: sql<number>`count(*)::int`,
    })
    .from(signals)
    .where(eq(signals.workspaceId, workspaceId))
    .groupBy(signals.route);

  const output = {
    framework: "need_gap" as const,
    distribution: gapCounts,
    signalRoutes: signalNeedGaps,
    summary: `Need gap distribution across ${gapCounts.reduce((a, b) => a + b.cnt, 0)} calls analyzed.`,
  };

  await db.insert(positioningAudits).values({
    workspaceId,
    framework: "need_gap",
    output,
    flags: [],
  });

  return output;
}

// ─── Get audit results ─────────────────────────────────────────────

export async function getAudits(workspaceId: string, framework?: Framework) {
  const conditions = [eq(positioningAudits.workspaceId, workspaceId)];
  if (framework) {
    conditions.push(eq(positioningAudits.framework, framework));
  }

  return db
    .select()
    .from(positioningAudits)
    .where(and(...conditions))
    .orderBy(desc(positioningAudits.runAt))
    .limit(10);
}

