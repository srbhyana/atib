export const dynamic = 'force-dynamic';

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getSignals } from "@/lib/agents/signal-bank";
import ContestedResolverActions from "@/components/signals/ContestedResolverActions";

export default async function ContestedPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const contestedSignals = await getSignals(session.workspaceId, { tier: "contested", limit: 50 });

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-xl font-bold">Contested Signals</h1>
        <p className="text-sm text-[var(--color-atib-text-muted)] mt-1">
          Signals that contradict your approved canonical truth. Resolve within 30 days or the dashboard locks.
        </p>
      </div>

      {contestedSignals.length > 0 ? (
        <div className="space-y-4">
          {contestedSignals.map((signal, i) => (
            <div
              key={signal.id}
              className="glass-card p-5 border-l-4 border-red-500/50 animate-fade-in-up"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="tier-contested text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase">
                      contested
                    </span>
                    <span className="text-xs text-[var(--color-atib-text-dim)]">{signal.signalType}</span>
                    <span className="text-xs text-[var(--color-atib-text-dim)]">
                      · seen {signal.reinforcementCount}×
                    </span>
                  </div>
                  <h3 className="text-sm font-medium mb-1">{signal.title}</h3>
                  <p className="text-xs text-[var(--color-atib-text-muted)]">{signal.content}</p>
                  {signal.verbatimQuote && (
                    <p className="verbatim-quote mt-2 text-xs">{signal.verbatimQuote}</p>
                  )}
                  {signal.canonicalContradiction === "yes" && (
                    <div className="mt-3 p-2 rounded bg-red-500/5 border border-red-500/15 text-xs text-red-400">
                      ⚡ This signal directly contradicts approved canonical truth
                    </div>
                  )}
                  <div className="mt-3 text-[10px] text-[var(--color-atib-text-dim)] space-y-0.5">
                    <p><span className="font-medium text-[var(--color-atib-text-muted)]">Keep Canon</span> — dismiss this signal, current positioning holds.</p>
                    <p><span className="font-medium text-[var(--color-atib-text-muted)]">Update Canon</span> — promote this signal to Evolving, mark canon as superseded.</p>
                    <p><span className="font-medium text-[var(--color-atib-text-muted)]">Hold 14d</span> — gather more data before deciding.</p>
                  </div>
                </div>
                <ContestedResolverActions signal={signal} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state py-20">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="empty-state-title">No contested signals</p>
          <p className="empty-state-desc">
            Canon holds. No incoming market signals contradict your approved positioning.
          </p>
        </div>
      )}
    </div>
  );
}
