import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { workspaces, users, canonicalContext } from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

/**
 * POST /api/auth/signup
 *
 * PMM admin creates their account + workspace during first-run setup.
 * This is the only way to create a workspace. All other users are invited.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password, companyName } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { ok: false, error: "Name, email, and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { ok: false, error: "An account with this email already exists. Try signing in instead." },
        { status: 409 }
      );
    }

    // Create workspace
    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: companyName || `${name}'s workspace`,
      })
      .returning();

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create PMM admin user
    const [user] = await db
      .insert(users)
      .values({
        workspaceId: workspace.id,
        email: email.toLowerCase().trim(),
        passwordHash,
        role: "pmm_admin",
        name,
        lastActiveAt: new Date(),
      })
      .returning();

    // Initialize canonical context with defaults
    await db.insert(canonicalContext).values({
      workspaceId: workspace.id,
      companyName: companyName || "",
      updatedBy: user.id,
    });

    // Create session
    await createSession(user.id);

    return NextResponse.json({
      ok: true,
      redirect: "/setup",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        workspaceId: workspace.id,
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    });
  } catch (error: any) {
    console.error("Signup error:", error);

    // Handle unique email constraint (Postgres error code 23505)
    if (
      error?.code === "23505" ||
      error?.message?.includes("duplicate") ||
      error?.message?.includes("unique") ||
      error?.cause?.code === "23505"
    ) {
      return NextResponse.json(
        { ok: false, error: "An account with this email already exists. Try signing in instead." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
