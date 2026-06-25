import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/client";
import { signalDecay } from "@/lib/jobs/signal-decay";
import { signalEmbed } from "@/lib/jobs/signal-embed";
import { signalDedupe } from "@/lib/jobs/signal-dedupe";

/**
 * Inngest webhook endpoint.
 *
 * `serve()` returns route handlers compatible with Next.js App Router.
 * We cast to `any` to avoid the Inngest v3 / Next.js 16 type mismatch —
 * the runtime behaviour is correct; only the TypeScript generics disagree.
 *
 * positioningAudit was unwired in v3.2 — its three frameworks (5C,
 * Need Gap, Kindergarten Test) were running weekly with no UI reading
 * the outputs. The agent file (positioning-engine.ts) stays so the
 * runners are still callable on-demand later.
 */
const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [signalDecay, signalEmbed, signalDedupe],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

export { GET, POST, PUT };
