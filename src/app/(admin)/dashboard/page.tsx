export const dynamic = 'force-dynamic';

import { getSession } from "@/lib/auth/session";
import { getCanonicalContext } from "@/lib/agents/canonical-context";
import { getSignalCounts, getSignals } from "@/lib/agents/signal-bank";
import { db } from "@/lib/db/client";
import { transcripts } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const ctx = await getCanonicalContext(session.workspaceId);
  const signalCounts = await getSignalCounts(session.workspaceId);
  const recentSignals = await getSignals(session.workspaceId, { limit: 5 });

  // Get call stats
  const callStats = await db
    .select({
      total: sql<number>`count(*)::int`,
      progressed: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'progressed')::int`,
      stalled: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'stalled')::int`,
      lost: sql<number>`count(*) filter (where ${transcripts.callOutcome} = 'lost')::int`,
    })
    .from(transcripts)
    .where(eq(transcripts.workspaceId, session.workspaceId));

  const stats = callStats[0] || { total: 0, progressed: 0, stalled: 0, lost: 0 };
  const totalSignals = Object.values(signalCounts).reduce((a: number, b: number) => a + b, 0);
  const contested = signalCounts.contested || 0;

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {ctx?.companyName ? `${ctx.companyName} — ` : ""}Intelligence Dashboard
        </h1>
        <p className="text-[var(--color-atib-text-muted)] text-sm mt-1">
          Positioning intelligence from {stats.total} calls
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Calls" value={stats.total} color="violet" />
        <StatCard label="Signals" value={totalSignals} color="blue" />
        <StatCard
          label="Contested"
          value={contested}
          color="red"
          pulse={contested > 0}
        />
        <StatCard
          label="Win Rate"
          value={
            stats.total > 0
              ? `${Math.round((stats.progressed / stats.total) * 100)}%`
              : "—"
          }
          color="green"
        />
      </div>

      {/* Dashboard Modules Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Signal Feed */}
        <div className="module-card col-span-2">
          <div className="module-header">
            <h2 className="module-title">Signal Feed</h2>
            <Link href="/signals" className="btn-ghost text-xs">
              View all →
            </Link>
          </div>
          {recentSignals.length > 0 ? (
            <div className="space-y-3">
              {recentSignals.slice(0, 5).map((signal, i) => (
                <div
                  key={signal.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-[var(--color-atib-surface)]/50 hover:bg-[var(--color-atib-surface)] transition-colors animate-fade-in-up"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <span className={`tier-${signal.tier} text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap`}>
                    {signal.tier}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{signal.title}</p>
                    {signal.verbatimQuote && (
                      <p className="verbatim-quote mt-1 text-xs">{signal.verbatimQuote.slice(0, 120)}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-[var(--color-atib-text-dim)]">{signal.signalType}</span>
                      {signal.pillarTag > 0 && (
                        <span className="text-[10px] text-[var(--color-atib-accent)]">
                          Pillar {signal.pillarTag}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <form action={`/api/signals/${signal.id}/approve`} method="POST">
                      <button type="submit" className="btn-ghost text-emerald-400 text-xs">✓</button>
                    </form>
                    <form action={`/api/signals/${signal.id}/dismiss`} method="POST">
                      <button type="submit" className="btn-ghost text-red-400 text-xs">✕</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state py-12">
              <div className="empty-state-icon text-4xl">◈</div>
              <p className="empty-state-title">Nothing new this week.</p>
              <p className="empty-state-desc">
                Signals will appear here as your reps submit call transcripts.
              </p>
            </div>
          )}
        </div>

        {/* Contested Queue */}
        <div className="module-card">
          <div className="module-header">
            <h2 className="module-title">Contested Queue</h2>
            <span className="module-count">{contested}</span>
          </div>
          {contested > 0 ? (
            <div className="text-sm text-[var(--color-atib-text-muted)]">
              <Link href="/signals/contested" className="text-red-400 hover:text-red-300 underline underline-offset-2">
                {contested} signal{contested !== 1 ? "s" : ""} contradicting canonical truth
              </Link>
              <p className="text-xs mt-1 text-[var(--color-atib-text-dim)]">
                Resolve within 30 days or dashboard locks.
              </p>
            </div>
          ) : (
            <div className="empty-state py-8">
              <p className="empty-state-desc text-xs">No contradictions detected. Canon holds.</p>
            </div>
          )}
        </div>

        {/* Enablement Feed */}
        <div className="module-card">
          <div className="module-header">
            <h2 className="module-title">Enablement Feed</h2>
          </div>
          <div className="empty-state py-8">
            <p className="empty-state-desc text-xs">
              Rep language from progressed calls will surface here for promotion to canonical messaging.
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="module-card col-span-2">
          <div className="module-header">
            <h2 className="module-title">Quick Actions</h2>
          </div>
          <div className="flex gap-3">
            <Link href="/setup" className="btn-secondary text-xs">
              Edit Setup
            </Link>
            <Link href="/settings" className="btn-secondary text-xs">
              Invite Team
            </Link>
            <Link href="/positioning" className="btn-secondary text-xs">
              Run Positioning Audit
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  pulse = false,
}: {
  label: string;
  value: number | string;
  color: "violet" | "blue" | "red" | "green";
  pulse?: boolean;
}) {
  const colorMap = {
    violet: "from-violet-500/15 to-transparent border-violet-500/20",
    blue: "from-blue-500/15 to-transparent border-blue-500/20",
    red: "from-red-500/15 to-transparent border-red-500/20",
    green: "from-emerald-500/15 to-transparent border-emerald-500/20",
  };
  const textColor = {
    violet: "text-violet-400",
    blue: "text-blue-400",
    red: "text-red-400",
    green: "text-emerald-400",
  };

  return (
    <div
      className={`glass-card p-4 bg-gradient-to-br ${colorMap[color]} ${pulse ? "animate-pulse-glow" : ""}`}
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-atib-text-dim)] mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold ${textColor[color]}`}>{value}</p>
    </div>
  );
}
