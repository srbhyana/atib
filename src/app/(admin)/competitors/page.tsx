export const dynamic = 'force-dynamic';

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getCompetitors } from "@/lib/agents/canonical-context";
import { db } from "@/lib/db/client";
import { signals } from "@/lib/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export default async function CompetitorsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const comps = await getCompetitors(session.workspaceId);

  // Get signal counts per competitor
  const competitorSignals = await db
    .select({
      competitorName: signals.competitorName,
      cnt: sql<number>`count(*)::int`,
    })
    .from(signals)
    .where(
      and(
        eq(signals.workspaceId, session.workspaceId),
        sql`${signals.competitorName} != ''`
      )
    )
    .groupBy(signals.competitorName);

  const signalMap = new Map(competitorSignals.map((c) => [c.competitorName.toLowerCase(), c.cnt]));

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Competitor Radar</h1>
          <p className="text-sm text-[var(--color-atib-text-muted)] mt-1">
            Tracked competitors and their signal activity
          </p>
        </div>
        <a href="/setup" className="btn-secondary text-xs">+ Add Competitor</a>
      </div>

      {comps.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {comps.map((comp, i) => {
            const mentions = signalMap.get(comp.name.toLowerCase()) || 0;
            return (
              <div
                key={comp.id}
                className="glass-card glass-card-hover p-5 animate-fade-in-up"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-semibold">{comp.name}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        {mentions} mention{mentions !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {comp.url && (
                      <p className="text-xs text-[var(--color-atib-text-dim)] mb-2">{comp.url}</p>
                    )}
                    {comp.battlecardNotes && (
                      <div className="p-3 rounded-lg bg-[var(--color-atib-surface)]/50 mt-2">
                        <p className="text-[10px] font-semibold text-[var(--color-atib-text-dim)] uppercase tracking-widest mb-1">Battlecard Notes</p>
                        <p className="text-xs text-[var(--color-atib-text-muted)]">{comp.battlecardNotes}</p>
                      </div>
                    )}
                    <p className="text-[10px] text-[var(--color-atib-text-dim)] mt-2">
                      Tracking since {new Date(comp.trackingSince).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state py-16">
          <div className="text-4xl mb-3 opacity-30">⊕</div>
          <p className="empty-state-title">No competitors tracked.</p>
          <p className="empty-state-desc">
            Add competitors in the Setup Wizard. They&apos;ll be auto-tagged when prospects mention them.
          </p>
        </div>
      )}
    </div>
  );
}
