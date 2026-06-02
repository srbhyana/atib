export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { battlecards, competitors } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Rep-facing battlecard library — published cards only.
 *
 * The PMM authors and publishes battlecards under
 *   /competitors/[id]/battlecards
 * Reps and leaders consume them here.
 */

export default async function BattlecardLibraryPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const rows = await db
    .select({
      id: battlecards.id,
      competitorId: battlecards.competitorId,
      competitorName: competitors.name,
      sections: battlecards.sections,
      archetype: battlecards.archetype,
      approvedAt: battlecards.approvedAt,
    })
    .from(battlecards)
    .innerJoin(competitors, eq(battlecards.competitorId, competitors.id))
    .where(
      and(
        eq(battlecards.workspaceId, session.workspaceId),
        eq(battlecards.status, "published")
      )
    )
    .orderBy(desc(battlecards.approvedAt));

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Battlecards</h1>
        <p className="text-sm text-[var(--color-atib-text-muted)]">
          Pre-meeting briefs sourced from real call data. Pick the competitor
          you&apos;re about to face.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="border border-[var(--color-atib-border)] rounded-lg p-8 text-center space-y-2">
          <div className="text-3xl opacity-40">⊕</div>
          <div className="text-sm font-medium">No published battlecards yet.</div>
          <div className="text-xs text-[var(--color-atib-text-muted)]">
            PMM publishes battlecards from signals. Once one is live, it appears
            here ready for your next deal.
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((card) => {
            const s = (card.sections as {
              howToPositionUs?: string;
              quickDismisses?: string[];
              confidence?: number;
            }) || {};
            return (
              <li key={card.id}>
                <Link
                  href={`/battlecard/${card.id}`}
                  className="block border border-[var(--color-atib-border)] rounded-lg p-4 hover:border-[var(--color-atib-accent)]/50 hover:bg-[var(--color-atib-surface-2)]/30 transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{card.competitorName}</span>
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-atib-text-dim)]">
                      {card.archetype}
                    </span>
                  </div>
                  {s.howToPositionUs && (
                    <p className="text-xs text-[var(--color-atib-text-muted)] line-clamp-2">
                      {s.howToPositionUs}
                    </p>
                  )}
                  {Array.isArray(s.quickDismisses) && s.quickDismisses.length > 0 && (
                    <div className="text-[11px] text-[var(--color-atib-text-muted)] italic line-clamp-1">
                      “{s.quickDismisses[0]}”
                    </div>
                  )}
                  <div className="text-[10px] text-[var(--color-atib-text-dim)]">
                    Confidence {s.confidence ?? "—"}/5 ·{" "}
                    {card.approvedAt
                      ? new Date(card.approvedAt).toLocaleDateString()
                      : ""}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
