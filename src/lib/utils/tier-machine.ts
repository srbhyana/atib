import type { Tier } from "./types";
import { TIER_THRESHOLDS } from "./constants";

/**
 * Tier State Machine — the signal lifecycle engine.
 *
 * Every transition rule from §3.4 of the build plan.
 * This logic is invisible when working and catastrophic when wrong.
 *
 * State machine:
 *   Suggestion → Evolving → Concrete
 *   Any → Contested (when contradicts Concrete)
 *   Contested → Resolved (3 options)
 *   Any → Demoted (time decay)
 *   Any → Archived (prolonged inactivity)
 */

export interface SignalMetrics {
  /** How many calls this signal has appeared in */
  callCount: number;
  /** How many distinct reps have surfaced this signal */
  distinctReps: number;
  /** How many distinct ICP segments have surfaced this signal */
  distinctSegments: number;
  /** Days since first seen */
  daysSinceFirstSeen: number;
  /** Days since last reinforced */
  daysSinceLastReinforced: number;
  /** Number of calls with progressed outcome where this signal appeared */
  progressedCount: number;
  /** Total appearances in calls (for % calculation) */
  totalAppearances: number;
  /** Whether this signal contradicts a Concrete signal */
  contradictsConcrete: boolean;
  /** Number of calls where the contradicting signal appeared (for Contested threshold) */
  contradictionCallCount: number;
  /** Whether PMM has approved this signal */
  pmmApproved: boolean;
  /** Current tier */
  currentTier: Tier;
}

export interface TierTransition {
  from: Tier;
  to: Tier;
  reason: string;
  requiresPmmAction: boolean;
}

/**
 * Evaluate whether a signal should transition tiers.
 * Returns null if no transition is warranted.
 */
export function evaluateTierTransition(
  metrics: SignalMetrics
): TierTransition | null {
  const { currentTier } = metrics;

  // ─── Contested detection (highest priority) ──────────────────
  // Any tier can become Contested when it contradicts a Concrete signal
  if (
    metrics.contradictsConcrete &&
    metrics.contradictionCallCount >= TIER_THRESHOLDS.contested_minCalls &&
    currentTier !== "contested" &&
    currentTier !== "dismissed" &&
    currentTier !== "archived"
  ) {
    return {
      from: currentTier,
      to: "contested",
      reason: `Signal contradicts canonical truth and appeared in ${metrics.contradictionCallCount} calls.`,
      requiresPmmAction: true,
    };
  }

  // ─── Suggestion → Evolving ───────────────────────────────────
  if (currentTier === "suggestion") {
    const meetsCallThreshold =
      metrics.callCount >= TIER_THRESHOLDS.sugToEvolving_minCalls;
    const meetsTimeWindow =
      metrics.daysSinceFirstSeen <= TIER_THRESHOLDS.sugToEvolving_windowDays;
    const meetsDiversity =
      metrics.distinctReps >= TIER_THRESHOLDS.sugToEvolving_minDiversity ||
      metrics.distinctSegments >= TIER_THRESHOLDS.sugToEvolving_minDiversity;

    if (meetsCallThreshold && meetsTimeWindow && meetsDiversity) {
      return {
        from: "suggestion",
        to: "evolving",
        reason: `Appeared in ${metrics.callCount} calls within ${metrics.daysSinceFirstSeen} days, across ${metrics.distinctReps} reps and ${metrics.distinctSegments} segments.`,
        requiresPmmAction: false, // Auto-promote; notify PMM
      };
    }
  }

  // ─── Evolving → Concrete (auto-promote with PMM confirmation) ─
  if (currentTier === "evolving") {
    const meetsCallThreshold =
      metrics.callCount >= TIER_THRESHOLDS.evoToConcrete_minCalls;
    const meetsTimeWindow =
      metrics.daysSinceFirstSeen <= TIER_THRESHOLDS.evoToConcrete_windowDays;
    const progressedPct =
      metrics.totalAppearances > 0
        ? metrics.progressedCount / metrics.totalAppearances
        : 0;
    const meetsProgressedThreshold =
      progressedPct >= TIER_THRESHOLDS.evoToConcrete_minProgressedPct;
    const noContradictions = !metrics.contradictsConcrete;

    if (metrics.pmmApproved) {
      return {
        from: "evolving",
        to: "concrete",
        reason: "PMM approved promotion to Concrete.",
        requiresPmmAction: false,
      };
    }

    if (
      meetsCallThreshold &&
      meetsTimeWindow &&
      meetsProgressedThreshold &&
      noContradictions
    ) {
      return {
        from: "evolving",
        to: "concrete",
        reason: `Appeared in ${metrics.callCount} calls over ${metrics.daysSinceFirstSeen} days with ${Math.round(progressedPct * 100)}% progressed outcomes. Auto-promoting — PMM confirmation required within ${TIER_THRESHOLDS.autoPromote_confirmDays} days.`,
        requiresPmmAction: true, // Fires notification, does NOT silently promote
      };
    }
  }

  // ─── Time decay: demote after inactivity ─────────────────────
  if (
    metrics.daysSinceLastReinforced >= TIER_THRESHOLDS.decay_archiveDays &&
    currentTier !== "concrete" &&
    currentTier !== "archived" &&
    currentTier !== "dismissed"
  ) {
    return {
      from: currentTier,
      to: "archived",
      reason: `No reinforcement in ${metrics.daysSinceLastReinforced} days. Archiving.`,
      requiresPmmAction: false,
    };
  }

  if (
    metrics.daysSinceLastReinforced >= TIER_THRESHOLDS.decay_demoteDays &&
    currentTier !== "concrete" &&
    currentTier !== "archived" &&
    currentTier !== "dismissed"
  ) {
    const demotionMap: Record<string, Tier> = {
      evolving: "suggestion",
      suggestion: "archived",
      contested: "suggestion",
    };
    const newTier = demotionMap[currentTier];
    if (newTier) {
      return {
        from: currentTier,
        to: newTier,
        reason: `No reinforcement in ${metrics.daysSinceLastReinforced} days. Demoting from ${currentTier} to ${newTier}.`,
        requiresPmmAction: false,
      };
    }
  }

  return null;
}

/**
 * Check if a Contested signal has exceeded its resolution deadline.
 * Returns true if the 30-day cap has been hit and PMM must resolve.
 */
export function isContestedExpired(daysSinceContested: number): boolean {
  return daysSinceContested >= TIER_THRESHOLDS.contested_maxDays;
}

/**
 * Get valid resolution options for a Contested signal.
 */
export function getContestedResolutionOptions() {
  return [
    {
      id: "in_favor_of_concrete",
      label: "Keep current canon",
      description: "The existing Concrete signal is correct. Dismiss the contradicting signal.",
    },
    {
      id: "in_favor_of_new",
      label: "Update canon",
      description: "The new signal is correct. Demote the Concrete signal and promote the new one to Evolving.",
    },
    {
      id: "hold_for_review",
      label: "Hold for review",
      description: "Need more data. Hold for 14 days, then forced decision.",
    },
  ] as const;
}

/**
 * Calculate reinforcement weight based on call outcome.
 * Progressed calls count 2× in decay calculations per spec.
 */
export function getReinforcementWeight(callOutcome: string): number {
  return callOutcome === "progressed" ? 2 : 1;
}
