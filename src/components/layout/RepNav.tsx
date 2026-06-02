"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/utils/types";

export default function RepNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: "/capture", label: "Capture" },
    { href: "/calls", label: "My Calls" },
    { href: "/battlecard", label: "Battlecards" },
    { href: "/enablement/mine", label: "Language Working" },
  ];

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[var(--color-atib-surface)]/80 border-b border-[var(--color-atib-border-subtle)]">
      <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-xs">
              A
            </div>
            <span className="font-bold text-sm">atib</span>
          </div>
          <nav className="flex gap-1">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                    isActive
                      ? "bg-[var(--color-atib-accent)]/10 text-[var(--color-atib-accent-hover)] font-medium"
                      : "text-[var(--color-atib-text-muted)] hover:text-[var(--color-atib-text)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-atib-text-dim)]">{user.name}</span>
          <button onClick={handleLogout} className="btn-ghost text-xs">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
