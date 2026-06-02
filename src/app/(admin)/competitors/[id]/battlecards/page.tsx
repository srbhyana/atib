export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getCompetitors } from "@/lib/agents/canonical-context";
import { listBattlecards } from "@/lib/agents/battlecard";
import BattlecardManager from "./BattlecardManager";

export default async function CompetitorBattlecardsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const allComps = await getCompetitors(session.workspaceId);
  const competitor = allComps.find((c) => c.id === id);

  if (!competitor) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Battlecards</h1>
        <p className="text-sm text-[var(--color-atib-text-muted)]">
          Competitor not found.
        </p>
      </div>
    );
  }

  const cards = await listBattlecards(session.workspaceId, id);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Battlecards · {competitor.name}</h1>
          <p className="text-sm text-[var(--color-atib-text-muted)] mt-1">
            Generated from competitor-tagged signals. PMM edits and publishes;
            the AI never auto-publishes.
          </p>
        </div>
      </div>

      <BattlecardManager
        competitor={{
          id: competitor.id,
          name: competitor.name,
          notes: competitor.battlecardNotes,
        }}
        initialCards={cards.map((c) => ({
          id: c.id,
          archetype: c.archetype,
          status: c.status,
          generatedAt: c.generatedAt
            ? new Date(c.generatedAt).toISOString()
            : null,
          approvedAt: c.approvedAt
            ? new Date(c.approvedAt).toISOString()
            : null,
        }))}
      />
    </div>
  );
}
