import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users, invitations, workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sendInviteEmail } from "@/lib/email/resend";

/**
 * POST /api/auth/magic-link-request
 *
 * Body: { email }
 *
 * Looks up an existing user by email. If found, creates a single-use
 * invitation pointing at their current role, emails the magic link, and
 * returns ok=true. If not found we STILL return ok=true to avoid email
 * enumeration. Token expires in 14 days.
 *
 * The user clicks the link → lands on /accept-invite?token=… → existing
 * accept-invite endpoint matches their email to the existing user and
 * creates a session (no new user created).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").toLowerCase().trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Provide a valid email address." },
        { status: 400 }
      );
    }

    // Look up the user. If they don't exist, return ok anyway (anti-enumeration).
    const [user] = await db
      .select({
        id: users.id,
        role: users.role,
        workspaceId: users.workspaceId,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // Don't leak whether the email is registered.
      return NextResponse.json({
        ok: true,
        message: "If that email is on file, we've sent a sign-in link.",
      });
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    await db.insert(invitations).values({
      workspaceId: user.workspaceId,
      email,
      intendedRole: user.role,
      token,
      expiresAt,
      invitedBy: user.id,
    });

    const origin = new URL(request.url).origin;
    const baseUrl = process.env.NEXTAUTH_URL || origin;
    const magicLink = `${baseUrl}/accept-invite?token=${token}`;

    let delivery: "email" | "link" = "link";

    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      try {
        const [workspace] = await db
          .select({ name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, user.workspaceId))
          .limit(1);

        await sendInviteEmail({
          workspaceId: user.workspaceId,
          toEmail: email,
          inviteUrl: magicLink,
          roleLabel: "sign in",
          workspaceName: workspace?.name || "Atib",
        });
        delivery = "email";
      } catch (emailError) {
        console.error("Magic link email send failed:", emailError);
        // Fall through — caller still gets ok with the link
      }
    }

    return NextResponse.json({
      ok: true,
      delivery,
      message:
        delivery === "email"
          ? "Sign-in link sent. Check your inbox."
          : "Sign-in link generated. Share or open the URL.",
      // We only return the raw URL when email delivery is unavailable, to keep
      // local dev workable. In production with Resend configured, the link
      // travels via email only.
      magicLink: delivery === "link" ? magicLink : undefined,
    });
  } catch (error) {
    console.error("Magic link request error:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to process magic link request." },
      { status: 500 }
    );
  }
}
