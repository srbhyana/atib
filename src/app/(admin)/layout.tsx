import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import AdminSidebar from "@/components/layout/AdminSidebar";
import RepNav from "@/components/layout/RepNav";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Role-aware chrome. Same layout group, different navigation:
  // - PMM admin → full sidebar with every module
  // - Sales rep → top RepNav with the rep-only links
  // - Sales leader / viewer → fall through to admin sidebar today (TODO: dedicated chrome)
  const isRep = session.role === "sales_rep";

  if (isRep) {
    return (
      <div className="min-h-screen flex flex-col">
        <RepNav user={session} />
        <main className="flex-1 px-4 py-8">
          <div className="max-w-4xl mx-auto">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar user={session} />
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
