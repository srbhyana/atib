"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

export interface FilterOptions {
  competitors: string[];
  segments: string[];
}

export interface FilterValues {
  window: "7" | "30" | "90" | "all";
  competitor: string;
  segment: string;
  outcome: "all" | "progressed" | "stalled" | "lost";
}

export default function FilterBar({
  options,
  values,
}: {
  options: FilterOptions;
  values: FilterValues;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: keyof FilterValues, raw: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (raw === "" || raw === "all") {
      params.delete(key);
    } else {
      params.set(key, raw);
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function reset() {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  const activeCount =
    (values.window !== "30" ? 1 : 0) +
    (values.competitor ? 1 : 0) +
    (values.segment ? 1 : 0) +
    (values.outcome !== "all" ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-[var(--color-atib-surface)]/40 border border-white/5">
      <Select
        label="Window"
        value={values.window}
        onChange={(v) => update("window", v)}
        options={[
          { value: "7", label: "Last 7 days" },
          { value: "30", label: "Last 30 days" },
          { value: "90", label: "Last 90 days" },
          { value: "all", label: "All time" },
        ]}
      />
      <Select
        label="Competitor"
        value={values.competitor}
        onChange={(v) => update("competitor", v)}
        options={[
          { value: "all", label: "All" },
          ...options.competitors.map((c) => ({ value: c, label: c })),
        ]}
      />
      <Select
        label="Segment"
        value={values.segment}
        onChange={(v) => update("segment", v)}
        options={[
          { value: "all", label: "All" },
          ...options.segments.map((s) => ({ value: s, label: s })),
        ]}
      />
      <Select
        label="Outcome"
        value={values.outcome}
        onChange={(v) => update("outcome", v)}
        options={[
          { value: "all", label: "All" },
          { value: "progressed", label: "Progressed" },
          { value: "stalled", label: "Stalled" },
          { value: "lost", label: "Lost" },
        ]}
      />
      {activeCount > 0 ? (
        <button
          onClick={reset}
          disabled={pending}
          className="ml-auto text-xs text-[var(--color-atib-text-dim)] underline underline-offset-2 hover:text-[var(--color-atib-text)]"
        >
          Clear filters ({activeCount})
        </button>
      ) : null}
      {pending ? (
        <span className="text-xs text-[var(--color-atib-text-dim)]">Updating...</span>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-[var(--color-atib-text-dim)] uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--color-atib-surface)] border border-white/10 rounded-md px-2 py-1 text-[var(--color-atib-text)] text-xs focus:outline-none focus:border-[var(--color-atib-accent)]/40"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
