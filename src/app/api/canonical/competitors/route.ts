import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { addCompetitor, getCompetitors } from "@/lib/agents/canonical-context";

export async function POST(request: Request) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const body = await request.json();

    const comp = await addCompetitor(session.workspaceId, {
      name: body.name,
      url: body.url,
      battlecardNotes: body.notes || body.battlecardNotes,
    });

    return NextResponse.json({ ok: true, data: comp });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { ok: false, error: "Failed to add competitor." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await requireRole(["pmm_admin", "sales_rep", "sales_leader"]);
    const comps = await getCompetitors(session.workspaceId);
    return NextResponse.json({ ok: true, data: comps });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { ok: false, error: "Failed to get competitors." },
      { status: 500 }
    );
  }
}
