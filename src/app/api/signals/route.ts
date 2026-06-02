import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import {
  getSignals,
  getSignalCounts,
} from "@/lib/agents/signal-bank";

export async function GET(request: Request) {
  try {
    const session = await requireRole(["pmm_admin", "sales_rep", "sales_leader"]);
    const url = new URL(request.url);

    const tier = url.searchParams.get("tier") as any;
    const type = url.searchParams.get("type") as any;
    const competitorId = url.searchParams.get("competitor_id") || undefined;
    const pillar = url.searchParams.get("pillar");

    const signals = await getSignals(session.workspaceId, {
      tier: tier || undefined,
      type: type || undefined,
      competitorId,
      pillar: pillar ? parseInt(pillar) : undefined,
      limit: 50,
    });

    const counts = await getSignalCounts(session.workspaceId);

    return NextResponse.json({ ok: true, data: { signals, counts } });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { ok: false, error: "Failed to get signals." },
      { status: 500 }
    );
  }
}
