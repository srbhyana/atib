import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users, invitations } from "@/lib/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { createSession } from "@/lib/auth/session";
import { getDefaultRoute } from "@/lib/auth/permissions";
import type { Role } from "@/lib/utils/types";

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Invite token is required." },
        { status: 400 }
      );
    }

    // Find valid, unconsumed invitation
    const inviteResult = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.token, token),
          gt(invitations.expiresAt, new Date()),
          isNull(invitations.consumedAt)
        )
      )
      .limit(1);

    if (inviteResult.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired invite link." },
        { status: 401 }
      );
    }

    const invite = inviteResult[0];

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, invite.email.toLowerCase().trim()))
      .limit(1);

    let userId: string;

    if (existingUser.length > 0) {
      userId = existingUser[0].id;
      // Update last active
      await db
        .update(users)
        .set({ lastActiveAt: new Date() })
        .where(eq(users.id, userId));
    } else {
      // Create new user
      const newUser = await db
        .insert(users)
        .values({
          workspaceId: invite.workspaceId,
          email: invite.email.toLowerCase().trim(),
          role: invite.intendedRole,
          name: invite.email.split("@")[0], // Default name from email
        })
        .returning();

      userId = newUser[0].id;
    }

    // Mark invitation as consumed
    await db
      .update(invitations)
      .set({ consumedAt: new Date() })
      .where(eq(invitations.id, invite.id));

    // Create session
    await createSession(userId);

    return NextResponse.json({
      ok: true,
      redirect: getDefaultRoute(invite.intendedRole as Role),
    });
  } catch (error) {
    console.error("Accept invite error:", error);
    return NextResponse.json(
      { ok: false, error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
