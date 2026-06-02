import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { signals, positioningAudits } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { calculateDriftScore } from "@/lib/agents/aggregate-dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireRole(["viewer", "pmm_admin", "sales_leader"]);

    const [drift] = await Promise.all([
      calculateDriftScore(session.workspaceId),
    ]);

    // Top 3 trends: evolving or concrete signals ranked by reinforcement count
    const topTrends = await db
      .select({
        id: signals.id,
        title: signals.title,
        content: signals.content,
        tier: signals.tier,
        polarity: signals.polarity,
        reinforcementCount: signals.reinforcementCount,
        signalType: signals.signalType,
        pillarTag: signals.pillarTag,
      })
      .from(signals)
      .where(
        and(
          eq(signals.workspaceId, session.workspaceId),
          sql`${signals.tier} IN ('evolving', 'concrete')`
        )
      )
      .orderBy(desc(signals.reinforcementCount))
      .limit(3);

    // Latest positioning audit summary (most recent any-framework run)
    const latestAudit = await db
      .select({
        id: positioningAudits.id,
        framework: positioningAudits.framework,
        runAt: positioningAudits.runAt,
        output: positioningAudits.output,
        flags: positioningAudits.flags,
      })
      .from(positioningAudits)
      .where(eq(positioningAudits.workspaceId, session.workspaceId))
      .orderBy(desc(positioningAudits.runAt))
      .limit(1);

    return NextResponse.json({
      ok: true,
      drift,
      topTrends,
      latestAudit: latestAudit[0] || null,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Viewer dashboard error:", error);
    return NextResponse.json({ ok: false, error: "Failed to load dashboard." }, { status: 500 });
  }
}
