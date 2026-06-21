export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth/session";
import { getCanonicalContext } from "@/lib/agents/canonical-context";
import { db } from "@/lib/db/client";
import { transcripts, signals } from "@/lib/db/schema";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import Link from "next/link";

type Polarity = "Reinforces" | "Contradicts" | "Extends" | "Neutral";
type Tier = "suggestion" | "evolving" | "contested" | "concrete" | "archived" | "dismissed";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const ctx = await getCanonicalContext(session.workspaceId);
  const data = await loadDashboardData(session.workspaceId);
  const pillars = ctx?.pillars ?? ["Pillar 1", "Pillar 2", "Pillar 3"];

  const drift = computeDriftScore(data.polarityTotals);
  const pillarScores = [1, 2, 3].map((idx) =>
    computePillarScore(idx, pillars[idx - 1] || `Pillar ${idx}`, data.polarityByPillar)
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

      <DriftHero score={drift.score} reinforces={data.polarityTotals.reinforces}
                 contradicts={data.polarityTotals.contradicts} total={data.activeSignalCount} />

      <PillarLights pillars={pillarScores} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IcpDistribution counts={data.icpBuckets} total={data.icpTotal} />
        <BlockerDistribution counts={data.blockerBuckets} total={data.blockerTotal} />
      </div>

      <TopSignalsTable rows={data.topSignals} />

      <ContestedQueue signals={data.contestedSignals} callCount={data.callCount} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompetitorMentions rows={data.competitorRows} />
        <TerminalBenefits rows={data.terminalBenefits} />
      </div>

      <EnablementOpportunities rows={data.enablementSignals} progressedCount={data.outcomes.progressed} />

      <Interpretation
        ctx={{
          callCount: data.callCount,
          pillarScores: pillarScores.map((p) => ({ title: p.title, score: p.score })),
          topBlocker: pickTop(data.blockerBuckets),
          corePct: pctOrNull(data.icpBuckets.Core, data.icpTotal),
          contestedCount: data.contestedSignals.length,
        }}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * Data layer — every aggregation runs at the SQL layer and in parallel.
 * ────────────────────────────────────────────────────────────────────── */

async function loadDashboardData(workspaceId: string) {
  const activeTier = sql`tier NOT IN ('archived', 'dismissed')`;

  const [
    callStats,
    polarityTotalsRow,
    polarityByPillarRows,
    icpRows,
    tierCounts,
    topSignals,
    contestedRows,
    competitorRows,
    benefitRows,
    objectionRows,
    enablementRows,
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
      .limit(8),
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
  ]);

  const polarityTotals = polarityTotalsRow[0] || {
    reinforces: 0, contradicts: 0, extends: 0, neutral: 0, total: 0,
  };
  const polarityByPillar = new Map(
    polarityByPillarRows.map((r) => [r.pillarTag, { reinforces: r.reinforces, contradicts: r.contradicts }])
  );

  const icpBuckets = bucketIcp(icpRows);
  const icpTotal = sumBucket(icpBuckets);

  const { buckets: blockerBuckets, total: blockerTotal } = bucketBlockers(
    objectionRows,
    callStats[0]?.progressed ?? 0
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
    tierCounts: tierCounts.reduce<Record<string, number>>((acc, r) => {
      acc[r.tier] = r.count;
      return acc;
    }, {}),
    topSignals,
    contestedSignals: contestedRows,
    competitorRows,
    terminalBenefits: benefitRows,
    blockerBuckets,
    blockerTotal,
    enablementSignals: enablementRows,
  };
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
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-atib-text-muted)]">
          {title}
        </h2>
        {hint ? <p className="text-xs text-[var(--color-atib-text-dim)] mt-1">{hint}</p> : null}
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
  counts, total,
}: { counts: Record<string, number>; total: number }) {
  const rows = (["Core", "Adjacent", "Outside", "Unclear"] as const).map((label) => ({
    label, count: counts[label] ?? 0,
  }));
  return (
    <SectionShell title="ICP Fit Distribution" hint="Derived from ICP signals tagged in transcripts">
      <div className="glass-card p-5">
        <HorizontalBars rows={rows} total={total} emptyLabel="No ICP signals captured yet." />
      </div>
    </SectionShell>
  );
}

function BlockerDistribution({
  counts, total,
}: { counts: Record<string, number>; total: number }) {
  const order = ["Price", "Trust", "Timing", "Product", "Fit", "Not Blocked"] as const;
  const rows = order.map((label) => ({ label, count: counts[label] ?? 0 }));
  return (
    <SectionShell title="Real Blocker Distribution" hint="Bucketed from objection-class signals + progressed-call count">
      <div className="glass-card p-5">
        <HorizontalBars rows={rows} total={total} emptyLabel="No blockers detected yet." />
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
    <SectionShell title="Top Recurring Signals" hint="Highest reinforcement count, freshest first">
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

function ContestedQueue({
  signals: contested, callCount,
}: {
  signals: Array<{ id: string; title: string; verbatimQuote: string; content: string; sourceTranscriptId: string | null }>;
  callCount: number;
}) {
  return (
    <SectionShell title="Contested Queue" hint="Signals that contradict the canonical positioning">
      {contested.length === 0 ? (
        <div className="glass-card p-5">
          <p className="text-sm text-[var(--color-atib-text-muted)]">
            No contradictions detected across {callCount} {callCount === 1 ? "call" : "calls"}.
          </p>
          <p className="mt-1 text-xs text-[var(--color-atib-text-dim)]">
            This read is meaningful only above 15 calls. Below that, treat as “too early to tell” rather than “canon holds”.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {contested.map((s) => (
            <div key={s.id} className="glass-card p-4 border border-rose-500/20 bg-rose-500/[0.03]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-atib-text)]">{s.title}</p>
                  {s.verbatimQuote ? (
                    <p className="mt-1 italic text-xs text-[var(--color-atib-text-dim)]">
                      “{s.verbatimQuote}”
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-[var(--color-atib-text-muted)]">{s.content}</p>
                </div>
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border bg-rose-500/15 text-rose-300 border-rose-500/30">
                  Requires PMM review
                </span>
              </div>
              {s.sourceTranscriptId ? (
                <Link
                  href={`/calls/${s.sourceTranscriptId}`}
                  className="mt-3 inline-block text-xs underline underline-offset-2 text-[var(--color-atib-text-dim)] hover:text-[var(--color-atib-text)]"
                >
                  View source call →
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function CompetitorMentions({
  rows,
}: {
  rows: { competitorName: string; count: number }[];
}) {
  const total = rows.reduce((a, b) => a + b.count, 0);
  const ranked = rows.map((r) => ({ label: r.competitorName, count: r.count }));
  return (
    <SectionShell title="Competitor Mention Frequency" hint="Named in live calls, ranked">
      <div className="glass-card p-5">
        <HorizontalBars rows={ranked} total={total} emptyLabel="No competitors named yet." />
      </div>
    </SectionShell>
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
