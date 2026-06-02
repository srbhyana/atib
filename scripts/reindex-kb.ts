/**
 * scripts/reindex-kb.ts
 *
 * Build (or rebuild) the kb_chunks table from the four KB markdown files.
 *
 * Idempotent: deletes existing rows for each source before re-inserting.
 *
 * Run via:
 *   npx tsx scripts/reindex-kb.ts
 *   npx tsx scripts/reindex-kb.ts positioning   # single source
 *
 * Required env:
 *   DATABASE_URL
 *   OPENAI_API_KEY  (used for text-embedding-3-small)
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { chunkMarkdown } from "../src/lib/rag/chunk";
import { db } from "../src/lib/db/client";
import { kbChunks } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbeddings } from "../src/lib/llm/openai";

type KbSource = "positioning" | "messaging" | "comp_intel" | "gtm";

const SOURCES: { source: KbSource; file: string }[] = [
  { source: "positioning", file: "positioning.md" },
  { source: "messaging", file: "messaging.md" },
  { source: "comp_intel", file: "comp-intel.md" },
  { source: "gtm", file: "gtm.md" },
];

const KB_DIR = path.resolve(__dirname, "..", "knowledge-base");
const EMBED_BATCH_SIZE = 100;

async function indexSource({ source, file }: { source: KbSource; file: string }) {
  const fullPath = path.join(KB_DIR, file);
  const markdown = await fs.readFile(fullPath, "utf8");
  console.log(`\n[${source}] read ${markdown.length} chars from ${file}`);

  const chunks = chunkMarkdown(source, markdown);
  console.log(`[${source}] chunked → ${chunks.length} chunks`);

  if (chunks.length === 0) {
    console.warn(`[${source}] no chunks produced; skipping.`);
    return;
  }

  // Clear existing chunks for this source
  await db.delete(kbChunks).where(eq(kbChunks.source, source));
  console.log(`[${source}] cleared existing kb_chunks rows`);

  // Embed in batches
  let inserted = 0;
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((c) => c.content);

    let embeddings: number[][];
    try {
      embeddings = await getEmbeddings(texts);
    } catch (err) {
      console.error(
        `[${source}] embedding batch ${i / EMBED_BATCH_SIZE + 1} failed:`,
        err
      );
      throw err;
    }

    await db.insert(kbChunks).values(
      batch.map((c, j) => ({
        source,
        sectionPath: c.sectionPath,
        content: c.content,
        embedding: embeddings[j],
        tokenCount: c.tokenCount,
      }))
    );

    inserted += batch.length;
    process.stdout.write(`[${source}] inserted ${inserted}/${chunks.length}\r`);
  }
  console.log(`\n[${source}] done. ${inserted} chunks indexed.`);
}

async function main() {
  const filterArg = process.argv[2];
  const sourcesToRun = filterArg
    ? SOURCES.filter((s) => s.source === filterArg)
    : SOURCES;

  if (sourcesToRun.length === 0) {
    console.error(
      `Unknown source: ${filterArg}. Expected one of: ${SOURCES.map((s) => s.source).join(", ")}`
    );
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set in env. Cannot embed.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in env. Cannot write to DB.");
    process.exit(1);
  }

  for (const s of sourcesToRun) {
    await indexSource(s);
  }

  console.log("\n✓ All KB sources indexed.");
}

main().catch((err) => {
  console.error("Reindex failed:", err);
  process.exit(1);
});
