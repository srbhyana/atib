// Server wrapper for the client-side login form. The `force-dynamic` export
// only takes effect on Server Component pages — when /login was itself a
// "use client" file, Next prerendered it as static (○ /login) and Railway's
// edge cached it for s-maxage=31536000, bypassing middleware and bringing
// back the stale-cookie redirect loop. Splitting wrapper (server) from form
// (client) is what actually forces /login to be dynamic.

import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LoginPage() {
  return <LoginForm />;
}
