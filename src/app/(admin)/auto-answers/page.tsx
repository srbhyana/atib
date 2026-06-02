export const dynamic = 'force-dynamic';

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { autoAnswers } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export default async function AutoAnswersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const answers = await db
    .select()
    .from(autoAnswers)
    .where(eq(autoAnswers.workspaceId, session.workspaceId))
    .orderBy(desc(autoAnswers.frequency))
    .limit(50);

  const stateColors: Record<string, string> = {
    suggestion: "tier-suggestion",
    evolving: "tier-evolving",
    approved: "tier-concrete",
    dismissed: "text-zinc-600",
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-xl font-bold">Auto-Answers</h1>
        <p className="text-sm text-[var(--color-atib-text-muted)] mt-1">
          Questions prospects keep asking. Draft approved responses for your reps.
        </p>
      </div>

      {answers.length > 0 ? (
        <div className="space-y-3">
          {answers.map((answer, i) => (
            <div
              key={answer.id}
              className="glass-card glass-card-hover p-5 animate-fade-in-up"
              style={{ animationDelay: `${i * 0.03}s` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`${stateColors[answer.state]} text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase`}>
                      {answer.state}
                    </span>
                    <span className="text-[10px] text-[var(--color-atib-text-dim)]">
                      Asked {answer.frequency}× {answer.sourceAccount && `· from ${answer.sourceAccount}`}
                    </span>
                  </div>

                  <h3 className="text-sm font-medium mb-2">{answer.question}</h3>

                  <div className="p-3 rounded-lg bg-[var(--color-atib-surface)]/50">
                    <p className="text-xs font-medium text-[var(--color-atib-accent)] mb-1">Drafted Answer</p>
                    <p className="text-sm text-[var(--color-atib-text-muted)]">{answer.draftedAnswer}</p>
                  </div>

                  {Array.isArray(answer.alternatives) && (answer.alternatives as unknown[]).length > 0 ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] text-[var(--color-atib-text-dim)] uppercase tracking-widest">Alternatives</p>
                      {(answer.alternatives as unknown[]).map((alt, j) => (
                        <p key={j} className="text-xs text-[var(--color-atib-text-dim)] pl-3 border-l-2 border-[var(--color-atib-border)]">
                          {String(alt)}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex gap-1 shrink-0">
                  <button className="btn-ghost text-emerald-400 text-xs" title="Approve this answer">✓</button>
                  <button className="btn-ghost text-red-400 text-xs" title="Dismiss">✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state py-16">
          <div className="text-4xl mb-3 opacity-30">?</div>
          <p className="empty-state-title">No questions yet.</p>
          <p className="empty-state-desc">
            As your reps submit call transcripts, recurring prospect questions will surface here with AI-drafted answers for your approval.
          </p>
        </div>
      )}
    </div>
  );
}
