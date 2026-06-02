export const dynamic = 'force-dynamic';

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getEnablementFeed } from "@/lib/agents/aggregate-dashboard";

export default async function EnablementPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const enablementItems = await getEnablementFeed(session.workspaceId, 20);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-xl font-bold">Enablement Feed</h1>
        <p className="text-sm text-[var(--color-atib-text-muted)] mt-1">
          Language from progressed calls that&apos;s not in canonical messaging yet. Gold for messaging refresh.
        </p>
      </div>

      {enablementItems.length > 0 ? (
        <div className="space-y-3">
          {enablementItems.map((item, i) => (
            <div
              key={item.signalId}
              className="glass-card glass-card-hover p-4 animate-fade-in-up"
              style={{ animationDelay: `${i * 0.03}s` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`tier-${item.tier} text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase`}>
                  {item.tier}
                </span>
                <span className="text-[10px] text-emerald-400">{item.callOutcome}</span>
                <span className="text-[10px] text-[var(--color-atib-text-dim)]">{item.polarity}</span>
              </div>
              <h3 className="text-sm font-medium">{item.signalTitle}</h3>
              <p className="text-xs text-[var(--color-atib-text-muted)] mt-0.5">{item.signalContent}</p>
              {item.verbatimQuote && (
                <p className="verbatim-quote mt-2 text-xs">{item.verbatimQuote}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state py-16">
          <div className="text-4xl mb-3 opacity-30">▲</div>
          <p className="empty-state-title">No enablement signals yet.</p>
          <p className="empty-state-desc">
            Rep language from progressed calls that extends or reinforces your messaging will surface here.
          </p>
        </div>
      )}
    </div>
  );
}
