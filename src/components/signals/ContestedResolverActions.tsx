"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ContestedSignal {
  id: string;
  title: string;
  content: string;
  verbatimQuote: string | null;
  canonicalContradiction: string;
  signalType: string;
  reinforcementCount: number;
}

export default function ContestedResolverActions({ signal }: { signal: ContestedSignal }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function resolve(resolution: "in_favor_of_concrete" | "in_favor_of_new" | "hold_for_review") {
    setLoading(resolution);
    try {
      const res = await fetch(`/api/signals/${signal.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, notes: "" }),
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to resolve.");
      }
    } finally {
      setLoading(null);
    }
  }

  if (done) {
    return (
      <span className="text-xs text-emerald-400 font-medium">Resolved ✓</span>
    );
  }

  return (
    <div className="flex flex-col gap-1 shrink-0">
      <button
        onClick={() => resolve("in_favor_of_concrete")}
        disabled={!!loading}
        className="btn-ghost text-emerald-400 text-xs w-full text-left disabled:opacity-50"
        title="Keep current canon, dismiss this signal"
      >
        {loading === "in_favor_of_concrete" ? "..." : "Keep Canon"}
      </button>
      <button
        onClick={() => resolve("in_favor_of_new")}
        disabled={!!loading}
        className="btn-ghost text-yellow-400 text-xs w-full text-left disabled:opacity-50"
        title="Update canon to reflect this signal"
      >
        {loading === "in_favor_of_new" ? "..." : "Update Canon"}
      </button>
      <button
        onClick={() => resolve("hold_for_review")}
        disabled={!!loading}
        className="btn-ghost text-[var(--color-atib-text-dim)] text-xs w-full text-left disabled:opacity-50"
        title="Hold for 14-day review window"
      >
        {loading === "hold_for_review" ? "..." : "Hold 14d"}
      </button>
    </div>
  );
}
