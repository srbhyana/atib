import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { autoAnswers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const { id, action } = await params;

    // Confirm this auto-answer belongs to the workspace
    const [item] = await db
      .select()
      .from(autoAnswers)
      .where(and(eq(autoAnswers.id, id), eq(autoAnswers.workspaceId, session.workspaceId)))
      .limit(1);

    if (!item) {
      return NextResponse.json({ ok: false, error: "Auto-answer not found." }, { status: 404 });
    }

    switch (action) {
      case "approve": {
        const body = await request.json().catch(() => ({}));
        await db
          .update(autoAnswers)
          .set({
            state: "approved",
            approvedAt: new Date(),
            ...(body.drafted_answer ? { draftedAnswer: body.drafted_answer } : {}),
          })
          .where(eq(autoAnswers.id, id));
        return NextResponse.json({ ok: true, message: "Auto-answer approved." });
      }

      case "dismiss":
        await db
          .update(autoAnswers)
          .set({ state: "dismissed" })
          .where(eq(autoAnswers.id, id));
        return NextResponse.json({ ok: true, message: "Auto-answer dismissed." });

      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Auto-answer action error:", error);
    return NextResponse.json({ ok: false, error: "Failed to perform action." }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const { id } = await params;
    const body = await request.json();

    await db
      .update(autoAnswers)
      .set({ draftedAnswer: body.drafted_answer })
      .where(and(eq(autoAnswers.id, id), eq(autoAnswers.workspaceId, session.workspaceId)));

    return NextResponse.json({ ok: true, message: "Auto-answer updated." });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Auto-answer PUT error:", error);
    return NextResponse.json({ ok: false, error: "Failed to update." }, { status: 500 });
  }
}
