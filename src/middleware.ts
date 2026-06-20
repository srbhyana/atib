import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware — lightweight route guard.
 *
 * We don't do full session validation here (that requires DB access which
 * is async and expensive in edge middleware). Instead we just check for
 * the presence of the session cookie and redirect to /login if missing.
 *
 * Full auth is enforced in the server components via getSession().
 *
 * IMPORTANT: When redirecting to /login, we delete the session cookie on the
 * response so the browser doesn't keep sending a stale cookie, which would
 * cause getSession() to return null → server component redirects to /login →
 * middleware sees cookie → passes through → infinite redirect loop.
 */

const PUBLIC_ROUTES = [
  "/login",
  "/accept-invite",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/accept-invite",
  "/api/auth/magic-link-request",
  "/api/auth/logout",
  "/api/health",
  "/api/inngest",
];

const SESSION_COOKIE = "atib_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Allow public routes (no redirect, no auth check)
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE);

  if (!sessionCookie?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    const response = NextResponse.redirect(loginUrl);
    // Ensure the cookie is fully cleared so the browser doesn't loop
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
