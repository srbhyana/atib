import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { signals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding } from "@/lib/llm/openai";
import { getWorkspaceOpenAIKey } from "@/lib/security/secrets";

/**
 * Triggered: `signal/created` event from the Signal Bank Agent.
 *
 * Computes a text-embedding-3-small vector for the new signal and writes it
 * to the `embedding` column. Required by Phase 2 dedup.
 *
 * Idempotent: if the signal already has an embedding, exits cleanly.
 */
export const signalEmbed = inngest.createFunction(
  { id: "signal-embed", name: "Signal embedding" },
  { event: "signal/created" },
  async ({ event, step }) => {
    const { signalId, workspaceId } = event.data as {
      signalId: string;
      workspaceId: string;
    };

    const [row] = await db
      .select({
        id: signals.id,
        title: signals.title,
        content: signals.content,
        quote: signals.verbatimQuote,
        inferredMeaning: signals.inferredMeaning,
        embedding: signals.embedding,
      })
      .from(signals)
      .where(eq(signals.id, signalId))
      .limit(1);

    if (!row) return { skipped: "signal not found" };
    if (row.embedding) return { skipped: "already embedded" };

    const text = [row.title, row.content, row.quote, row.inferredMeaning]
      .filter(Boolean)
      .join("\n");

    const key = await step.run("resolve-openai-key", async () => {
      return getWorkspaceOpenAIKey(workspaceId);
    });

    const embedding = await step.run("embed", async () => {
      return getEmbedding(text, key);
    });

    await db
      .update(signals)
      .set({ embedding })
      .where(eq(signals.id, signalId));

    return { signalId, embedded: true };
  }
);
