export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth/session";
import { getCanonicalContext } from "@/lib/agents/canonical-context";
import { db } from "@/lib/db/client";
import { transcripts, signals, autoAnswers, soapNotes, approvedSignals, competitors } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, notInArray, sql, asc } from "drizzle-orm";
import Link from "next/link";
import FilterBar, { type FilterValues } from "./_components/FilterBar";
import { getOrCreateWorkspaceConfig, computeStage } from "@/lib/agents/workspace-config";
import { getActiveModuleIds } from "@/lib/agents/module-registry";

type Polarity = "Reinforces" | "Contradicts" | "Extends" | "Neutral";
type Tier = "suggestion" | "evolving" | "contested" | "concrete" | "archived" | "dismissed";

function parseFilters(sp: Record<string, string | string[] | undefined>): FilterValues {
  const win = String(sp.window || "30");
  const w: FilterValues["window"] = win === "7" || win === "90" || win === "all" ? win : "30";
  const out = String(sp.outcome || "all");
  const o: FilterValues["outcome"] =
    out === "progressed" || out === "stalled" || out === "lost" ? out : "all";
  return {
    window: w,
    competitor: String(sp.competitor || ""),
    segment: String(sp.segment || ""),
    outcome: o,
  };
}

function windowCutoff(w: FilterValues["window"]): Date | null {
  if (w === "all") return null;
  const days = Number(w);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) return null;

  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [ctx, data, wsConfig, stage] = await Promise.all([
    getCanonicalContext(session.workspaceId),
    loadDashboardData(session.workspaceId, filters),
    getOrCreateWorkspaceConfig(session.workspaceId),
    computeStage(session.workspaceId),
  ]);
  const pillars = ctx?.pillars ?? ["", "", ""];
  const hasCanonical = pillars.some((p) => p && p.trim().length > 0);

  // Compute which modules render based on focus areas + stage + overrides.
  // This is the platform-shape lever: the same dashboard renders differently
  // for an enablement PMM at PMF vs a positioning PMM at pre-PMF.
  const active = getActiveModuleIds(wsConfig.focusAreas, stage, wsConfig.moduleOverrides);

  const drift = computeDriftScore(data.polarityTotals);
  const pillarScores = [1, 2, 3].map((idx) =>
    computePillarScore(idx, pillars[idx - 1] || `Pillar ${idx} — not set`, data.polarityByPillar)
  );

  return (
    <div className="space-y-10 animate-fade-in-up">
      <header>
        <h1 className="text-xl font-bold tracking-tight">
          {ctx?.companyName ? `${ctx.companyName} · ` : ""}Positioning Intelligence
        </h1>
        <p className="text-xs text-[var(--color-atib-text-dim)] mt-1">
          Synthesised from {data.callCount} {data.callCount === 1 ? "transcript" : "transcripts"} ·
          {" "}{data.activeSignalCount} active signals
        </p>
      </header>

      <FilterBar
        values={filters}
        options={{
          competitors: data.filterOptions.competitors,
          segments: data.filterOptions.segments,
        }}
      />

      {active.has("hero") ? (
        <WhatChangedHero changes={data.whatChanged} window={filters.window} />
      ) : null}

      {active.has("drift_hero") ? (
        <DriftHero score={drift.score} reinforces={data.polarityTotals.reinforces}
                   contradicts={data.polarityTotals.contradicts} total={data.activeSignalCount} />
      ) : null}

      {!hasCanonical ? (
        <div className="glass-card p-4 border border-amber-500/30 bg-amber-500/[0.04]">
          <p className="text-sm text-amber-300">
            Canonical context isn&apos;t set yet — pillar lights, ICP, and competitor surfaces stay empty until it is.
          </p>
          <p className="mt-1 text-xs text-[var(--color-atib-text-dim)]">
            Fastest path:{" "}
            <Link href="/settings" className="underline">Settings → Import</Link>
            {" "}→ Seed canonical context (Refive or Flowace preset).
          </p>
        </div>
      ) : null}

      {active.has("pillars") ? <PillarLights pillars={pillarScores} /> : null}

      {active.has("icp") || active.has("blocker") ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {active.has("icp") ? (
            <IcpDistribution
              buckets={data.icpFromVerdict.buckets}
              total={data.icpFromVerdict.total}
              winRates={data.icpFromVerdict.winRates}
              trend={data.icpTrend}
              fallbackBuckets={data.icpBuckets}
              fallbackTotal={data.icpTotal}
            />
          ) : null}
          {active.has("blocker") ? (
            <BlockerDistribution
              buckets={data.blockerFromVerdict.buckets}
              total={data.blockerFromVerdict.total}
              fallbackBuckets={data.blockerBuckets}
              fallbackTotal={data.blockerTotal}
            />
          ) : null}
        </div>
      ) : null}

      {active.has("top_signals") ? <TopSignalsTable rows={data.topSignals} /> : null}

      {active.has("contested") ? (
        <ContestedQueue signals={data.contestedWithCanon} callCount={data.callCount} />
      ) : null}

      {active.has("auto_answers") ? <AutoAnswersQueue rows={data.autoAnswers} /> : null}

      {active.has("competitor") || active.has("benefits") ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {active.has("competitor") ? <CompetitorIntel rows={data.competitorStats} /> : null}
          {active.has("benefits") ? <TerminalBenefits rows={data.terminalBenefits} /> : null}
        </div>
      ) : null}

      {active.has("enablement") ? (
        <EnablementOpportunities rows={data.enablementSignals} progressedCount={data.outcomes.progressed} />
      ) : null}

      {active.has("interpretation") ? (
        <Interpretation
          ctx={{
            callCount: data.callCount,
            pillarScores: pillarScores.map((p) => ({ title: p.title, score: p.score })),
            topBlocker: pickTop(data.blockerBuckets),
            corePct: pctOrNull(data.icpBuckets.Core, data.icpTotal),
            contestedCount: data.contestedSignals.length,
          }}
        />
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * Data layer — every aggregation runs at the SQL layer and in parallel.
 * ────────────────────────────────────────────────────────────────────── */

async function loadDashboardData(workspaceId: string, filters: FilterValues) {
  const activeTier = sql`tier NOT IN ('archived', 'dismissed')`;
  const now = new Date();
  const last7Cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30Cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const prior30Cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const windowStart = windowCutoff(filters.window);

  // Compose filter clauses once, reuse across queries.
  const signalWindowClause = windowStart ? gte(signals.firstSeen, windowStart) : sql`true`;
  const callWindowClause = windowStart ? gte(transcripts.callDate, windowStart.toISOString().slice(0, 10)) : sql`true`;
  const competitorClause = filters.competitor
    ? sql`lower(${signals.competitorName}) = lower(${filters.competitor})`
    : sql`true`;
  const outcomeClause = filters.outcome !== "all"
    ? eq(transcripts.callOutcome, filters.outcome)
    : sql`true`;
  const segmentClause = filters.segment
    ? sql`lower(${soapNotes.segmentTagged}) = lower(${filters.segment})`
    : sql`true`;

  const [
    callStats,
    polarityTotalsRow,
    polarityByPillarRows,
    icpRows,
    icpTrendRows,
    icpFromVerdictRows,
    blockerVerdictRows,
    tierCounts,
    topSignals,
    contestedRows,
    competitorRows,
    competitorTrendRows,
    competitorWinLossRows,
    benefitRows,
    objectionRows,
    enablementRows,
    autoAnswerRows,
    newPainsCount,
    newCompetitorsCount,
    graduatedCount,
    contestedCount,
    distinctCompetitors,
    distinctSegments,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        progressed: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'progressed')::int`,
        stalled: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'stalled')::int`,
        lost: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'lost')::int`,
        unclear: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'unclear')::int`,
      })
      .from(transcripts)
      .where(and(eq(transcripts.workspaceId, workspaceId), callWindowClause, outcomeClause)),
    db
      .select({
        reinforces: sql<number>`count(*) filter (where ${signals.polarity} = 'Reinforces')::int`,
        contradicts: sql<number>`count(*) filter (where ${signals.polarity} = 'Contradicts')::int`,
        extends: sql<number>`count(*) filter (where ${signals.polarity} = 'Extends')::int`,
        neutral: sql<number>`count(*) filter (where ${signals.polarity} = 'Neutral')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(and(eq(signals.workspaceId, workspaceId), activeTier, signalWindowClause, competitorClause)),
    db
      .select({
        pillarTag: signals.pillarTag,
        reinforces: sql<number>`count(*) filter (where ${signals.polarity} = 'Reinforces')::int`,
        contradicts: sql<number>`count(*) filter (where ${signals.polarity} = 'Contradicts')::int`,
      })
      .from(signals)
      .where(and(
        eq(signals.workspaceId, workspaceId),
        activeTier,
        inArray(signals.pillarTag, [1, 2, 3]),
        signalWindowClause,
        competitorClause,
      ))
      .groupBy(signals.pillarTag),
    db
      .select({
        polarity: signals.polarity,
        count: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(and(
        eq(signals.workspaceId, workspaceId),
        activeTier,
        eq(signals.signalType, "ICP_signal"),
        signalWindowClause,
      ))
      .groupBy(signals.polarity),
    // ICP trend — last 30 days vs prior 30, so we can compute the drift delta the spec calls for.
    db
      .select({
        window: sql<"current" | "prior">`case when ${signals.firstSeen} >= ${last30Cutoff} then 'current' else 'prior' end`,
        polarity: signals.polarity,
        count: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, workspaceId),
          activeTier,
          eq(signals.signalType, "ICP_signal"),
          gte(signals.firstSeen, prior30Cutoff)
        )
      )
      .groupBy(sql`1`, signals.polarity),
    // NEW: ICP buckets from soap_notes.icp_verdict (v3.1 data) with win-rate per bucket
    db
      .select({
        verdict: soapNotes.icpVerdict,
        callCount: sql<number>`count(*)::int`,
        progressed: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'progressed')::int`,
      })
      .from(soapNotes)
      .innerJoin(transcripts, eq(soapNotes.transcriptId, transcripts.id))
      .where(and(
        eq(soapNotes.workspaceId, workspaceId),
        sql`${soapNotes.icpVerdict} <> ''`,
        callWindowClause,
        segmentClause,
      ))
      .groupBy(soapNotes.icpVerdict),
    // NEW: Blocker buckets from soap_notes.blocker_type (v3.1 data)
    db
      .select({
        blocker: soapNotes.blockerType,
        callCount: sql<number>`count(*)::int`,
      })
      .from(soapNotes)
      .innerJoin(transcripts, eq(soapNotes.transcriptId, transcripts.id))
      .where(and(
        eq(soapNotes.workspaceId, workspaceId),
        sql`${soapNotes.blockerType} <> ''`,
        callWindowClause,
        segmentClause,
        outcomeClause,
      ))
      .groupBy(soapNotes.blockerType),
    db
      .select({
        tier: signals.tier,
        count: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(eq(signals.workspaceId, workspaceId))
      .groupBy(signals.tier),
    db
      .select({
        id: signals.id,
        tier: signals.tier,
        signalType: signals.signalType,
        title: signals.title,
        verbatimQuote: signals.verbatimQuote,
        reinforcementCount: signals.reinforcementCount,
        firstSeen: signals.firstSeen,
        lastReinforced: signals.lastReinforced,
      })
      .from(signals)
      .where(and(
        eq(signals.workspaceId, workspaceId),
        notInArray(signals.tier, ["archived", "dismissed"]),
        signalWindowClause,
        competitorClause,
      ))
      .orderBy(desc(signals.reinforcementCount), desc(signals.lastReinforced))
      .limit(5),
    // NEW: Contested signals JOIN approvedSignals so we can render side-by-side
    db
      .select({
        id: signals.id,
        title: signals.title,
        verbatimQuote: signals.verbatimQuote,
        content: signals.content,
        firstSeen: signals.firstSeen,
        reinforcementCount: signals.reinforcementCount,
        sourceTranscriptId: signals.sourceTranscriptId,
        canonicalId: approvedSignals.id,
        canonicalTitle: approvedSignals.title,
        canonicalContent: approvedSignals.content,
        canonicalApprovedAt: approvedSignals.approvedAt,
      })
      .from(signals)
      .leftJoin(approvedSignals, eq(signals.contestedAgainst, approvedSignals.id))
      .where(
        and(
          eq(signals.workspaceId, workspaceId),
          sql`(${signals.tier} = 'contested' OR ${signals.canonicalContradiction} <> 'no')`
        )
      )
      .orderBy(asc(signals.firstSeen))
      .limit(20),
    // Competitor mentions ranked
    db
      .select({
        competitorName: signals.competitorName,
        count: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, workspaceId),
          activeTier,
          sql`${signals.competitorName} <> ''`,
          signalWindowClause,
        )
      )
      .groupBy(signals.competitorName)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    // NEW: Competitor mention trend (current window vs prior equivalent window)
    db
      .select({
        competitorName: signals.competitorName,
        window: sql<"current" | "prior">`case when ${signals.firstSeen} >= ${last30Cutoff} then 'current' else 'prior' end`,
        count: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(and(
        eq(signals.workspaceId, workspaceId),
        activeTier,
        sql`${signals.competitorName} <> ''`,
        gte(signals.firstSeen, prior30Cutoff),
      ))
      .groupBy(signals.competitorName, sql`2`),
    // NEW: Competitor → win/loss from joined transcripts
    db
      .select({
        competitorName: signals.competitorName,
        outcome: transcripts.callOutcome,
        count: sql<number>`count(distinct ${transcripts.id})::int`,
      })
      .from(signals)
      .innerJoin(transcripts, eq(signals.sourceTranscriptId, transcripts.id))
      .where(and(
        eq(signals.workspaceId, workspaceId),
        activeTier,
        sql`${signals.competitorName} <> ''`,
        callWindowClause,
      ))
      .groupBy(signals.competitorName, transcripts.callOutcome),
    db
      .select({
        id: signals.id,
        title: signals.title,
        verbatimQuote: signals.verbatimQuote,
        reinforcementCount: signals.reinforcementCount,
      })
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, workspaceId),
          activeTier,
          inArray(signals.signalType, ["use_case", "expansion_signal", "buying_trigger"]),
          signalWindowClause,
          competitorClause,
        )
      )
      .orderBy(desc(signals.reinforcementCount), desc(signals.lastReinforced))
      .limit(5),
    // Objection-style signals — keyword-bucket fallback for pre-v3.1 transcripts
    db
      .select({
        title: signals.title,
        content: signals.content,
        signalType: signals.signalType,
      })
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, workspaceId),
          activeTier,
          inArray(signals.signalType, ["objection", "pricing_signal", "churn_risk"]),
          signalWindowClause,
          competitorClause,
        )
      ),
    db
      .select({
        id: signals.id,
        title: signals.title,
        verbatimQuote: signals.verbatimQuote,
        reinforcementCount: signals.reinforcementCount,
        account: transcripts.prospectAccount,
        contact: transcripts.prospectContact,
        callOutcome: transcripts.callOutcome,
      })
      .from(signals)
      .innerJoin(transcripts, eq(signals.sourceTranscriptId, transcripts.id))
      .where(
        and(
          eq(signals.workspaceId, workspaceId),
          activeTier,
          eq(signals.polarity, "Reinforces"),
          eq(transcripts.callOutcome, "progressed"),
          callWindowClause,
        )
      )
      .orderBy(desc(signals.reinforcementCount), desc(signals.lastReinforced))
      .limit(6),
    // Auto-Answers Queue (Spec Module 4). Repeat questions worth a canonical answer.
    db
      .select({
        id: autoAnswers.id,
        question: autoAnswers.question,
        draftedAnswer: autoAnswers.draftedAnswer,
        frequency: autoAnswers.frequency,
        state: autoAnswers.state,
      })
      .from(autoAnswers)
      .where(
        and(
          eq(autoAnswers.workspaceId, workspaceId),
          notInArray(autoAnswers.state, ["dismissed", "approved"])
        )
      )
      .orderBy(desc(autoAnswers.frequency))
      .limit(5),
    // What-changed-this-week: counts only, no rows
    db
      .select({ count: sql<number>`count(distinct ${signals.title})::int` })
      .from(signals)
      .where(and(
        eq(signals.workspaceId, workspaceId),
        activeTier,
        eq(signals.signalType, "objection"),
        gte(signals.firstSeen, last7Cutoff),
        gte(signals.reinforcementCount, 2),
      )),
    db
      .select({ count: sql<number>`count(distinct ${signals.competitorName})::int` })
      .from(signals)
      .where(and(
        eq(signals.workspaceId, workspaceId),
        activeTier,
        eq(signals.signalType, "competitor_mention"),
        sql`${signals.competitorTagged} IS NULL`,
        sql`${signals.competitorName} <> ''`,
        gte(signals.firstSeen, last7Cutoff),
      )),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(signals)
      .where(and(
        eq(signals.workspaceId, workspaceId),
        eq(signals.tier, "concrete"),
        gte(signals.createdAt, last7Cutoff),
      )),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(signals)
      .where(and(
        eq(signals.workspaceId, workspaceId),
        eq(signals.tier, "contested"),
      )),
    // Filter options — distinct values for the dropdowns
    db
      .select({ name: competitors.name })
      .from(competitors)
      .where(eq(competitors.workspaceId, workspaceId))
      .orderBy(asc(competitors.name)),
    db
      .select({ segment: sql<string>`distinct ${soapNotes.segmentTagged}` })
      .from(soapNotes)
      .where(and(
        eq(soapNotes.workspaceId, workspaceId),
        sql`${soapNotes.segmentTagged} <> ''`,
      )),
    db
      .select({
        total: sql<number>`count(*)::int`,
        progressed: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'progressed')::int`,
        stalled: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'stalled')::int`,
        lost: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'lost')::int`,
        unclear: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'unclear')::int`,
      })
      .from(transcripts)
      .where(eq(transcripts.workspaceId, workspaceId)),
    db
      .select({
        reinforces: sql<number>`count(*) filter (where ${signals.polarity} = 'Reinforces')::int`,
        contradicts: sql<number>`count(*) filter (where ${signals.polarity} = 'Contradicts')::int`,
        extends: sql<number>`count(*) filter (where ${signals.polarity} = 'Extends')::int`,
        neutral: sql<number>`count(*) filter (where ${signals.polarity} = 'Neutral')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(and(eq(signals.workspaceId, workspaceId), activeTier)),
    db
      .select({
        pillarTag: signals.pillarTag,
        reinforces: sql<number>`count(*) filter (where ${signals.polarity} = 'Reinforces')::int`,
        contradicts: sql<number>`count(*) filter (where ${signals.polarity} = 'Contradicts')::int`,
      })
      .from(signals)
      .where(and(eq(signals.workspaceId, workspaceId), activeTier, inArray(signals.pillarTag, [1, 2, 3])))
      .groupBy(signals.pillarTag),
    db
      .select({
        polarity: signals.polarity,
        count: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(and(eq(signals.workspaceId, workspaceId), activeTier, eq(signals.signalType, "ICP_signal")))
      .groupBy(signals.polarity),
    // ICP trend — last 30 days vs prior 30, so we can compute the drift delta the spec calls for.
    db
      .select({
        window: sql<"current" | "prior">`case when ${signals.firstSeen} >= ${last30Cutoff} then 'current' else 'prior' end`,
        polarity: signals.polarity,
        count: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, workspaceId),
          activeTier,
          eq(signals.signalType, "ICP_signal"),
          gte(signals.firstSeen, prior30Cutoff)
        )
      )
      .groupBy(sql`1`, signals.polarity),
    db
      .select({
        tier: signals.tier,
        count: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(eq(signals.workspaceId, workspaceId))
      .groupBy(signals.tier),
    db
      .select({
        id: signals.id,
        tier: signals.tier,
        signalType: signals.signalType,
        title: signals.title,
        verbatimQuote: signals.verbatimQuote,
        reinforcementCount: signals.reinforcementCount,
        firstSeen: signals.firstSeen,
        lastReinforced: signals.lastReinforced,
      })
      .from(signals)
      .where(and(eq(signals.workspaceId, workspaceId), notInArray(signals.tier, ["archived", "dismissed"])))
      .orderBy(desc(signals.reinforcementCount), desc(signals.lastReinforced))
      .limit(5),
    db
      .select({
        id: signals.id,
        title: signals.title,
        verbatimQuote: signals.verbatimQuote,
        content: signals.content,
        sourceTranscriptId: signals.sourceTranscriptId,
      })
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, workspaceId),
          sql`(${signals.tier} = 'contested' OR ${signals.canonicalContradiction} <> 'no')`
        )
      )
      .limit(20),
    db
      .select({
        competitorName: signals.competitorName,
        count: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, workspaceId),
          activeTier,
          sql`${signals.competitorName} <> ''`
        )
      )
      .groupBy(signals.competitorName)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    db
      .select({
        id: signals.id,
        title: signals.title,
        verbatimQuote: signals.verbatimQuote,
        reinforcementCount: signals.reinforcementCount,
      })
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, workspaceId),
          activeTier,
          inArray(signals.signalType, ["use_case", "expansion_signal", "buying_trigger"])
        )
      )
      .orderBy(desc(signals.reinforcementCount), desc(signals.lastReinforced))
      .limit(5),
    // Objection-style signals — we bucket these in JS into Price/Trust/Timing/Product/Fit.
    db
      .select({
        title: signals.title,
        content: signals.content,
        signalType: signals.signalType,
      })
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, workspaceId),
          activeTier,
          inArray(signals.signalType, ["objection", "pricing_signal", "churn_risk"])
        )
      ),
    db
      .select({
        id: signals.id,
        title: signals.title,
        verbatimQuote: signals.verbatimQuote,
        reinforcementCount: signals.reinforcementCount,
        account: transcripts.prospectAccount,
        contact: transcripts.prospectContact,
        callOutcome: transcripts.callOutcome,
      })
      .from(signals)
      .innerJoin(transcripts, eq(signals.sourceTranscriptId, transcripts.id))
      .where(
        and(
          eq(signals.workspaceId, workspaceId),
          activeTier,
          eq(signals.polarity, "Reinforces"),
          eq(transcripts.callOutcome, "progressed")
        )
      )
      .orderBy(desc(signals.reinforcementCount), desc(signals.lastReinforced))
      .limit(6),
    // Auto-Answers Queue (Spec Module 4). Repeat questions worth a canonical answer.
    db
      .select({
        id: autoAnswers.id,
        question: autoAnswers.question,
        draftedAnswer: autoAnswers.draftedAnswer,
        frequency: autoAnswers.frequency,
        state: autoAnswers.state,
      })
      .from(autoAnswers)
      .where(
        and(
          eq(autoAnswers.workspaceId, workspaceId),
          notInArray(autoAnswers.state, ["dismissed", "approved"])
        )
      )
      .orderBy(desc(autoAnswers.frequency))
      .limit(5),
  ]);

  const polarityTotals = polarityTotalsRow[0] || {
    reinforces: 0, contradicts: 0, extends: 0, neutral: 0, total: 0,
  };
  const polarityByPillar = new Map(
    polarityByPillarRows.map((r) => [r.pillarTag, { reinforces: r.reinforces, contradicts: r.contradicts }])
  );

  const icpBuckets = bucketIcp(icpRows);
  const icpTotal = sumBucket(icpBuckets);

  // Compute ICP drift delta: Core share in last 30 days vs prior 30.
  const currentRows = icpTrendRows.filter((r) => r.window === "current");
  const priorRows = icpTrendRows.filter((r) => r.window === "prior");
  const currentBuckets = bucketIcp(currentRows);
  const priorBuckets = bucketIcp(priorRows);
  const currentTotal = sumBucket(currentBuckets);
  const priorTotal = sumBucket(priorBuckets);
  const icpTrend = {
    currentCorePct: currentTotal === 0 ? null : Math.round((currentBuckets.Core / currentTotal) * 100),
    priorCorePct: priorTotal === 0 ? null : Math.round((priorBuckets.Core / priorTotal) * 100),
    currentTotal,
    priorTotal,
  };

  const { buckets: blockerBuckets, total: blockerTotal } = bucketBlockers(
    objectionRows,
    callStats[0]?.progressed ?? 0
  );

  // ICP from verdict (v3.1 data path)
  const icpVerdictBuckets: Record<"Core" | "Adjacent" | "Outside" | "Unclear", number> = {
    Core: 0, Adjacent: 0, Outside: 0, Unclear: 0,
  };
  const icpVerdictWinRates: Record<string, { progressed: number; total: number }> = {
    Core: { progressed: 0, total: 0 },
    Adjacent: { progressed: 0, total: 0 },
    Outside: { progressed: 0, total: 0 },
    Unclear: { progressed: 0, total: 0 },
  };
  for (const r of icpFromVerdictRows) {
    const bucket = mapIcpVerdictToBucket(r.verdict);
    icpVerdictBuckets[bucket] += r.callCount;
    icpVerdictWinRates[bucket].total += r.callCount;
    icpVerdictWinRates[bucket].progressed += r.progressed;
  }
  const icpVerdictTotal = sumBucket(icpVerdictBuckets);

  // Blocker from verdict (v3.1 data path)
  const blockerVerdictBuckets: Record<"Price" | "Trust" | "Timing" | "Product" | "Fit" | "Not Blocked", number> = {
    Price: 0, Trust: 0, Timing: 0, Product: 0, Fit: 0, "Not Blocked": 0,
  };
  for (const r of blockerVerdictRows) {
    const bucket = mapBlockerVerdictToBucket(r.blocker);
    blockerVerdictBuckets[bucket] += r.callCount;
  }
  const blockerVerdictTotal = sumBucket(blockerVerdictBuckets);

  // Competitor expanded stats: mention share + win rate + trend
  const competitorStats = buildCompetitorStats(
    competitorRows,
    competitorTrendRows,
    competitorWinLossRows
  );

  return {
    callCount: callStats[0]?.total ?? 0,
    outcomes: {
      progressed: callStats[0]?.progressed ?? 0,
      stalled: callStats[0]?.stalled ?? 0,
      lost: callStats[0]?.lost ?? 0,
      unclear: callStats[0]?.unclear ?? 0,
    },
    activeSignalCount: polarityTotals.total,
    polarityTotals,
    polarityByPillar,
    icpBuckets,
    icpTotal,
    icpFromVerdict: {
      buckets: icpVerdictBuckets,
      total: icpVerdictTotal,
      winRates: icpVerdictWinRates,
    },
    blockerFromVerdict: {
      buckets: blockerVerdictBuckets,
      total: blockerVerdictTotal,
    },
    tierCounts: tierCounts.reduce<Record<string, number>>((acc, r) => {
      acc[r.tier] = r.count;
      return acc;
    }, {}),
    topSignals,
    contestedSignals: contestedRows,
    contestedWithCanon: contestedRows,
    competitorRows,
    competitorStats,
    terminalBenefits: benefitRows,
    blockerBuckets,
    blockerTotal,
    enablementSignals: enablementRows,
    autoAnswers: autoAnswerRows,
    icpTrend,
    whatChanged: {
      newPains: newPainsCount[0]?.count ?? 0,
      newCompetitors: newCompetitorsCount[0]?.count ?? 0,
      graduated: graduatedCount[0]?.count ?? 0,
      contestedUnresolved: contestedCount[0]?.count ?? 0,
    },
    filterOptions: {
      competitors: distinctCompetitors.map((r) => r.name),
      segments: distinctSegments.map((r) => r.segment).filter(Boolean),
    },
  };
}

function mapIcpVerdictToBucket(verdict: string): "Core" | "Adjacent" | "Outside" | "Unclear" {
  const v = verdict.toLowerCase();
  if (v.startsWith("core")) return "Core";
  if (v.startsWith("adjacent")) return "Adjacent";
  if (v.startsWith("outside")) return "Outside";
  return "Unclear";
}

function mapBlockerVerdictToBucket(b: string): "Price" | "Trust" | "Timing" | "Product" | "Fit" | "Not Blocked" {
  const v = b.toLowerCase();
  if (v === "price") return "Price";
  if (v === "trust") return "Trust";
  if (v === "timing") return "Timing";
  if (v === "product") return "Product";
  if (v === "fit") return "Fit";
  return "Not Blocked";
}

function buildCompetitorStats(
  mentionRows: { competitorName: string; count: number }[],
  trendRows: { competitorName: string; window: "current" | "prior"; count: number }[],
  winLossRows: { competitorName: string; outcome: string; count: number }[]
) {
  const totalMentions = mentionRows.reduce((a, b) => a + b.count, 0) || 1;
  return mentionRows.map((m) => {
    const current = trendRows.find((t) => t.competitorName === m.competitorName && t.window === "current")?.count ?? 0;
    const prior = trendRows.find((t) => t.competitorName === m.competitorName && t.window === "prior")?.count ?? 0;
    const trendDelta = current - prior;
    const winsRow = winLossRows.find((w) => w.competitorName === m.competitorName && w.outcome === "progressed");
    const lossesRow = winLossRows.find((w) => w.competitorName === m.competitorName && w.outcome === "lost");
    const wins = winsRow?.count ?? 0;
    const losses = lossesRow?.count ?? 0;
    const decided = wins + losses;
    const winRate = decided === 0 ? null : Math.round((wins / decided) * 100);
    return {
      name: m.competitorName,
      mentions: m.count,
      sharePct: Math.round((m.count / totalMentions) * 100),
      trendDelta,
      wins,
      losses,
      winRate,
    };
  });
}

/* ──────────────────────────────────────────────────────────────────────
 * Derivations
 * ────────────────────────────────────────────────────────────────────── */

function computeDriftScore(polarityTotals: {
  reinforces: number;
  contradicts: number;
  total: number;
}) {
  if (polarityTotals.total === 0) {
    return { score: null as number | null, label: "Not enough data", tone: "muted" as const };
  }
  const raw = (polarityTotals.reinforces - polarityTotals.contradicts) / polarityTotals.total;
  // Map [-1, 1] → [0, 100]
  const score = Math.max(0, Math.min(100, Math.round(50 + raw * 50)));
  return { score, label: interpretDrift(score), tone: toneForDrift(score) };
}

function interpretDrift(score: number) {
  if (score >= 70) return "Positioning is landing";
  if (score >= 40) return "Market is testing the canon";
  return "Significant drift detected";
}

function toneForDrift(score: number) {
  if (score >= 70) return "ok" as const;
  if (score >= 40) return "warn" as const;
  return "danger" as const;
}

function computePillarScore(
  idx: number,
  title: string,
  byPillar: Map<number, { reinforces: number; contradicts: number }>
) {
  const row = byPillar.get(idx);
  const reinforces = row?.reinforces ?? 0;
  const contradicts = row?.contradicts ?? 0;
  const denom = reinforces + contradicts;
  const score = denom === 0 ? null : Math.round((reinforces / denom) * 100);
  return { idx, title, reinforces, contradicts, score };
}

function bucketIcp(rows: { polarity: Polarity; count: number }[]) {
  const buckets: Record<"Core" | "Adjacent" | "Outside" | "Unclear", number> = {
    Core: 0, Adjacent: 0, Outside: 0, Unclear: 0,
  };
  for (const r of rows) {
    if (r.polarity === "Reinforces") buckets.Core += r.count;
    else if (r.polarity === "Extends") buckets.Adjacent += r.count;
    else if (r.polarity === "Contradicts") buckets.Outside += r.count;
    else buckets.Unclear += r.count;
  }
  return buckets;
}

function bucketBlockers(
  rows: { title: string; content: string; signalType: string }[],
  progressedCalls: number
) {
  const buckets: Record<"Price" | "Trust" | "Timing" | "Product" | "Fit" | "Not Blocked", number> = {
    Price: 0, Trust: 0, Timing: 0, Product: 0, Fit: 0, "Not Blocked": progressedCalls,
  };
  for (const r of rows) {
    const text = `${r.title} ${r.content}`.toLowerCase();
    if (r.signalType === "pricing_signal" || /\bprice|\bpricing|\bcost\b|budget|cfo|tco|payback|seat-based|per-store/.test(text)) {
      buckets.Price += 1;
    } else if (/\btrust|security|data residency|privacy|gdpr|sovereignty|soc|iso|monitored|spyware/.test(text)) {
      buckets.Trust += 1;
    } else if (/\btiming|freeze|q[1-4]\b|roadmap|migration|next year|18 months|defer|postpone|hold/.test(text)) {
      buckets.Timing += 1;
    } else if (/feature|integration|pos|whatsapp|webhook|api|technical|build-it|build-vs-buy|custom build|in-house/.test(text)) {
      buckets.Product += 1;
    } else if (/icp|fit|loyalty|too transactional|status[\s-]?quo|adjacent|persona/.test(text)) {
      buckets.Fit += 1;
    } else {
      buckets.Product += 1;
    }
  }
  const total = Object.values(buckets).reduce((a, b) => a + b, 0);
  return { buckets, total };
}

function sumBucket(buckets: Record<string, number>) {
  return Object.values(buckets).reduce((a, b) => a + b, 0);
}

function pickTop(buckets: Record<string, number>) {
  let topKey = "";
  let topVal = -1;
  for (const [k, v] of Object.entries(buckets)) {
    if (v > topVal) { topKey = k; topVal = v; }
  }
  return { key: topKey, value: topVal };
}

function pctOrNull(value: number, total: number) {
  if (total === 0) return null;
  return Math.round((value / total) * 100);
}

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

/* ──────────────────────────────────────────────────────────────────────
 * Sections
 * ────────────────────────────────────────────────────────────────────── */

function SectionShell({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-atib-text-muted)]">
            {title}
          </h2>
          {hint ? <p className="text-xs text-[var(--color-atib-text-dim)] mt-1">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function DriftHero({
  score, reinforces, contradicts, total,
}: { score: number | null; reinforces: number; contradicts: number; total: number }) {
  if (score === null) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-atib-text-dim)]">
          Positioning–Market Drift
        </p>
        <p className="mt-6 text-4xl font-bold text-[var(--color-atib-text-muted)]">—</p>
        <p className="mt-3 text-sm text-[var(--color-atib-text-muted)]">
          Drift score appears once at least one transcript is ingested.
        </p>
      </div>
    );
  }
  const tone = toneForDrift(score);
  const toneClass =
    tone === "ok" ? "text-emerald-400"
    : tone === "warn" ? "text-amber-400"
    : "text-rose-400";
  return (
    <div className="glass-card p-8 text-center">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-atib-text-dim)]">
        Positioning–Market Drift
      </p>
      <p className={`mt-4 text-7xl font-bold ${toneClass} leading-none`}>{score}<span className="text-3xl text-[var(--color-atib-text-dim)]">/100</span></p>
      <p className="mt-4 text-base text-[var(--color-atib-text)]">{interpretDrift(score)}</p>
      <p className="mt-2 text-xs text-[var(--color-atib-text-dim)]">
        {reinforces} reinforcing · {contradicts} contradicting · {total} active signals
      </p>
    </div>
  );
}

function PillarLights({
  pillars,
}: {
  pillars: { idx: number; title: string; reinforces: number; contradicts: number; score: number | null }[];
}) {
  return (
    <SectionShell title="Pillar Traffic Lights" hint="How each canonical pillar is landing in live calls">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {pillars.map((p) => {
          const tone =
            p.score === null ? "muted"
            : p.score >= 70 ? "ok"
            : p.score >= 40 ? "warn"
            : "danger";
          const toneClass =
            tone === "ok" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
            : tone === "warn" ? "text-amber-400 border-amber-500/30 bg-amber-500/5"
            : tone === "danger" ? "text-rose-400 border-rose-500/30 bg-rose-500/5"
            : "text-[var(--color-atib-text-muted)] border-white/10 bg-white/[0.02]";
          return (
            <div key={p.idx} className={`rounded-2xl border p-5 ${toneClass}`}>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-atib-text-dim)]">
                Pillar {p.idx}
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--color-atib-text)] line-clamp-2 min-h-[2.5rem]">
                {p.title}
              </p>
              <p className="mt-4 text-4xl font-bold leading-none">
                {p.score === null ? "—" : p.score}
                {p.score !== null ? <span className="text-xl text-[var(--color-atib-text-dim)]">/100</span> : null}
              </p>
              <p className="mt-2 text-xs text-[var(--color-atib-text-dim)]">
                Reinforced {p.reinforces}× · Contradicted {p.contradicts}×
              </p>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

function HorizontalBars({
  rows,
  total,
  emptyLabel,
}: {
  rows: { label: string; count: number }[];
  total: number;
  emptyLabel: string;
}) {
  if (total === 0) {
    return <p className="text-xs text-[var(--color-atib-text-dim)]">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = Math.round((r.count / total) * 100);
        return (
          <div key={r.label}>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--color-atib-text-muted)]">{r.label}</span>
              <span className="text-[var(--color-atib-text-dim)] tabular-nums">{r.count} · {pct}%</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className="h-full bg-[var(--color-atib-accent)]/70"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IcpDistribution({
  buckets, total, winRates, trend, fallbackBuckets, fallbackTotal,
}: {
  buckets: Record<string, number>;
  total: number;
  winRates: Record<string, { progressed: number; total: number }>;
  trend: { currentCorePct: number | null; priorCorePct: number | null; currentTotal: number; priorTotal: number };
  fallbackBuckets: Record<string, number>;
  fallbackTotal: number;
}) {
  // Prefer v3.1 verdict data when present. Fall back to signal-polarity bucketing
  // for workspaces that haven't re-processed their transcripts yet.
  const useFallback = total === 0 && fallbackTotal > 0;
  const activeBuckets = useFallback ? fallbackBuckets : buckets;
  const activeTotal = useFallback ? fallbackTotal : total;

  const rows = (["Core", "Adjacent", "Outside", "Unclear"] as const).map((label) => ({
    label, count: activeBuckets[label] ?? 0,
  }));

  let alert: { tone: "danger" | "warn" | "ok"; text: string } | null = null;
  if (trend.currentCorePct !== null && trend.priorCorePct !== null && trend.currentTotal >= 3 && trend.priorTotal >= 3) {
    const delta = trend.currentCorePct - trend.priorCorePct;
    if (delta <= -10) {
      alert = { tone: "danger", text: `ICP drift detected. ${trend.currentCorePct}% Core in recent window vs ${trend.priorCorePct}% prior.` };
    } else if (delta >= 10) {
      alert = { tone: "ok", text: `ICP fit improving. Core share rose from ${trend.priorCorePct}% to ${trend.currentCorePct}%.` };
    } else {
      alert = { tone: "warn", text: `ICP fit stable. ${trend.currentCorePct}% Core this window, ${trend.priorCorePct}% prior.` };
    }
  }

  return (
    <SectionShell
      title="ICP Fit Distribution"
      hint={useFallback
        ? "Derived from ICP signal polarity (pre-v3.1 fallback)"
        : "Per-call verdict with progression rate"}
    >
      <div className="glass-card p-5 space-y-4">
        <HorizontalBars rows={rows} total={activeTotal} emptyLabel="No ICP verdicts captured yet." />
        {!useFallback && activeTotal > 0 ? (
          <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-4 gap-2 text-xs">
            {(["Core", "Adjacent", "Outside", "Unclear"] as const).map((label) => {
              const wr = winRates[label];
              const pct = wr.total === 0 ? null : Math.round((wr.progressed / wr.total) * 100);
              return (
                <div key={label} className="text-center">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-atib-text-dim)]">{label}</p>
                  <p className="mt-1 text-sm font-medium text-[var(--color-atib-text)] tabular-nums">
                    {pct === null ? "—" : `${pct}%`}
                  </p>
                  <p className="text-[10px] text-[var(--color-atib-text-dim)]">progression rate</p>
                </div>
              );
            })}
          </div>
        ) : null}
        {alert ? (
          <p className={
            alert.tone === "danger" ? "text-xs text-rose-400"
            : alert.tone === "ok" ? "text-xs text-emerald-400"
            : "text-xs text-[var(--color-atib-text-dim)]"
          }>
            {alert.text}
          </p>
        ) : null}
      </div>
    </SectionShell>
  );
}

function AutoAnswersQueue({
  rows,
}: {
  rows: Array<{ id: string; question: string; draftedAnswer: string; frequency: number; state: string }>;
}) {
  return (
    <SectionShell title="Auto-Answers Queue" hint="Questions repeating across calls — candidates for canonical answers">
      {rows.length === 0 ? (
        <div className="glass-card p-5">
          <p className="text-xs text-[var(--color-atib-text-dim)]">
            Surfaces once the same question shows up across 3+ calls. Re-process transcripts to refresh.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <ul className="divide-y divide-white/5">
            {rows.map((r) => (
              <li key={r.id} className="px-5 py-4 flex items-start gap-4">
                <span className="shrink-0 inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 rounded-full text-xs tabular-nums bg-[var(--color-atib-accent)]/15 text-[var(--color-atib-accent)] border border-[var(--color-atib-accent)]/30">
                  ×{r.frequency}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--color-atib-text)]">{r.question}</p>
                  {r.draftedAnswer ? (
                    <p className="mt-1 text-xs text-[var(--color-atib-text-dim)] line-clamp-2">
                      Draft answer: {r.draftedAnswer}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-[var(--color-atib-text-dim)] italic">
                      No draft answer yet.
                    </p>
                  )}
                </div>
                <Link
                  href="/auto-answers"
                  className="shrink-0 text-xs underline underline-offset-2 text-[var(--color-atib-text-dim)] hover:text-[var(--color-atib-text)]"
                >
                  Review →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionShell>
  );
}

function BlockerDistribution({
  buckets, total, fallbackBuckets, fallbackTotal,
}: {
  buckets: Record<string, number>;
  total: number;
  fallbackBuckets: Record<string, number>;
  fallbackTotal: number;
}) {
  const useFallback = total === 0 && fallbackTotal > 0;
  const activeBuckets = useFallback ? fallbackBuckets : buckets;
  const activeTotal = useFallback ? fallbackTotal : total;
  const order = ["Price", "Trust", "Timing", "Product", "Fit", "Not Blocked"] as const;
  const rows = order.map((label) => ({ label, count: activeBuckets[label] ?? 0 }));
  return (
    <SectionShell
      title="Real Blocker Distribution"
      hint={useFallback
        ? "Keyword-bucketed from objection signals (pre-v3.1 fallback)"
        : "Per-call SOAP Assessment verdict"}
    >
      <div className="glass-card p-5">
        <HorizontalBars rows={rows} total={activeTotal} emptyLabel="No blockers detected yet." />
      </div>
    </SectionShell>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  const cls =
    tier === "concrete" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
    : tier === "evolving" ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
    : tier === "contested" ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
    : tier === "suggestion" ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
    : "bg-white/5 text-[var(--color-atib-text-dim)] border-white/10";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${cls}`}>
      {tier}
    </span>
  );
}

