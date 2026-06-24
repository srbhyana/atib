import { db } from "@/lib/db/client";
import { autoAnswers } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getEmbedding } from "@/lib/llm/openai";

/**
 * Auto-Answer Bank — semantic dedup for the questions PMMs need canonical
 * answers to.
 *
 * Before this file existed, the transcripts route inserted a fresh
 * auto_answers row for every question every transcript surfaced. frequency
 * was stuck at 1 forever and the spec's "questions appearing in 3+ calls"
 * threshold was unreachable.
 *
 * Match algorithm:
 *   1. Embed the question (text-embedding-3-small via the same OpenAI client
 *      we use for signal dedup).
 *   2. Run a cosine-distance ANN query against non-dismissed rows in the
 *      same workspace. Threshold: distance < 0.20 (≈ similarity > 0.80).
 *   3. If a match: UPDATE frequency + 1, lastSeenAt = now(), and pick the
 *      longer drafted_answer (heuristic: more detail beats less).
 *   4. If no match: INSERT a fresh row with the embedding stored for next
 *      time.
 *
 * Fallback when OpenAI is unavailable: case-insensitive exact-text match.
 * Loses synonym detection but avoids hard failure.
 */

const SEMANTIC_DISTANCE_THRESHOLD = 0.20;

export interface AutoAnswerInput {
  question: string;
  draftedAnswer: string;
  alternatives: string[];
  sourceAccount: string;
}

export async function ingestAutoAnswer(
  workspaceId: string,
  input: AutoAnswerInput,
  openaiApiKey?: string | null
): Promise<{ id: string; action: "new" | "reinforced" }> {
  const question = input.question.trim();
  if (!question) {
    throw new Error("ingestAutoAnswer: question text is required");
  }

  // 1. Try to embed.
  let embedding: number[] | null = null;
  try {
    embedding = await getEmbedding(question, openaiApiKey);
  } catch (err) {
    console.warn("Auto-answer embedding failed, falling back to text match:", err);
  }

  // 2. Find a match.
  let matchId: string | null = null;
  let matchAnswer = "";

  if (embedding) {
    const embeddingStr = `[${embedding.join(",")}]`;
    const rows = await db.execute<{ id: string; drafted_answer: string; distance: number }>(sql`
      SELECT id, drafted_answer, (question_embedding <=> ${embeddingStr}::vector) AS distance
      FROM auto_answers
      WHERE workspace_id = ${workspaceId}
        AND state NOT IN ('dismissed')
        AND question_embedding IS NOT NULL
      ORDER BY question_embedding <=> ${embeddingStr}::vector
      LIMIT 1
    `);
    const top = rows.rows[0];
    if (top && Number(top.distance) < SEMANTIC_DISTANCE_THRESHOLD) {
      matchId = top.id;
      matchAnswer = top.drafted_answer || "";
    }
  }

  if (!matchId) {
    // Fallback: case-insensitive exact-text match. Catches the case where
    // embeddings are unavailable AND the catch-all where the LLM repeats
    // exact phrasing across calls.
    const fallbackRows = await db
      .select({ id: autoAnswers.id, draftedAnswer: autoAnswers.draftedAnswer })
      .from(autoAnswers)
      .where(and(
        eq(autoAnswers.workspaceId, workspaceId),
        sql`lower(${autoAnswers.question}) = lower(${question})`,
        sql`${autoAnswers.state} <> 'dismissed'`
      ))
      .limit(1);
    if (fallbackRows[0]) {
      matchId = fallbackRows[0].id;
      matchAnswer = fallbackRows[0].draftedAnswer || "";
    }
  }

  // 3. Reinforce or insert.
  if (matchId) {
    // Pick the longer drafted answer — proxy for "more detail" until PMM curates.
    const betterAnswer =
      input.draftedAnswer.length > matchAnswer.length ? input.draftedAnswer : matchAnswer;
    await db
      .update(autoAnswers)
      .set({
        frequency: sql`frequency + 1`,
        lastSeenAt: new Date(),
        draftedAnswer: betterAnswer,
        sourceAccount: input.sourceAccount || sql`source_account`,
        // State promotion: spec says a question is worth canonical attention
        // once it has shown up in 3+ calls. We bump suggestion → evolving on
        // that threshold. PMM-approved + dismissed states are untouched.
        state: sql`
          case
            when ${autoAnswers.state} = 'suggestion' and ${autoAnswers.frequency} + 1 >= 3
              then 'evolving'::auto_answer_state_enum
            else ${autoAnswers.state}
          end
        `,
      })
      .where(eq(autoAnswers.id, matchId));
    return { id: matchId, action: "reinforced" };
  }

  const [inserted] = await db
    .insert(autoAnswers)
    .values({
      workspaceId,
      question,
      draftedAnswer: input.draftedAnswer,
      alternatives: input.alternatives,
      frequency: 1,
      sourceAccount: input.sourceAccount,
      questionEmbedding: embedding ?? undefined,
    })
    .returning({ id: autoAnswers.id });

  return { id: inserted.id, action: "new" };
}
