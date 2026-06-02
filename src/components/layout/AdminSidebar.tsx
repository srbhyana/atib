"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/utils/types";

const NAV_ITEMS = [
  { href: "/capture", label: "Capture Call", icon: "✦", primary: true },
  { href: "/dashboard", label: "Dashboard", icon: "◆" },
  { href: "/calls", label: "All Calls", icon: "☎" },
  { href: "/signals", label: "Signals", icon: "◈" },
  { href: "/signals/contested", label: "Contested", icon: "⚡" },
  { href: "/enablement", label: "Enablement", icon: "▲" },
  { href: "/auto-answers", label: "Auto-Answers", icon: "?" },
  { href: "/competitors", label: "Competitors", icon: "⊕" },
  { href: "/icp", label: "ICP Fit", icon: "◉" },
  { href: "/positioning", label: "Positioning", icon: "⊙" },
  { href: "/settings", label: "Settings", icon: "⚙" },
] as const;

export default function AdminSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="fixed left-0 top-0 w-64 h-screen bg-[var(--color-atib-surface)]/80 backdrop-blur-xl border-r border-[var(--color-atib-border-subtle)] flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 pb-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-violet-500/20">
            A
          </div>
          <span className="text-lg font-bold tracking-tight">atib</span>
        </Link>
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-atib-text-dim)] mt-2 ml-11">
          PMM Intelligence
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const isPrimary = "primary" in item && item.primary;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isPrimary
                  ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 mb-3"
                  : isActive
                  ? "bg-[var(--color-atib-accent)]/10 text-[var(--color-atib-accent-hover)] border border-[var(--color-atib-accent)]/20"
                  : "text-[var(--color-atib-text-muted)] hover:text-[var(--color-atib-text)] hover:bg-[var(--color-atib-surface-2)]"
              }`}
            >
              <span className={`text-xs w-4 text-center ${isPrimary ? "opacity-100" : "opacity-60"}`}>{item.icon}</span>
              {item.label}
              {item.label === "Contested" && (
                <span className="ml-auto w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-[var(--color-atib-border-subtle)]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-[var(--color-atib-accent)]/15 flex items-center justify-center text-[var(--color-atib-accent)] text-xs font-bold">
            {user.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-[10px] text-[var(--color-atib-text-dim)] truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="btn-ghost w-full text-left text-xs text-[var(--color-atib-text-dim)]"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
