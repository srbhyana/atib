import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import {
  approveSignal,
  dismissSignal,
  promoteSignal,
  demoteSignal,
  resolveContestedSignal,
  type ContestedResolution,
} from "@/lib/agents/signal-bank";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const { id, action } = await params;

    switch (action) {
      case "approve":
        await approveSignal(id, session.workspaceId, session.id);
        return NextResponse.json({ ok: true, message: "Signal approved and promoted to Concrete." });

      case "dismiss":
        await dismissSignal(id, session.workspaceId);
        return NextResponse.json({ ok: true, message: "Signal dismissed." });

      case "promote": {
        const body = await request.json();
        await promoteSignal(id, session.workspaceId, body.to_tier || "evolving");
        return NextResponse.json({ ok: true, message: `Signal promoted to ${body.to_tier || "evolving"}.` });
      }

      case "demote":
        await demoteSignal(id, session.workspaceId);
        return NextResponse.json({ ok: true, message: "Signal demoted." });

      case "resolve": {
        const body = await request.json();
        const validResolutions: ContestedResolution[] = [
          "in_favor_of_concrete",
          "in_favor_of_new",
          "hold_for_review",
        ];
        if (!validResolutions.includes(body.resolution)) {
          return NextResponse.json(
            { ok: false, error: "Invalid resolution value." },
            { status: 400 }
          );
        }
        await resolveContestedSignal(
          id,
          body.resolution as ContestedResolution,
          body.notes || "",
          session.id,
          session.workspaceId
        );
        return NextResponse.json({ ok: true, message: "Contested signal resolved." });
      }

      default:
        return NextResponse.json(
          { ok: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Signal action error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to perform signal action." },
      { status: 500 }
    );
  }
}
