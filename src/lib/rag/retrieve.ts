import { db } from "@/lib/db/client";
import { kbChunks } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getEmbedding } from "@/lib/llm/openai";

/**
 * RAG retrieval helper.
 *
 * Given a query and a KB source, return the top-k most semantically similar
 * chunks. Used by Positioning Engine (positioning KB) and Battlecard Agent
 * (comp-intel KB).
 *
 * Falls back to an empty array if OpenAI embeddings are unavailable —
 * callers should treat retrieval as best-effort, never a hard dependency.
 */

export type KbSource = "positioning" | "messaging" | "comp_intel" | "gtm";

export interface RetrievedChunk {
  sectionPath: string;
  content: string;
  similarity: number;
}

export async function retrieveContext(
  query: string,
  source: KbSource,
  topK = 5,
  openaiApiKey?: string | null
): Promise<RetrievedChunk[]> {
  if (!query.trim()) return [];

  let queryEmbedding: number[];
  try {
    queryEmbedding = await getEmbedding(query, openaiApiKey);
  } catch (err) {
    console.error("RAG: embedding failed, returning no context:", err);
    return [];
  }

  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  try {
    // pgvector cosine distance operator: <=>
    // Lower distance = more similar; (1 - distance) is our similarity score.
    const rows = await db
      .select({
        sectionPath: kbChunks.sectionPath,
        content: kbChunks.content,
        distance: sql<number>`(${kbChunks.embedding} <=> ${embeddingLiteral}::vector)`,
      })
      .from(kbChunks)
      .where(eq(kbChunks.source, source))
      .orderBy(sql`${kbChunks.embedding} <=> ${embeddingLiteral}::vector`)
      .limit(topK);

    return rows.map((r) => ({
      sectionPath: r.sectionPath,
      content: r.content,
      similarity: Math.max(0, 1 - Number(r.distance)),
    }));
  } catch (err) {
    console.error("RAG: pgvector query failed:", err);
    return [];
  }
}

/**
 * Format retrieved chunks for inclusion in an LLM system prompt.
 */
export function formatRetrievedAsContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map(
      (c, i) =>
        `[Ref ${i + 1} | ${c.sectionPath} | similarity=${c.similarity.toFixed(2)}]\n${c.content}`
    )
    .join("\n\n---\n\n");
}
