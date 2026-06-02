import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/client";
import { signalDecay } from "@/lib/jobs/signal-decay";
import { signalEmbed } from "@/lib/jobs/signal-embed";
import { signalDedupe } from "@/lib/jobs/signal-dedupe";
import { positioningAudit } from "@/lib/jobs/positioning-audit";

/**
 * Inngest webhook endpoint.
 *
 * `serve()` returns route handlers compatible with Next.js App Router.
 * We cast to `any` to avoid the Inngest v3 / Next.js 16 type mismatch —
 * the runtime behaviour is correct; only the TypeScript generics disagree.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [signalDecay, signalEmbed, signalDedupe, positioningAudit],
}) as any;

export { GET, POST, PUT };
