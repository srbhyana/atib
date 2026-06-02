import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { invitations, workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Role } from "@/lib/utils/types";
import { sendInviteEmail } from "@/lib/email/resend";

/**
 * POST /api/invitations — Create a new invitation (PMM only)
 * GET /api/invitations — List pending invitations (PMM only)
 */

export async function POST(request: Request) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const body = await request.json();

    const { email, intendedRole } = body;

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Email is required." },
        { status: 400 }
      );
    }

    const validRoles: Role[] = ["sales_rep", "sales_leader", "viewer"];
    if (!validRoles.includes(intendedRole)) {
      return NextResponse.json(
        { ok: false, error: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const [invitation] = await db
      .insert(invitations)
      .values({
        workspaceId: session.workspaceId,
        email: email.toLowerCase().trim(),
        intendedRole: intendedRole as Role,
        token,
        expiresAt,
        invitedBy: session.id,
      })
      .returning();

    const [workspace] = await db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, session.workspaceId))
      .limit(1);

    const origin = new URL(request.url).origin;
    const baseUrl = process.env.NEXTAUTH_URL || origin;
    const magicLink = `${baseUrl}/accept-invite?token=${token}`;

    let delivery: "email" | "link" = "link";
    let warning = "";

    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      try {
        await sendInviteEmail({
          workspaceId: session.workspaceId,
          toEmail: invitation.email,
          inviteUrl: magicLink,
          roleLabel: invitation.intendedRole.replace("_", " "),
          inviterName: session.name,
          workspaceName: workspace?.name || "Atib",
        });
        delivery = "email";
      } catch (emailError) {
        console.error("Invite email send failed:", emailError);
        warning = "Invite created, but email delivery failed. Share the link manually.";
      }
    }

    return NextResponse.json({
      ok: true,
      delivery,
      inviteUrl: magicLink,
      warning,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.intendedRole,
        expiresAt: invitation.expiresAt,
        magicLink,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create invitation error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create invitation." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await requireRole(["pmm_admin"]);

    const result = await db
      .select()
      .from(invitations)
      .where(eq(invitations.workspaceId, session.workspaceId));

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { ok: false, error: "Failed to list invitations." },
      { status: 500 }
    );
  }
}
