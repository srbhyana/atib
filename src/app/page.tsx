export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import { getDefaultRoute, getSession } from "@/lib/auth/session";

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  redirect(getDefaultRoute(session.role));
}
