export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { battlecards, competitors } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { BattlecardSections } from "@/lib/agents/battlecard";

export default async function BattlecardReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const [row] = await db
    .select({
      id: battlecards.id,
      competitorName: competitors.name,
      sections: battlecards.sections,
      status: battlecards.status,
      approvedAt: battlecards.approvedAt,
    })
    .from(battlecards)
    .innerJoin(competitors, eq(battlecards.competitorId, competitors.id))
    .where(
      and(
        eq(battlecards.id, id),
        eq(battlecards.workspaceId, session.workspaceId)
      )
    )
    .limit(1);

  if (!row) {
    return (
      <div className="space-y-4">
        <Link href="/battlecard" className="text-xs text-[var(--color-atib-text-muted)] hover:text-[var(--color-atib-text)]">
          ← Back to battlecards
        </Link>
        <h1 className="text-xl font-bold">Battlecard not found</h1>
      </div>
    );
  }

  const s = (row.sections as BattlecardSections) || ({} as BattlecardSections);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Link
        href="/battlecard"
        className="text-xs text-[var(--color-atib-text-muted)] hover:text-[var(--color-atib-text)] inline-flex items-center gap-1"
      >
        ← Back to battlecards
      </Link>

      <header className="space-y-2 pb-4 border-b border-[var(--color-atib-border)]">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{row.competitorName}</h1>
          <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
            Published
          </span>
        </div>
        {s.evidenceFootnote && (
          <p className="text-xs text-[var(--color-atib-text-muted)]">
            {s.evidenceFootnote}
          </p>
        )}
      </header>

      {s.howToPositionUs && (
        <ReadSection label="How to position us">
          <p className="text-sm">{s.howToPositionUs}</p>
        </ReadSection>
      )}

      {s.companyOverview && (
        <ReadSection label="About them">
          <p className="text-xs text-[var(--color-atib-text-muted)]">
            {s.companyOverview}
          </p>
        </ReadSection>
      )}

      {Array.isArray(s.quickDismisses) && s.quickDismisses.length > 0 && (
        <ReadSection label="Quick dismisses · use mid-call">
          <ul className="space-y-1 text-sm">
            {s.quickDismisses.map((line, i) => (
              <li key={i} className="verbatim-quote font-mono italic text-[var(--color-atib-text-muted)]">
                {line}
              </li>
            ))}
          </ul>
        </ReadSection>
      )}

      {Array.isArray(s.objectionHandling) && s.objectionHandling.length > 0 && (
        <ReadSection label="Objection handling">
          <ul className="space-y-3 text-sm">
            {s.objectionHandling.map((row, i) => (
              <li key={i} className="border border-[var(--color-atib-border)] rounded-md p-3 space-y-1">
                <div className="font-medium">“{row.objection}”</div>
                <div className="text-xs text-[var(--color-atib-text-muted)]">
                  <strong>Respond:</strong> {row.response}
                </div>
                {row.proof && (
                  <div className="text-xs text-[var(--color-atib-text-muted)]">
                    <strong>Proof:</strong> {row.proof}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </ReadSection>
      )}

      {Array.isArray(s.landminesToPlant) && s.landminesToPlant.length > 0 && (
        <ReadSection label="Trap questions · plant these early">
          <ul className="space-y-1 text-sm list-disc pl-5">
            {s.landminesToPlant.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </ReadSection>
      )}

      {Array.isArray(s.whyWeWin) && s.whyWeWin.length > 0 && (
        <ReadSection label="Why we win">
          <ul className="space-y-2 text-sm">
            {s.whyWeWin.map((row, i) => (
              <li key={i}>
                <div className="font-medium">{row.reason}</div>
                {row.quote && (
                  <div className="text-xs text-[var(--color-atib-text-muted)] italic font-mono mt-0.5">
                    “{row.quote}”
                  </div>
                )}
              </li>
            ))}
          </ul>
        </ReadSection>
      )}

      {Array.isArray(s.whyWeLose) && s.whyWeLose.length > 0 && (
        <ReadSection label="Why we lose · know your edges">
          <ul className="space-y-1 text-sm list-disc pl-5">
            {s.whyWeLose.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </ReadSection>
      )}

      {Array.isArray(s.whenToWatchOut) && s.whenToWatchOut.length > 0 && (
        <ReadSection label="When to watch out">
          <ul className="space-y-1 text-sm list-disc pl-5">
            {s.whenToWatchOut.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </ReadSection>
      )}
    </div>
  );
}

function ReadSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[10px] font-semibold tracking-widest uppercase text-[var(--color-atib-text-muted)]">
        {label}
      </h2>
      {children}
    </section>
  );
}
