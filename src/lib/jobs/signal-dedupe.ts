import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { signals } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { deduplicateSignal } from "@/lib/agents/signal-bank";

/**
 * Daily cron — run dedup on any recently-embedded signals that haven't
 * been processed yet.
 *
 * Also handles the case where Inngest was down during ingest (the signal
 * was inserted but the event-driven signal-embed job never fired, or it
 * fired but dedup wasn't called). We process signals embedded in the last
 * 48 hours to catch up.
 *
 * Idempotent: reinforcing an already-reinforced signal is safe (the
 * original will just get one more count increment, which the duplicate
 * prevents by being archived first).
 */
export const signalDedupe = inngest.createFunction(
  { id: "signal-dedupe", name: "Signal deduplication" },
  { cron: "30 7 * * *" }, // 07:30 UTC daily, after signal-decay runs at 07:00
  async ({ step }) => {
    // Find signals that have embeddings but haven't been archived/dismissed
    // and were created in the last 48 hours (catch-up window)
    const candidates = await step.run("find-candidates", async () => {
      return db
        .select({ id: signals.id, workspaceId: signals.workspaceId })
        .from(signals)
        .where(
          and(
            sql`${signals.embedding} IS NOT NULL`,
            sql`${signals.tier} NOT IN ('archived', 'dismissed', 'concrete')`,
            sql`${signals.createdAt} >= NOW() - INTERVAL '48 hours'`
          )
        )
        .limit(200);
    });

    let reinforced = 0;
    let flagged = 0;
    let newSignals = 0;

    for (const candidate of candidates) {
      const result = await step.run(`dedupe-${candidate.id}`, async () => {
        return deduplicateSignal(candidate.id, candidate.workspaceId);
      });

      if (result.action === "reinforced") reinforced++;
      else if (result.action === "flagged") flagged++;
      else newSignals++;
    }

    return {
      processed: candidates.length,
      reinforced,
      flagged,
      new: newSignals,
    };
  }
);
