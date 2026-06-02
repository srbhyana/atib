import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { buildSingleCallView } from "@/lib/agents/single-call-dashboard";
import { db } from "@/lib/db/client";
import { transcripts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/transcripts/[id]
 * Returns full transcript detail including SOAP note and signals.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const framing = session.role === "pmm_admin" ? "drift" : "enablement";
    const view = await buildSingleCallView(
      id,
      session.workspaceId,
      framing as "enablement" | "drift"
    );

    if (!view) {
      return NextResponse.json(
        { ok: false, error: "Transcript not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: view });
  } catch (error) {
    console.error("Get transcript error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to get transcript." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/transcripts/[id]
 * PMM only — deletes a transcript and cascades.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    if (!hasPermission(session.role, "transcript.delete")) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    await db
      .delete(transcripts)
      .where(
        and(
          eq(transcripts.id, id),
          eq(transcripts.workspaceId, session.workspaceId)
        )
      );

    return NextResponse.json({ ok: true, message: "Transcript deleted." });
  } catch (error) {
    console.error("Delete transcript error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete transcript." },
      { status: 500 }
    );
  }
}
