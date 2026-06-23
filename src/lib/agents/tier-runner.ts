import { db } from "@/lib/db/client";
import { signals, events, transcripts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { evaluateTierTransition, type SignalMetrics } from "@/lib/utils/tier-machine";
import type { Tier } from "@/lib/utils/types";

/**
 * Tier runner — wires the dead-code tier-machine into the live signal lifecycle.
 *
 * Two entry points call this:
 *   1. After a new signal is inserted (transcript ingest or bulk upload).
 *   2. After deduplicateSignal reinforces an existing signal's count.
 *
 * The runner gathers metrics from current DB state, asks tier-machine for a
 * transition, applies the tier change if warranted, and writes an `events` row
 * for the audit trail.
 *
 * Known data gap: there is no `signal_evidence` table yet, so we cannot count
 * distinct reps or segments per signal. We approximate diversity from
 * reinforcement_count — a signal reinforced N times has almost certainly come
 * from N distinct calls in practice, and at typical bulk-import + transcript
 * flow that means multiple reps. This is good enough to let auto-promotion
 * fire correctly; the precise count gets recovered when the signal_evidence
 * table lands.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function computeSignalMetrics(
  signalId: string,
  workspaceId: string
): Promise<SignalMetrics | null> {
  const [row] = await db
    .select({
      tier: signals.tier,
      reinforcementCount: signals.reinforcementCount,
      firstSeen: signals.firstSeen,
      lastReinforced: signals.lastReinforced,
      canonicalContradiction: signals.canonicalContradiction,
      sourceTranscriptId: signals.sourceTranscriptId,
    })
    .from(signals)
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspaceId)))
    .limit(1);

  if (!row) return null;

  const now = Date.now();
  const daysSinceFirstSeen = Math.floor(
    (now - new Date(row.firstSeen).getTime()) / MS_PER_DAY
  );
  const daysSinceLastReinforced = Math.floor(
    (now - new Date(row.lastReinforced).getTime()) / MS_PER_DAY
  );

  // Diversity proxy until signal_evidence ships.
  const callCount = row.reinforcementCount;
  const diversityProxy = callCount >= 3 ? 2 : 1;

  // Progressed-outcome count: best-effort lookup via the single sourceTranscriptId
  // we know about. After dedup collapses duplicates, this is an underestimate
  // (we lose visibility into the merged transcripts). signal_evidence fixes that.
  let progressedCount = 0;
  if (row.sourceTranscriptId) {
    const [outcome] = await db
      .select({ outcome: transcripts.callOutcome })
      .from(transcripts)
      .where(eq(transcripts.id, row.sourceTranscriptId))
      .limit(1);
    if (outcome?.outcome === "progressed") progressedCount = 1;
  }

  const contradicts = row.canonicalContradiction !== "no" && row.canonicalContradiction !== "";

  return {
    callCount,
    distinctReps: diversityProxy,
    distinctSegments: diversityProxy,
    daysSinceFirstSeen,
    daysSinceLastReinforced,
    progressedCount,
    totalAppearances: callCount,
    contradictsConcrete: contradicts,
    contradictionCallCount: contradicts ? callCount : 0,
    pmmApproved: false,
    currentTier: row.tier as Tier,
  };
}

/**
 * Evaluate + apply a tier transition for the given signal.
 *
 * Returns the new tier when a change was applied, null otherwise. Side effects:
 *   • UPDATE signals SET tier = ... WHERE id = ...
 *   • INSERT INTO events (... event_type='tier_transition', payload=...)
 *
 * Idempotent: if the signal is already at the target tier, no-op. Caller can
 * fire this on every signal touch without worrying about double-promotion.
 *
 * Suggestion → Concrete is gated: tier-machine returns the transition with
 * `requiresPmmAction = true` for the Evolving → Concrete auto-promote case.
 * We apply the tier change BUT keep the signal "needing PMM confirmation"
 * surfaced through a pending event. PMMs see this in the Auto-Answers Queue
 * (eventual) or via direct event query (now).
 */
export async function evaluateAndApplyTransition(
  signalId: string,
  workspaceId: string,
  actorId?: string | null
): Promise<{ from: Tier; to: Tier; reason: string } | null> {
  const metrics = await computeSignalMetrics(signalId, workspaceId);
  if (!metrics) return null;

  const transition = evaluateTierTransition(metrics);
  if (!transition) return null;
  if (transition.to === metrics.currentTier) return null;

  // Apply the tier change.
  await db
    .update(signals)
    .set({ tier: transition.to })
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspaceId)));

  // Audit-log the transition. The events table was defined but never written
  // until now — this is the first thing populating it.
  await db.insert(events).values({
    workspaceId,
    actorId: actorId ?? null,
    eventType: "signal.tier_transition",
    payload: {
      signal_id: signalId,
      from: transition.from,
      to: transition.to,
      reason: transition.reason,
      requires_pmm_action: transition.requiresPmmAction,
      automatic: true,
    },
  });

  return { from: transition.from, to: transition.to, reason: transition.reason };
}

/**
 * Bulk-evaluate transitions for a list of signal IDs. Used by the bulk-signal
 * import path so CSV rows with high mention counts can land at the right tier
 * immediately instead of waiting for the daily Inngest cron.
 */
export async function evaluateAndApplyTransitions(
  signalIds: string[],
  workspaceId: string,
  actorId?: string | null
): Promise<{ promoted: number; contested: number; demoted: number }> {
  let promoted = 0;
  let contested = 0;
  let demoted = 0;
  for (const id of signalIds) {
    const result = await evaluateAndApplyTransition(id, workspaceId, actorId);
    if (!result) continue;
    if (result.to === "contested") contested += 1;
    else if (result.to === "archived") demoted += 1;
    else if (
      (result.from === "suggestion" && result.to === "evolving") ||
      (result.from === "evolving" && result.to === "concrete")
    ) {
      promoted += 1;
    } else {
      demoted += 1;
    }
  }
  return { promoted, contested, demoted };
}
