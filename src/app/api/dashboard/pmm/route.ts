import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { buildPMMDashboard } from "@/lib/agents/aggregate-dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireRole(["pmm_admin"]);
    const data = await buildPMMDashboard(session.workspaceId);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("PMM dashboard error:", error);
    return NextResponse.json({ ok: false, error: "Failed to load dashboard." }, { status: 500 });
  }
}
