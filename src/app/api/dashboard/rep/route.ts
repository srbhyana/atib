import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { transcripts, soapNotes, signals } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEnablementFeed } from "@/lib/agents/aggregate-dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireRole(["sales_rep", "pmm_admin"]);

    // Rep's own recent calls (last 10)
    const recentCalls = await db
      .select({
        id: transcripts.id,
        prospectAccount: transcripts.prospectAccount,
        callDate: transcripts.callDate,
        callOutcome: transcripts.callOutcome,
        createdAt: transcripts.createdAt,
      })
      .from(transcripts)
      .where(
        and(
          eq(transcripts.workspaceId, session.workspaceId),
          eq(transcripts.repId, session.id)
        )
      )
      .orderBy(desc(transcripts.createdAt))
      .limit(10);

    // Rep's own enablement signals (language that worked)
    const enablement = await db
      .select({
        id: signals.id,
        title: signals.title,
        verbatimQuote: signals.verbatimQuote,
        tier: signals.tier,
        reinforcementCount: signals.reinforcementCount,
      })
      .from(signals)
      .innerJoin(transcripts, eq(signals.sourceTranscriptId, transcripts.id))
      .where(
        and(
          eq(signals.workspaceId, session.workspaceId),
          eq(transcripts.repId, session.id),
          eq(transcripts.callOutcome, "progressed"),
          sql`${signals.polarity} IN ('Extends', 'Reinforces')`
        )
      )
      .orderBy(desc(signals.lastReinforced))
      .limit(5);

    return NextResponse.json({
      ok: true,
      recentCalls,
      enablement,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Rep dashboard error:", error);
    return NextResponse.json({ ok: false, error: "Failed to load dashboard." }, { status: 500 });
  }
}
