import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { transcripts, signals, users } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { calculateDriftScore, getICPDistribution, getCallStats } from "@/lib/agents/aggregate-dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireRole(["sales_leader", "pmm_admin"]);

    const [drift, icpDist, stats] = await Promise.all([
      calculateDriftScore(session.workspaceId),
      getICPDistribution(session.workspaceId),
      getCallStats(session.workspaceId),
    ]);

    // Team call activity by rep (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const repActivity = await db
      .select({
        repId: users.id,
        repName: users.name,
        callCount: sql<number>`count(${transcripts.id})::int`,
        progressedCount: sql<number>`count(${transcripts.id}) filter (where ${transcripts.callOutcome} = 'progressed')::int`,
        lostCount: sql<number>`count(${transcripts.id}) filter (where ${transcripts.callOutcome} = 'lost')::int`,
      })
      .from(users)
      .leftJoin(
        transcripts,
        and(
          eq(transcripts.repId, users.id),
          sql`${transcripts.createdAt} >= ${thirtyDaysAgo}`
        )
      )
      .where(
        and(
          eq(users.workspaceId, session.workspaceId),
          eq(users.role, "sales_rep")
        )
      )
      .groupBy(users.id, users.name)
      .orderBy(desc(sql`count(${transcripts.id})`));

    // Top signals from team (last 30 days, tier != archived/dismissed)
    const topSignals = await db
      .select({
        id: signals.id,
        title: signals.title,
        tier: signals.tier,
        polarity: signals.polarity,
        reinforcementCount: signals.reinforcementCount,
        signalType: signals.signalType,
      })
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, session.workspaceId),
          sql`${signals.tier} NOT IN ('archived', 'dismissed')`,
          sql`${signals.createdAt} >= ${thirtyDaysAgo}`
        )
      )
      .orderBy(desc(signals.reinforcementCount))
      .limit(5);

    return NextResponse.json({
      ok: true,
      drift,
      icpDist,
      stats,
      repActivity,
      topSignals,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Leader dashboard error:", error);
    return NextResponse.json({ ok: false, error: "Failed to load dashboard." }, { status: 500 });
  }
}
