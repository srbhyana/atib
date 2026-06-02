import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import {
  publishBattlecard,
  archiveBattlecard,
} from "@/lib/agents/battlecard";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const { id, action } = await params;

    switch (action) {
      case "publish":
        await publishBattlecard(session.workspaceId, id, session.id);
        return NextResponse.json({
          ok: true,
          message: "Battlecard published.",
        });

      case "archive":
        await archiveBattlecard(session.workspaceId, id);
        return NextResponse.json({
          ok: true,
          message: "Battlecard archived.",
        });

      default:
        return NextResponse.json(
          { ok: false, error: `Unknown battlecard action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Battlecard action error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to perform battlecard action." },
      { status: 500 }
    );
  }
}
