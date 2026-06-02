import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import {
  getCanonicalContext,
  upsertCanonicalContext,
} from "@/lib/agents/canonical-context";

export async function GET() {
  try {
    const session = await requireRole(["pmm_admin", "sales_rep", "sales_leader", "viewer"]);
    const ctx = await getCanonicalContext(session.workspaceId);
    return NextResponse.json({ ok: true, data: ctx });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { ok: false, error: "Failed to get canonical context." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const body = await request.json();

    await upsertCanonicalContext(
      session.workspaceId,
      {
        companyName: body.companyName,
        positioningStatement: body.positioningStatement,
        pillar1: body.pillar1,
        pillar2: body.pillar2,
        pillar3: body.pillar3,
        icpCore: body.icpCore,
        icpAdjacent: body.icpAdjacent,
        brandVoice: body.brandVoice,
        personaProfiles: body.personaProfiles,
        winLossNotes: body.winLossNotes,
      },
      session.id
    );

    const updated = await getCanonicalContext(session.workspaceId);
    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { ok: false, error: "Failed to update canonical context." },
      { status: 500 }
    );
  }
}
