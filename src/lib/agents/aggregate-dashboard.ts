import { db } from "@/lib/db/client";
import { signals, transcripts, soapNotes } from "@/lib/db/schema";
import { eq, and, desc, sql, gte, count } from "drizzle-orm";
import type { DriftScore } from "@/lib/utils/types";
import { getDriftColor, DASHBOARD_MODULE_CAP } from "@/lib/utils/constants";

/**
 * Aggregate Dashboard Agent — deterministic with one LLM call.
 *
 * Owns: the cross-call positioning math and the PMM home screen.
 * Six modules, each capped at 5 items by default.
 *
 * Drift score: (reinforces − contradicts) / (reinforces + contradicts + extends)
 * normalised to 0-100, averaged across pillars.
 */

// ─── Drift Score ───────────────────────────────────────────────────

export async function calculateDriftScore(
  workspaceId: string
): Promise<DriftScore> {
  // Get signal polarity counts per pillar
  const polarityCounts = await db
    .select({
      pillarTag: signals.pillarTag,
      polarity: signals.polarity,
      cnt: sql<number>`count(*)::int`,
    })
    .from(signals)
    .where(
      and(
        eq(signals.workspaceId, workspaceId),
        gte(signals.pillarTag, 1)
      )
    )
    .groupBy(signals.pillarTag, signals.polarity);

  function pillarScore(pillar: number): number {
    const pillarData = polarityCounts.filter((r) => r.pillarTag === pillar);
    const reinforces = pillarData.find((r) => r.polarity === "Reinforces")?.cnt || 0;
    const contradicts = pillarData.find((r) => r.polarity === "Contradicts")?.cnt || 0;
    const extends_ = pillarData.find((r) => r.polarity === "Extends")?.cnt || 0;
    const total = reinforces + contradicts + extends_;
    if (total === 0) return 50; // neutral when no data
    const raw = (reinforces - contradicts) / total;
    return Math.round(((raw + 1) / 2) * 100); // normalise -1..1 to 0..100
  }

  const p1 = pillarScore(1);
  const p2 = pillarScore(2);
  const p3 = pillarScore(3);
  const overall = Math.round((p1 + p2 + p3) / 3);

  return {
    overall,
    pillar1: p1,
    pillar2: p2,
    pillar3: p3,
    color: getDriftColor(overall),
  };
}

// ─── Signal Feed (Module 1) ────────────────────────────────────────

export async function getSignalFeed(workspaceId: string, limit = DASHBOARD_MODULE_CAP) {
  // Ranked by tier priority, then reinforcement count, then recency
  return db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.workspaceId, workspaceId),
        sql`${signals.tier} NOT IN ('archived', 'dismissed')`
      )
    )
    .orderBy(
      sql`CASE ${signals.tier}
        WHEN 'contested' THEN 1
        WHEN 'evolving' THEN 2
        WHEN 'concrete' THEN 3
        WHEN 'suggestion' THEN 4
        ELSE 5
      END`,
      desc(signals.reinforcementCount),
      desc(signals.lastReinforced)
    )
    .limit(limit);
}

// ─── Contested Queue (Module 2) ────────────────────────────────────

export async function getContestedSignals(workspaceId: string) {
  return db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.workspaceId, workspaceId),
        eq(signals.tier, "contested")
      )
    )
    .orderBy(desc(signals.createdAt));
}

// ─── Enablement Feed (Module 3) ────────────────────────────────────

export async function getEnablementFeed(workspaceId: string, limit = DASHBOARD_MODULE_CAP) {
  // Language from progressed calls not in canonical messaging
  // For now: signals from progressed calls with polarity=Extends
  return db
    .select({
      signalId: signals.id,
      signalTitle: signals.title,
      signalContent: signals.content,
      verbatimQuote: signals.verbatimQuote,
      polarity: signals.polarity,
      tier: signals.tier,
      callOutcome: transcripts.callOutcome,
    })
    .from(signals)
    .innerJoin(transcripts, eq(signals.sourceTranscriptId, transcripts.id))
    .where(
      and(
        eq(signals.workspaceId, workspaceId),
        eq(transcripts.callOutcome, "progressed"),
        sql`${signals.polarity} IN ('Extends', 'Reinforces')`
      )
    )
    .orderBy(desc(signals.lastReinforced))
    .limit(limit);
}

// ─── Competitor Intelligence (Module 5) ────────────────────────────

export async function getCompetitorIntelligence(workspaceId: string) {
  return db
    .select({
      competitorName: signals.competitorName,
      cnt: sql<number>`count(*)::int`,
      latestSignal: sql<string>`max(${signals.title})`,
    })
    .from(signals)
    .where(
      and(
        eq(signals.workspaceId, workspaceId),
        sql`${signals.competitorName} != ''`
      )
    )
    .groupBy(signals.competitorName)
    .orderBy(sql`count(*) DESC`);
}

// ─── ICP Fit Distribution (Module 6) ───────────────────────────────

export async function getICPDistribution(workspaceId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return db
    .select({
      segment: signals.segmentTagged,
      cnt: sql<number>`count(*)::int`,
    })
    .from(signals)
    .where(
      and(
        eq(signals.workspaceId, workspaceId),
        gte(signals.createdAt, thirtyDaysAgo),
        sql`${signals.segmentTagged} != ''`
      )
    )
    .groupBy(signals.segmentTagged);
}

// ─── Call Stats ────────────────────────────────────────────────────

export async function getCallStats(workspaceId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await db
    .select({
      total: sql<number>`count(*)::int`,
      progressed: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'progressed')::int`,
      stalled: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'stalled')::int`,
      lost: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'lost')::int`,
      recent: sql<number>`count(*) filter (where ${transcripts.createdAt} >= ${thirtyDaysAgo})::int`,
    })
    .from(transcripts)
    .where(eq(transcripts.workspaceId, workspaceId));

  return result[0] || { total: 0, progressed: 0, stalled: 0, lost: 0, recent: 0 };
}

// ─── Full Dashboard Payload ────────────────────────────────────────

export async function buildPMMDashboard(workspaceId: string) {
  const [drift, signalFeed, contested, enablement, compIntel, icpDist, stats] =
    await Promise.all([
      calculateDriftScore(workspaceId),
      getSignalFeed(workspaceId),
      getContestedSignals(workspaceId),
      getEnablementFeed(workspaceId),
      getCompetitorIntelligence(workspaceId),
      getICPDistribution(workspaceId),
      getCallStats(workspaceId),
    ]);

  return {
    drift,
    signalFeed,
    contested,
    enablement,
    compIntel,
    icpDist,
    stats,
  };
}
