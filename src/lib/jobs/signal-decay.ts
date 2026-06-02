import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { signals } from "@/lib/db/schema";
import { sql, eq, and } from "drizzle-orm";
import type { Tier } from "@/lib/utils/types";

/**
 * Daily cron job — tier decay.
 *
 * Rule (atib-spec PART 6): any signal not reinforced in 30 days demotes one
 * tier. Concrete signals are exempt from automatic decay. Signals inactive
 * for 90 days are archived (recoverable, not deleted).
 *
 * If a Concrete signal hasn't been reinforced in 60 days, PMM is notified
 * (event emitted; in-app surface implements this).
 */

const DEMOTION_MAP: Record<string, Tier> = {
  evolving: "suggestion",
  suggestion: "archived",
  contested: "evolving",
};

export const signalDecay = inngest.createFunction(
  { id: "signal-decay", name: "Signal tier decay" },
  { cron: "0 7 * * *" }, // 07:00 UTC daily
  async ({ step }) => {
    // Step 1 — archive anything inactive 90+ days that isn't already archived/dismissed/concrete
    const archived = await step.run("archive-90d-inactive", async () => {
      const res = await db
        .update(signals)
        .set({ tier: "archived" })
        .where(
          and(
            sql`${signals.lastReinforced} < NOW() - INTERVAL '90 days'`,
            sql`${signals.tier} NOT IN ('archived', 'dismissed', 'concrete')`
          )
        )
        .returning({ id: signals.id });
      return { count: res.length };
    });

    // Step 2 — demote anything inactive 30-89 days by one tier (skip Concrete)
    const demoted = await step.run("demote-30d-inactive", async () => {
      const rows = await db
        .select({ id: signals.id, tier: signals.tier })
        .from(signals)
        .where(
          and(
            sql`${signals.lastReinforced} < NOW() - INTERVAL '30 days'`,
            sql`${signals.lastReinforced} >= NOW() - INTERVAL '90 days'`,
            sql`${signals.tier} IN ('evolving', 'suggestion', 'contested')`
          )
        );

      let count = 0;
      for (const row of rows) {
        const target = DEMOTION_MAP[row.tier];
        if (!target) continue;
        await db
          .update(signals)
          .set({ tier: target })
          .where(eq(signals.id, row.id));
        count++;
      }
      return { count };
    });

    return { archived: archived.count, demoted: demoted.count };
  }
);
