import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { users, sessions } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { createHash } from "crypto";
import type { SessionUser, Role } from "@/lib/utils/types";
import { hasPermission, getDefaultRoute } from "./permissions";

const SESSION_COOKIE = "atib_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Hash a raw session token for storage.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Get the current authenticated user from the session cookie.
 * Returns null if no valid session exists.
 */
export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const tokenHash = hashToken(token);

    const result = await db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        workspaceId: users.workspaceId,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          gt(sessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (result.length === 0) {
      // Cookie is present but session is invalid/expired — clear it so the
      // middleware can redirect cleanly on the next request instead of
      // passing through and causing a server-component → /login redirect loop.
      try { cookieStore.delete(SESSION_COOKIE); } catch { /* edge/readonly context */ }
      return null;
    }

    const row = result[0];
    return {
      id: row.userId,
      email: row.email,
      name: row.name,
      role: row.role as Role,
      workspaceId: row.workspaceId,
    };
  } catch {
    // DB error — clear the cookie to avoid infinite loops
    try {
      const cookieStore = await cookies();
      cookieStore.delete(SESSION_COOKIE);
    } catch { /* edge/readonly context */ }
    return null;
  }
}

/**
 * Require authentication. Throws a response if not authenticated.
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}

/**
 * Require one of the specified roles. Throws if role doesn't match.
 */
export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const session = await requireAuth();
  if (!roles.includes(session.role)) {
    throw new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}

/**
 * Require a specific operation permission. Throws if not allowed.
 */
export async function requirePermission(operation: string): Promise<SessionUser> {
  const session = await requireAuth();
  if (!hasPermission(session.role, operation)) {
    throw new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}

/**
 * Create a new session for a user and set the cookie.
 * Returns the raw token (for magic link URLs).
 */
export async function createSession(userId: string): Promise<string> {
  const { randomUUID } = await import("crypto");
  const rawToken = randomUUID();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_MS / 1000,
    path: "/",
  });

  return rawToken;
}

/**
 * Destroy the current session (logout).
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Get the role's default landing page.
 */
export { getDefaultRoute };
