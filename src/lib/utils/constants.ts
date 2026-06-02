// ─── Atib Constants ────────────────────────────────────────────────

/** Maximum items shown per dashboard module by default */
export const DASHBOARD_MODULE_CAP = 5;

/** SOAP section word soft cap */
export const SOAP_WORD_CAP = 100;

/** Minimum transcript word count for full analysis */
export const MIN_TRANSCRIPT_WORDS = 200;

/** Minimum exchanges for full analysis */
export const MIN_TRANSCRIPT_EXCHANGES = 3;

/** Tier badge colors */
export const TIER_COLORS = {
  concrete: { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
  evolving: { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30" },
  contested: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30" },
  suggestion: { bg: "bg-zinc-500/15", text: "text-zinc-400", border: "border-zinc-500/30" },
  archived: { bg: "bg-zinc-800/15", text: "text-zinc-600", border: "border-zinc-700/30" },
  dismissed: { bg: "bg-zinc-800/15", text: "text-zinc-600", border: "border-zinc-700/30" },
} as const;

/** Importance badge colors */
export const IMPORTANCE_COLORS = {
  Critical: { bg: "bg-red-500/15", text: "text-red-400" },
  High: { bg: "bg-orange-500/15", text: "text-orange-400" },
  Medium: { bg: "bg-yellow-500/15", text: "text-yellow-400" },
  Low: { bg: "bg-zinc-500/15", text: "text-zinc-400" },
} as const;

/** Polarity colors */
export const POLARITY_COLORS = {
  Reinforces: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  Contradicts: { bg: "bg-red-500/15", text: "text-red-400" },
  Extends: { bg: "bg-blue-500/15", text: "text-blue-400" },
  Neutral: { bg: "bg-zinc-500/15", text: "text-zinc-400" },
} as const;

/** Signal tier promotion thresholds */
export const TIER_THRESHOLDS = {
  /** Minimum calls for Suggestion → Evolving */
  sugToEvolving_minCalls: 3,
  /** Window (days) for Suggestion → Evolving */
  sugToEvolving_windowDays: 14,
  /** Minimum reps OR ICP segments for Suggestion → Evolving */
  sugToEvolving_minDiversity: 2,

  /** Minimum calls for Evolving → Concrete auto-promote */
  evoToConcrete_minCalls: 8,
  /** Window (days) for Evolving → Concrete */
  evoToConcrete_windowDays: 30,
  /** Min % progressed outcomes for auto-promote */
  evoToConcrete_minProgressedPct: 0.5,

  /** Calls needed for Contested flag */
  contested_minCalls: 3,
  /** Max days Contested can stay unresolved */
  contested_maxDays: 30,

  /** Days of inactivity before demotion */
  decay_demoteDays: 30,
  /** Days of inactivity before archive */
  decay_archiveDays: 90,

  /** PMM confirmation window for auto-promote (days) */
  autoPromote_confirmDays: 7,
} as const;

/** Drift score interpretation */
export function getDriftColor(score: number): "green" | "amber" | "red" {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "red";
}

/** API response shape */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}
