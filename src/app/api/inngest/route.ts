import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/client";
import { signalDecay } from "@/lib/jobs/signal-decay";
import { signalEmbed } from "@/lib/jobs/signal-embed";
import { signalDedupe } from "@/lib/jobs/signal-dedupe";
import { positioningAudit } from "@/lib/jobs/positioning-audit";

/**
 * Inngest webhook endpoint.
 *
 * Receives invocations for every function below. In dev, Inngest's local
 * dev server connects here. In production, the Inngest cloud service does.
 *
 * Add new functions to this array as they're written.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [signalDecay, signalEmbed, signalDedupe, positioningAudit],
});
