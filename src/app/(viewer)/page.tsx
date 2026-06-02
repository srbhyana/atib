export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { calculateDriftScore } from "@/lib/agents/aggregate-dashboard";
import { db } from "@/lib/db/client";
import { signals, positioningAudits } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export default async function ViewerPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const drift = await calculateDriftScore(session.workspaceId);

  // Top 3 trends: highest-reinforced evolving or concrete signals
  const topTrends = await db
    .select({
      id: signals.id,
      title: signals.title,
      content: signals.content,
      tier: signals.tier,
      polarity: signals.polarity,
      reinforcementCount: signals.reinforcementCount,
      pillarTag: signals.pillarTag,
    })
    .from(signals)
    .where(
      and(
        eq(signals.workspaceId, session.workspaceId),
        sql`${signals.tier} IN ('evolving', 'concrete')`
      )
    )
    .orderBy(desc(signals.reinforcementCount))
    .limit(3);

  // Latest audit
  const [latestAudit] = await db
    .select()
    .from(positioningAudits)
    .where(eq(positioningAudits.workspaceId, session.workspaceId))
    .orderBy(desc(positioningAudits.runAt))
    .limit(1);

  const driftLabel =
    drift.overall >= 70 ? "On Canon" : drift.overall >= 40 ? "Mixed" : "Drifting";
  const driftColorClass =
    drift.overall >= 70 ? "text-emerald-400" : drift.overall >= 40 ? "text-yellow-400" : "text-red-400";
  const driftBgClass =
    drift.overall >= 70
      ? "from-emerald-500/10 to-emerald-500/5"
      : drift.overall >= 40
      ? "from-yellow-500/10 to-yellow-500/5"
      : "from-red-500/10 to-red-500/5";

  return (
    <div className="space-y-10 animate-fade-in-up">
      {/* Drift Gauge */}
      <div className={`glass-card p-8 text-center bg-gradient-to-br ${driftBgClass}`}>
        <p className="text-xs uppercase tracking-widest text-[var(--color-atib-text-dim)] mb-2">
          Positioning Integrity Score
        </p>
        <div className={`text-7xl font-black ${driftColorClass} mb-2 tabular-nums`}>
          {drift.overall}
        </div>
        <p className={`text-sm font-semibold ${driftColorClass}`}>{driftLabel}</p>
        <p className="text-xs text-[var(--color-atib-text-dim)] mt-2 max-w-xs mx-auto">
          Measures how consistently the market is echoing your canonical positioning.
          Above 70 is healthy. Below 40 requires PMM attention.
        </p>

        {/* Pillar breakdown */}
        <div className="flex justify-center gap-8 mt-6">
          {[
            { label: "P1", score: drift.pillar1 },
            { label: "P2", score: drift.pillar2 },
            { label: "P3", score: drift.pillar3 },
          ].map(({ label, score }) => (
            <div key={label} className="text-center">
              <p className="text-xs text-[var(--color-atib-text-dim)]">{label}</p>
              <p className={`text-lg font-bold ${score >= 70 ? "text-emerald-400" : score >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                {score}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Top 3 Trends */}
      <div>
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wide text-[var(--color-atib-text-dim)]">
          Top 3 Market Trends
        </h2>
        {topTrends.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="text-sm text-[var(--color-atib-text-dim)]">Nothing new this week.</p>
            <p className="text-xs text-[var(--color-atib-text-dim)] mt-1">Need at least a few calls before trends emerge.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {topTrends.map((signal, i) => (
              <div key={signal.id} className="glass-card p-5 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[var(--color-atib-surface-elevated)] flex items-center justify-center text-sm font-bold text-[var(--color-atib-text-dim)] shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`tier-${signal.tier} text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase`}>
                      {signal.tier}
                    </span>
                    <span className="text-xs text-[var(--color-atib-text-dim)]">
                      {signal.polarity} · Pillar {signal.pillarTag || "—"}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{signal.title}</p>
                  {signal.content && (
                    <p className="text-xs text-[var(--color-atib-text-muted)] mt-0.5 line-clamp-2">
                      {signal.content}
                    </p>
                  )}
                  <p className="text-[10px] text-[var(--color-atib-text-dim)] mt-1">
                    Confirmed in {signal.reinforcementCount} calls
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Positioning Audit Summary */}
      <div>
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wide text-[var(--color-atib-text-dim)]">
          Latest Positioning Audit
        </h2>
        {latestAudit ? (
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-medium uppercase">
                {latestAudit.framework.replace("_", " ")}
              </span>
              <span className="text-xs text-[var(--color-atib-text-dim)]">
                {new Date(latestAudit.runAt).toLocaleDateString()}
              </span>
            </div>
            {latestAudit.flags && Array.isArray(latestAudit.flags) && latestAudit.flags.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-[var(--color-atib-text-muted)] mb-2">
                  {latestAudit.flags.length} flag{latestAudit.flags.length !== 1 ? "s" : ""} requiring PMM attention
                </p>
                <div className="space-y-1">
                  {(latestAudit.flags as string[]).slice(0, 3).map((flag, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-yellow-400">
                      <span className="mt-0.5">⚠</span>
                      <span>{flag}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-emerald-400">No flags. Positioning is consistent.</p>
            )}
          </div>
        ) : (
          <div className="glass-card p-8 text-center">
            <p className="text-sm text-[var(--color-atib-text-dim)]">
              No positioning audits run yet.
            </p>
            <p className="text-xs text-[var(--color-atib-text-dim)] mt-1">
              Insufficient data for this view — need at least a few calls.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
