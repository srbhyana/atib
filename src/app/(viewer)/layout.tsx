import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function ViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "viewer" && session.role !== "pmm_admin") {
    redirect("/");
  }

  async function handleLogout() {
    "use server";
    const { destroySession } = await import("@/lib/auth/session");
    await destroySession();
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Minimal viewer chrome — no sidebar, just a slim header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[var(--color-atib-surface)]/80 border-b border-[var(--color-atib-border-subtle)]">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-xs">
              A
            </div>
            <span className="font-bold text-sm">atib</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-400 font-medium ml-1">
              Viewer
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-atib-text-dim)]">{session.name}</span>
            <form action={handleLogout}>
              <button type="submit" className="btn-ghost text-xs">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 py-10">
        <div className="max-w-3xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
