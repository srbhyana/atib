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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get("atib_session");

  if (!sessionCookie?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
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