function TopSignalsTable({
  rows,
}: {
  rows: Array<{
    id: string; tier: Tier; signalType: string; title: string; verbatimQuote: string;
    reinforcementCount: number; firstSeen: Date | string | null; lastReinforced: Date | string | null;
  }>;
}) {
  return (
    <SectionShell
      title="Top Recurring Signals"
      hint="Top 5 by reinforcement count and recency"
      action={<Link href="/signals" className="text-xs underline underline-offset-2 text-[var(--color-atib-text-dim)] hover:text-[var(--color-atib-text)]">View all →</Link>}
    >
      <div className="glass-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[10px] uppercase tracking-[0.12em] text-[var(--color-atib-text-dim)] border-b border-white/5">
            <tr>
              <th className="px-4 py-3 font-medium">Tier</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Verbatim</th>
              <th className="px-4 py-3 font-medium text-right">Count</th>
              <th className="px-4 py-3 font-medium">First Seen</th>
              <th className="px-4 py-3 font-medium">Last Seen</th>
            </tr>
          </thead>
          <tbody className="text-[var(--color-atib-text-muted)]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-atib-text-dim)]">
                  Signals appear here as transcripts are processed.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5 align-top">
                  <td className="px-4 py-3"><TierBadge tier={r.tier as Tier} /></td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.signalType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 max-w-md">
                    <div className="font-medium text-[var(--color-atib-text)]">{r.title}</div>
                    {r.verbatimQuote ? (
                      <div className="mt-1 italic text-[11px] text-[var(--color-atib-text-dim)] line-clamp-2">
                        “{r.verbatimQuote}”
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.reinforcementCount}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-[var(--color-atib-text-dim)]">
                    {fmtDate(r.firstSeen)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-[var(--color-atib-text-dim)]">
                    {fmtDate(r.lastReinforced)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
}

function daysOld(d: Date | string | null): number {
  if (!d) return 0;
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return 0;
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function ContestedQueue({
  signals: contested, callCount,
}: {
  signals: Array<{
    id: string;
    title: string;
    verbatimQuote: string;
    content: string;
    firstSeen: Date | string | null;
    reinforcementCount: number;
    sourceTranscriptId: string | null;
    canonicalId: string | null;
    canonicalTitle: string | null;
    canonicalContent: string | null;
    canonicalApprovedAt: Date | string | null;
  }>;
  callCount: number;
}) {
  // Hard lock: any contested signal past 30 days locks the module per thesis Part E.
  const expired = contested.filter((s) => daysOld(s.firstSeen) >= 30);
  const showLockBanner = expired.length > 0;

  return (
    <SectionShell
      title="Contested Queue"
      hint={contested.length === 0
        ? "Signals contradicting canonical positioning"
        : `${contested.length} requires PMM review · 30-day hard limit per Part E`}
    >
      {showLockBanner ? (
        <div className="glass-card p-4 mb-3 border border-rose-500/40 bg-rose-500/[0.06]">
          <p className="text-sm text-rose-300 font-medium">
            Dashboard lock: {expired.length} contested signal{expired.length === 1 ? " has" : "s have"} exceeded 30 days.
          </p>
          <p className="mt-1 text-xs text-[var(--color-atib-text-dim)]">
            Resolve in favour of canonical or new before other intelligence modules read as trustworthy.
          </p>
        </div>
      ) : null}

      {contested.length === 0 ? (
        <div className="glass-card p-5">
          <p className="text-sm text-[var(--color-atib-text-muted)]">
            No contradictions detected across {callCount} {callCount === 1 ? "call" : "calls"}.
          </p>
          <p className="mt-1 text-xs text-[var(--color-atib-text-dim)]">
            This read is meaningful only above 15 calls. Below that, treat as &ldquo;too early to tell&rdquo; rather than &ldquo;canon holds&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {contested.map((s) => {
            const age = daysOld(s.firstSeen);
            const isExpired = age >= 30;
            return (
              <div
                key={s.id}
                className={`glass-card p-5 border ${isExpired ? "border-rose-500/50 bg-rose-500/[0.05]" : "border-rose-500/20 bg-rose-500/[0.03]"}`}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border bg-rose-500/15 text-rose-300 border-rose-500/30">
                    Requires PMM review
                  </span>
                  <span className={`text-[10px] uppercase tracking-wider ${isExpired ? "text-rose-400" : "text-[var(--color-atib-text-dim)]"}`}>
                    {age} day{age === 1 ? "" : "s"} unresolved · {s.reinforcementCount} reinforced
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="lg:pr-4 lg:border-r border-white/5">
                    <p className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">Canonical (concrete)</p>
                    {s.canonicalTitle ? (
                      <>
                        <p className="text-sm font-medium text-[var(--color-atib-text)]">{s.canonicalTitle}</p>
                        <p className="mt-1 text-xs text-[var(--color-atib-text-muted)]">{s.canonicalContent}</p>
                        <p className="mt-2 text-[10px] text-[var(--color-atib-text-dim)]">
                          Approved {fmtDate(s.canonicalApprovedAt)}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-[var(--color-atib-text-dim)] italic">
                        Contradiction declared by the SOAP agent but no specific Concrete signal was named.
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-rose-400 mb-1">New (contested)</p>
                    <p className="text-sm font-medium text-[var(--color-atib-text)]">{s.title}</p>
                    {s.verbatimQuote ? (
                      <p className="mt-1 italic text-xs text-[var(--color-atib-text-dim)]">&ldquo;{s.verbatimQuote}&rdquo;</p>
                    ) : null}
                    <p className="mt-2 text-xs text-[var(--color-atib-text-muted)]">{s.content}</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap gap-2">
                  <form action={`/api/signals/${s.id}/dismiss`} method="POST">
                    <button
                      type="submit"
                      className="inline-flex items-center px-3 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs hover:bg-emerald-500/20"
                    >
                      Accept canonical
                    </button>
                  </form>
                  <form action={`/api/signals/${s.id}/approve`} method="POST">
                    <button
                      type="submit"
                      className="inline-flex items-center px-3 py-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs hover:bg-rose-500/20"
                    >
                      Accept new
                    </button>
                  </form>
                  {s.sourceTranscriptId ? (
                    <Link
                      href={`/calls/${s.sourceTranscriptId}`}
                      className="ml-auto inline-flex items-center text-xs underline underline-offset-2 text-[var(--color-atib-text-dim)] hover:text-[var(--color-atib-text)]"
                    >
                      View source call →
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionShell>
  );
}

function CompetitorIntel({
  rows,
}: {
  rows: Array<{
    name: string;
    mentions: number;
    sharePct: number;
    trendDelta: number;
    wins: number;
    losses: number;
    winRate: number | null;
  }>;
}) {
  return (
    <SectionShell title="Competitor Intelligence" hint="Mention share, win rate vs each competitor, 30-day trend">
      <div className="glass-card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-5">
            <p className="text-xs text-[var(--color-atib-text-dim)]">No competitor mentions in this window.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-[0.12em] text-[var(--color-atib-text-dim)] border-b border-white/5">
              <tr>
                <th className="px-4 py-3 font-medium">Competitor</th>
                <th className="px-4 py-3 font-medium text-right">Mentions</th>
                <th className="px-4 py-3 font-medium text-right">Share</th>
                <th className="px-4 py-3 font-medium text-right">Trend</th>
                <th className="px-4 py-3 font-medium text-right">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const trendArrow =
                  r.trendDelta > 0 ? "▲" : r.trendDelta < 0 ? "▼" : "—";
                const trendClass =
                  r.trendDelta > 2 ? "text-rose-400"
                  : r.trendDelta < -2 ? "text-emerald-400"
                  : "text-[var(--color-atib-text-dim)]";
                return (
                  <tr key={r.name} className="border-t border-white/5">
                    <td className="px-4 py-3 font-medium text-[var(--color-atib-text)]">{r.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.mentions}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--color-atib-text-muted)]">
                      {r.sharePct}%
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${trendClass}`}>
                      {trendArrow} {Math.abs(r.trendDelta) || ""}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.winRate === null ? (
                        <span className="text-[var(--color-atib-text-dim)]">—</span>
                      ) : (
                        <span className={r.winRate >= 50 ? "text-emerald-400" : r.winRate <= 30 ? "text-rose-400" : "text-[var(--color-atib-text)]"}>
                          {r.winRate}%
                        </span>
                      )}
                      {r.wins + r.losses > 0 ? (
                        <span className="ml-1 text-[10px] text-[var(--color-atib-text-dim)]">
                          ({r.wins}W·{r.losses}L)
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </SectionShell>
  );
}

function WhatChangedHero({
  changes, window,
}: {
  changes: {
    newPains: number;
    newCompetitors: number;
    graduated: number;
    contestedUnresolved: number;
  };
  window: FilterValues["window"];
}) {
  const total =
    changes.newPains + changes.newCompetitors + changes.graduated + changes.contestedUnresolved;
  const isQuiet = total === 0;
  return (
    <SectionShell
      title="What changed this week"
      hint={window === "all" ? "Rolling 7-day emergence window (filter ignores 'All time')" : "Rolling 7-day emergence window"}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ChangeTile
          label="New pains"
          count={changes.newPains}
          tone="warn"
          hint="Objection-type signals first seen in last 7d with 2+ reinforcements"
        />
        <ChangeTile
          label="New competitors"
          count={changes.newCompetitors}
          tone="warn"
          hint="Untracked vendors named in the last 7d"
        />
        <ChangeTile
          label="Graduated to concrete"
          count={changes.graduated}
          tone="ok"
          hint="Signals PMM approved as canonical in the last 7d"
        />
        <ChangeTile
          label="Contested unresolved"
          count={changes.contestedUnresolved}
          tone={changes.contestedUnresolved > 0 ? "danger" : "muted"}
          hint="Awaiting PMM resolution"
        />
      </div>
      {isQuiet ? (
        <p className="text-xs text-[var(--color-atib-text-dim)] mt-3 px-1">
          Quiet week — nothing has crossed the emergence threshold. This is meaningful only above 15 calls; below that it&rsquo;s &ldquo;not enough data&rdquo; not &ldquo;market is stable&rdquo;.
        </p>
      ) : null}
    </SectionShell>
  );
}

function ChangeTile({
  label, count, tone, hint,
}: {
  label: string;
  count: number;
  tone: "warn" | "ok" | "danger" | "muted";
  hint: string;
}) {
  const toneClass =
    tone === "ok" ? "border-emerald-500/30 bg-emerald-500/5"
    : tone === "warn" ? "border-amber-500/30 bg-amber-500/5"
    : tone === "danger" ? "border-rose-500/30 bg-rose-500/5"
    : "border-white/10 bg-white/[0.02]";
  const numberClass =
    tone === "ok" ? "text-emerald-400"
    : tone === "warn" ? "text-amber-400"
    : tone === "danger" ? "text-rose-400"
    : "text-[var(--color-atib-text-muted)]";
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-atib-text-dim)]">{label}</p>
      <p className={`mt-2 text-3xl font-bold leading-none ${numberClass}`}>{count}</p>
      <p className="mt-2 text-[10px] text-[var(--color-atib-text-dim)] leading-snug">{hint}</p>
    </div>
  );
}

function TerminalBenefits({
  rows,
}: {
  rows: { id: string; title: string; verbatimQuote: string; reinforcementCount: number }[];
}) {
  return (
    <SectionShell title="Terminal Benefit Themes" hint="Outcomes prospects ask for, by reinforcement">
      <div className="glass-card p-5">
        {rows.length === 0 ? (
          <p className="text-xs text-[var(--color-atib-text-dim)]">
            Benefit themes appear once use-case or expansion signals are captured.
          </p>
        ) : (
          <ol className="space-y-3">
            {rows.map((r, i) => (
              <li key={r.id} className="flex items-start gap-3">
                <span className="shrink-0 w-6 text-right tabular-nums text-[var(--color-atib-text-dim)] text-xs pt-0.5">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--color-atib-text)]">{r.title}</p>
                  {r.verbatimQuote ? (
                    <p className="mt-0.5 italic text-[11px] text-[var(--color-atib-text-dim)] line-clamp-2">
                      “{r.verbatimQuote}”
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-[var(--color-atib-text-dim)] pt-0.5">
                  ×{r.reinforcementCount}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </SectionShell>
  );
}

function EnablementOpportunities({
  rows, progressedCount,
}: {
  rows: Array<{
    id: string; title: string; verbatimQuote: string; reinforcementCount: number;
    account: string; contact: string; callOutcome: string;
  }>;
  progressedCount: number;
}) {
  return (
    <SectionShell title="Enablement Opportunities" hint="Rep language from progressed deals — candidates for canonical messaging">
      {rows.length === 0 ? (
        <div className="glass-card p-5">
          <p className="text-xs text-[var(--color-atib-text-dim)]">
            {progressedCount < 3
              ? `Surfaces once you have 3+ progressed deals with positive-polarity rep language. (${progressedCount} progressed so far.)`
              : "No positive-polarity signals yet from progressed deals. Re-process recent transcripts to refresh."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-atib-text)]">{r.title}</p>
                  {r.verbatimQuote ? (
                    <p className="mt-1 italic text-xs text-[var(--color-atib-text-dim)]">
                      “{r.verbatimQuote}”
                    </p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-[var(--color-atib-text-dim)]">
                    Used at {r.account || "—"}{r.contact ? ` · ${r.contact}` : ""} · in {r.reinforcementCount} reinforced call{r.reinforcementCount === 1 ? "" : "s"}
                  </p>
                </div>
                <form action={`/api/signals/${r.id}/approve`} method="POST">
                  <button
                    type="submit"
                    className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-md border border-[var(--color-atib-accent)]/40 bg-[var(--color-atib-accent)]/10 text-[var(--color-atib-accent)] text-xs hover:bg-[var(--color-atib-accent)]/20"
                  >
                    Promote to canonical
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function Interpretation({
  ctx,
}: {
  ctx: {
    callCount: number;
    pillarScores: { title: string; score: number | null }[];
    topBlocker: { key: string; value: number };
    corePct: number | null;
    contestedCount: number;
  };
}) {
  const known = ctx.pillarScores.filter((p) => p.score !== null) as { title: string; score: number }[];
  const softSpot = known.length > 0
    ? known.reduce((a, b) => (a.score <= b.score ? a : b))
    : null;

  const sentences: string[] = [];
  sentences.push(
    `You have processed ${ctx.callCount} ${ctx.callCount === 1 ? "transcript" : "transcripts"}.`
  );
  if (known.length === ctx.pillarScores.length) {
    sentences.push(
      `Pillar reads — ${ctx.pillarScores.map((p, i) => `${i + 1}: ${p.score}/100`).join(", ")}.`
    );
  } else if (known.length > 0) {
    sentences.push(
      `${known.length} of ${ctx.pillarScores.length} pillars have enough data: ${known.map((p) => `${p.title.slice(0, 36)} reads ${p.score}/100`).join("; ")}.`
    );
  } else {
    sentences.push("No pillar yet has enough signals to score.");
  }
  if (softSpot) {
    sentences.push(`${softSpot.title.slice(0, 60)} is the soft spot.`);
  }
  if (ctx.topBlocker.value > 0) {
    sentences.push(`The most common deal blocker is ${ctx.topBlocker.key}.`);
  }
  if (ctx.corePct !== null) {
    sentences.push(`Core ICP share is ${ctx.corePct}%.`);
  }
  sentences.push(
    ctx.contestedCount === 0
      ? "No contested signals require PMM review."
      : `${ctx.contestedCount} contested signal${ctx.contestedCount === 1 ? "" : "s"} require PMM review.`
  );

  return (
    <SectionShell title="Second-Layer Read" hint="Generated from the numbers on this page">
      <div className="glass-card p-5">
        <p className="text-sm leading-relaxed text-[var(--color-atib-text-muted)]">
          {sentences.join(" ")}
        </p>
      </div>
    </SectionShell>
  );
}
