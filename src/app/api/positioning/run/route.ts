import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getCanonicalContext } from "@/lib/agents/canonical-context";
import { run5CFeasibility, runKindergartenTest, runNeedGapMapping } from "@/lib/agents/positioning-engine";

export async function POST(request: Request) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const body = await request.json();
    const { framework } = body;

    const ctx = await getCanonicalContext(session.workspaceId);
    if (!ctx) {
      return NextResponse.json(
        { ok: false, error: "Please complete setup first." },
        { status: 400 }
      );
    }

    let result;
    switch (framework) {
      case "5c":
        result = await run5CFeasibility(session.workspaceId, ctx);
        break;
      case "kindergarten":
        result = await runKindergartenTest(session.workspaceId, ctx);
        break;
      case "need_gap":
        result = await runNeedGapMapping(session.workspaceId);
        break;
      default:
        return NextResponse.json(
          { ok: false, error: `Framework "${framework}" not yet implemented.` },
          { status: 400 }
        );
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Positioning audit error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to run positioning audit." },
      { status: 500 }
    );
  }
}
