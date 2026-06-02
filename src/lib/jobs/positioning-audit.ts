import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import {
  run5CFeasibility,
  runKindergartenTest,
  runNeedGapMapping,
} from "@/lib/agents/positioning-engine";
import { getCanonicalContext } from "@/lib/agents/canonical-context";

/**
 * Weekly cron — run the seven positioning frameworks across every workspace.
 *
 * Cadence per atib-spec PART 7:
 *   • Daily for drift score + Contested detection (handled inline on writes)
 *   • Weekly for framework runs (this job)
 *   • Monthly for Positioning Statement Audit (separate job, not yet implemented)
 */
export const positioningAudit = inngest.createFunction(
  { id: "positioning-audit-weekly", name: "Weekly positioning audit" },
  { cron: "0 9 * * 1" }, // 09:00 UTC every Monday
  async ({ step }) => {
    const allWorkspaces = await step.run("list-workspaces", async () => {
      return db.select({ id: workspaces.id }).from(workspaces);
    });

    const results: Array<{ workspaceId: string; ran: string[]; skipped?: string }> = [];

    for (const ws of allWorkspaces) {
      try {
        const ctx = await getCanonicalContext(ws.id);
        if (!ctx) {
          results.push({ workspaceId: ws.id, ran: [], skipped: "no canonical context" });
          continue;
        }

        const ran: string[] = [];
        await step.run(`5c-${ws.id}`, async () => {
          await run5CFeasibility(ws.id, ctx);
          ran.push("5c");
        });
        await step.run(`kindergarten-${ws.id}`, async () => {
          await runKindergartenTest(ws.id, ctx);
          ran.push("kindergarten");
        });
        await step.run(`need-gap-${ws.id}`, async () => {
          await runNeedGapMapping(ws.id);
          ran.push("need_gap");
        });

        results.push({ workspaceId: ws.id, ran });
      } catch (err) {
        console.error(`Positioning audit failed for workspace ${ws.id}:`, err);
        results.push({
          workspaceId: ws.id,
          ran: [],
          skipped: err instanceof Error ? err.message : "unknown error",
        });
      }
    }

    return { workspacesProcessed: results.length, results };
  }
);
