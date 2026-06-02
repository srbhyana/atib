import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import {
  getBattlecard,
  updateBattlecardSections,
  type BattlecardSections,
} from "@/lib/agents/battlecard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole([
      "pmm_admin",
      "sales_rep",
      "sales_leader",
    ]);
    const { id } = await params;

    const card = await getBattlecard(session.workspaceId, id);
    if (!card) {
      return NextResponse.json(
        { ok: false, error: "Battlecard not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: card });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { ok: false, error: "Failed to fetch battlecard." },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const { id } = await params;
    const body = await request.json();

    await updateBattlecardSections(
      session.workspaceId,
      id,
      body.sections as Partial<BattlecardSections>
    );

    const updated = await getBattlecard(session.workspaceId, id);
    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { ok: false, error: "Failed to update battlecard." },
      { status: 500 }
    );
  }
}
