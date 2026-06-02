export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { signals, transcripts } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * Rep's enablement feed — "language working."
 *
 * Same data as the PMM enablement feed, opposite emotional framing.
 * Reps see their own verbatim phrases that:
 *   • appear in calls THEY captured AND
 *   • came from a `progressed` call AND
 *   • are tier='evolving' or above (signal of repetition)
 *
 * The reframing rule (atib-spec PART 9, Constraint 8): the rep surface NEVER
 * shows "drift detected" framing. Only "language that worked."
 */

export default async function MyEnablementPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Pull progressed-call signals authored by this rep.
  // For PMM users this still works — it just scopes to their own captures.
  const rows = await db
    .select({
      id: signals.id,
      title: signals.title,
      quote: signals.verbatimQuote,
      inferredMeaning: signals.inferredMeaning,
      tier: signals.tier,
      type: signals.signalType,
      polarity: signals.polarity,
      callDate: transcripts.callDate,
      account: transcripts.prospectAccount,
    })
    .from(signals)
    .innerJoin(transcripts, eq(signals.sourceTranscriptId, transcripts.id))
    .where(
      and(
        eq(signals.workspaceId, session.workspaceId),
        eq(transcripts.repId, session.id),
        eq(transcripts.callOutcome, "progressed"),
        sql`${signals.tier} IN ('evolving', 'concrete', 'suggestion')`,
        sql`${signals.polarity} IN ('Reinforces', 'Extends')`
      )
    )
    .orderBy(desc(transcripts.callDate))
    .limit(20);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Language that worked</h1>
        <p className="text-sm text-[var(--color-atib-text-muted)]">
          Phrases from your progressed calls that the market is repeating back.
          PMM may promote these to canonical messaging — you get credit when
          they do.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="border border-[var(--color-atib-border)] rounded-lg p-8 text-center space-y-2">
          <div className="text-3xl opacity-40">✦</div>
          <div className="text-sm font-medium">Nothing new this week.</div>
          <div className="text-xs text-[var(--color-atib-text-muted)]">
            Capture a few more calls. When your language reinforces a pillar
            and lands a deal, it shows up here.
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="border border-[var(--color-atib-border)] rounded-lg p-4 space-y-2 hover:bg-[var(--color-atib-surface-2)]/40 transition-colors"
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--color-atib-text-dim)]">
                <span>{row.type}</span>
                <span>
                  {row.account || "—"} ·{" "}
                  {row.callDate
                    ? new Date(row.callDate).toLocaleDateString()
                    : ""}
                </span>
              </div>
              <div className="text-sm font-medium">{row.title}</div>
              <div className="verbatim-quote font-mono text-[var(--color-atib-text-muted)] italic">
                {row.quote}
              </div>
              <div className="text-xs text-[var(--color-atib-text-muted)]">
                {row.inferredMeaning}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className={`tier-${row.tier} px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium`}>
                  {row.tier}
                </span>
                <span className="text-[10px] text-[var(--color-atib-text-dim)]">
                  {row.polarity}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
