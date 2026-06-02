export const dynamic = 'force-dynamic';

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getSignals, getSignalCounts } from "@/lib/agents/signal-bank";
import Link from "next/link";

export default async function SignalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const signals = await getSignals(session.workspaceId, { limit: 50 });
  const counts = await getSignalCounts(session.workspaceId);

  const tierOrder = ["contested", "evolving", "concrete", "suggestion"];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Signal Bank</h1>
          <p className="text-sm text-[var(--color-atib-text-muted)] mt-1">
            All positioning signals extracted from sales calls
          </p>
        </div>
        <div className="flex gap-2">
          {tierOrder.map((tier) => (
            <span key={tier} className={`tier-${tier} text-[10px] font-semibold px-3 py-1 rounded-full uppercase`}>
              {tier}: {counts[tier] || 0}
            </span>
          ))}
        </div>
      </div>

      {signals.length > 0 ? (
        <div className="space-y-3">
          {signals.map((signal, i) => (
            <div
              key={signal.id}
              className="glass-card glass-card-hover p-4 animate-fade-in-up"
              style={{ animationDelay: `${i * 0.03}s` }}
            >
              <div className="flex items-start gap-3">
                <span className={`tier-${signal.tier} text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 mt-0.5`}>
                  {signal.tier}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium">{signal.title}</h3>
                  <p className="text-xs text-[var(--color-atib-text-muted)] mt-0.5">{signal.content}</p>
                  {signal.verbatimQuote && (
                    <p className="verbatim-quote mt-2 text-xs">{signal.verbatimQuote.slice(0, 200)}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--color-atib-text-dim)] flex-wrap">
                    <span className="bg-[var(--color-atib-surface-2)] px-2 py-0.5 rounded">{signal.signalType}</span>
                    <span>{signal.polarity}</span>
                    <span>{signal.strategicImportance}</span>
                    {signal.pillarTag > 0 && <span className="text-[var(--color-atib-accent)]">Pillar {signal.pillarTag}</span>}
                    {signal.competitorName && <span className="text-orange-400">{signal.competitorName}</span>}
                    {signal.canonicalContradiction === "yes" && (
                      <span className="text-red-400 font-semibold">⚡ Contradicts canonical</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <SignalAction signalId={signal.id} action="approve" label="✓" color="emerald" />
                  <SignalAction signalId={signal.id} action="promote" label="↑" color="blue" />
                  <SignalAction signalId={signal.id} action="demote" label="↓" color="zinc" />
                  <SignalAction signalId={signal.id} action="dismiss" label="✕" color="red" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state py-16">
          <div className="text-4xl mb-3 opacity-30">◈</div>
          <p className="empty-state-title">No signals yet.</p>
          <p className="empty-state-desc">
            Signals will appear here as transcripts are submitted and analyzed.
          </p>
        </div>
      )}
    </div>
  );
}

function SignalAction({ signalId, action, label, color }: { signalId: string; action: string; label: string; color: string }) {
  return (
    <form action={`/api/signals/${signalId}/${action}`} method="POST">
      <button type="submit" className={`btn-ghost text-${color}-400 text-xs`} title={action}>
        {label}
      </button>
    </form>
  );
}
