import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import LeaderNav from "@/components/layout/LeaderNav";

export default async function LeaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Only sales_leader (and pmm_admin for impersonation/debug) can access leader routes
  if (session.role !== "sales_leader" && session.role !== "pmm_admin") {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <LeaderNav user={session} />
      <main className="flex-1 px-4 py-8">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
