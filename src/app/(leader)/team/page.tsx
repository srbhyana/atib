export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { calculateDriftScore, getCallStats, getICPDistribution } from "@/lib/agents/aggregate-dashboard";
import { db } from "@/lib/db/client";
import { users, transcripts, signals } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [drift, stats, icpDist] = await Promise.all([
    calculateDriftScore(session.workspaceId),
    getCallStats(session.workspaceId),
    getICPDistribution(session.workspaceId),
  ]);
  // eslint-disable-next-line react-hooks/purity


  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const repActivity = await db
    .select({
      repId: users.id,
      repName: users.name,
      callCount: sql<number>`count(${transcripts.id})::int`,
      progressedCount: sql<number>`count(${transcripts.id}) filter (where ${transcripts.callOutcome} = 'progressed')::int`,
    })
    .from(users)
    .leftJoin(
      transcripts,
      and(
        eq(transcripts.repId, users.id),
        sql`${transcripts.createdAt} >= ${thirtyDaysAgo}`
      )
    )
    .where(
      and(
        eq(users.workspaceId, session.workspaceId),
        eq(users.role, "sales_rep")
      )
    )
    .groupBy(users.id, users.name)
    .orderBy(desc(sql`count(${transcripts.id})`));

  const topSignals = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.workspaceId, session.workspaceId),
        sql`${signals.tier} NOT IN ('archived', 'dismissed')`
      )
    )
    .orderBy(desc(signals.reinforcementCount))
    .limit(5);

  const driftColorClass =
    drift.overall >= 70
      ? "text-emerald-400"
      : drift.overall >= 40
      ? "text-yellow-400"
      : "text-red-400";

  const outcomeRate = stats.total > 0
    ? Math.round((stats.progressed / stats.total) * 100)
    : 0;

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Team Overview</h1>
        <p className="text-sm text-[var(--color-atib-text-muted)] mt-1">
          Aggregate call intelligence for your team — last 30 days.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass-card p-5">
          <p className="text-xs text-[var(--color-atib-text-dim)] uppercase tracking-wide mb-1">Positioning Score</p>
          <p className={`text-3xl font-bold ${driftColorClass}`}>{drift.overall}</p>
          <p className="text-xs text-[var(--color-atib-text-dim)] mt-0.5">/ 100</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs text-[var(--color-atib-text-dim)] uppercase tracking-wide mb-1">Calls (30d)</p>
          <p className="text-3xl font-bold">{stats.recent}</p>
          <p className="text-xs text-[var(--color-atib-text-dim)] mt-0.5">{stats.total} total</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs text-[var(--color-atib-text-dim)] uppercase tracking-wide mb-1">Progression Rate</p>
          <p className="text-3xl font-bold text-emerald-400">{outcomeRate}%</p>
          <p className="text-xs text-[var(--color-atib-text-dim)] mt-0.5">{stats.progressed} progressed</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs text-[var(--color-atib-text-dim)] uppercase tracking-wide mb-1">Active Reps</p>
          <p className="text-3xl font-bold">{repActivity.filter(r => r.callCount > 0).length}</p>
          <p className="text-xs text-[var(--color-atib-text-dim)] mt-0.5">/ {repActivity.length} invited</p>
        </div>
      </div>

      {/* Pillar scores */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold mb-4">Pillar Alignment</h2>
        <div className="space-y-3">
          {[
            { label: "Pillar 1", score: drift.pillar1 },
            { label: "Pillar 2", score: drift.pillar2 },
            { label: "Pillar 3", score: drift.pillar3 },
          ].map(({ label, score }) => (
            <div key={label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[var(--color-atib-text-muted)]">{label}</span>
                <span className={score >= 70 ? "text-emerald-400" : score >= 40 ? "text-yellow-400" : "text-red-400"}>
                  {score}/100
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-atib-surface-elevated)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-yellow-500" : "bg-red-500"
                  }`}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Rep Activity */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold mb-4">Rep Activity (30d)</h2>
          {repActivity.length === 0 ? (
            <p className="text-xs text-[var(--color-atib-text-dim)]">No reps active yet.</p>
          ) : (
            <div className="space-y-2">
              {repActivity.map((rep) => (
                <div key={rep.repId} className="flex items-center justify-between py-2 border-b border-[var(--color-atib-border-subtle)] last:border-0">
                  <span className="text-sm">{rep.repName}</span>
                  <div className="flex items-center gap-3 text-xs text-[var(--color-atib-text-dim)]">
                    <span>{rep.callCount} calls</span>
                    {rep.callCount > 0 && (
                      <span className="text-emerald-400">
                        {Math.round((rep.progressedCount / rep.callCount) * 100)}% progressed
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Signals */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold mb-4">Top Signals</h2>
          {topSignals.length === 0 ? (
            <p className="text-xs text-[var(--color-atib-text-dim)]">Nothing new this week.</p>
          ) : (
            <div className="space-y-3">
              {topSignals.map((signal) => (
                <div key={signal.id} className="flex items-start gap-2">
                  <span className={`tier-${signal.tier} text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase shrink-0 mt-0.5`}>
                    {signal.tier.slice(0, 3)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{signal.title}</p>
                    <p className="text-[10px] text-[var(--color-atib-text-dim)]">
                      seen {signal.reinforcementCount}× · {signal.polarity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ICP Distribution */}
      {icpDist.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold mb-4">ICP Segment Distribution (30d)</h2>
          <div className="flex flex-wrap gap-3">
            {icpDist.map((seg) => (
              <div key={seg.segment} className="flex items-center gap-2 text-xs">
                <span className="text-[var(--color-atib-text-muted)]">{seg.segment || "Untagged"}</span>
                <span className="font-semibold">{seg.cnt}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
