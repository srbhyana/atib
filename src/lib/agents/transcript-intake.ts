import { db } from "@/lib/db/client";
import { transcripts } from "@/lib/db/schema";
import type { CallOutcome } from "@/lib/utils/types";

/**
 * Transcript Intake Agent — deterministic.
 *
 * Owns: raw transcript ingestion. Accepts a transcript + metadata
 * and persists it. Privacy redaction happens at the prompt layer
 * (instruction to the SOAP LLM), not post-hoc string replacement.
 *
 * The LLM is better at applying redaction rules during generation
 * than at scrubbing after — this is a deliberate design choice.
 */

export interface TranscriptInput {
  workspaceId: string;
  repId: string;
  prospectAccount: string;
  prospectContact: string;
  prospectRole: string;
  prospectCompanySize: string;
  callDate: string;
  callOutcome: CallOutcome;
  rawText: string;
}

/**
 * Validate and persist a new transcript.
 * Returns the created transcript row.
 */
export async function ingestTranscript(input: TranscriptInput) {
  // Basic validation
  if (!input.rawText || input.rawText.trim().length === 0) {
    throw new Error("Transcript text is required.");
  }

  if (!input.callDate) {
    input.callDate = new Date().toISOString().slice(0, 10);
  }

  // Create the transcript row
  // redactedText is left empty — the SOAP agent handles redaction
  // at the prompt layer, not here
  const result = await db
    .insert(transcripts)
    .values({
      workspaceId: input.workspaceId,
      repId: input.repId,
      prospectAccount: input.prospectAccount || "",
      prospectContact: input.prospectContact || "",
      prospectRole: input.prospectRole || "",
      prospectCompanySize: input.prospectCompanySize || "",
      callDate: input.callDate,
      callOutcome: input.callOutcome || "unclear",
      rawText: input.rawText,
      redactedText: "", // Populated after SOAP processes it
    })
    .returning();

  return result[0];
}

/**
 * Count word count and exchanges in a transcript.
 * Used by SOAP agent to determine failure modes.
 */
export function analyzeTranscriptQuality(text: string): {
  wordCount: number;
  exchangeCount: number;
  isSufficient: boolean;
} {
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Count exchanges: look for speaker turns (patterns like "Name:", "Speaker:", etc.)
  const speakerPattern = /^[A-Z][a-z]+(\s[A-Z][a-z]+)?:/gm;
  const matches = text.match(speakerPattern);
  const exchangeCount = matches ? matches.length : 1;

  return {
    wordCount,
    exchangeCount,
    isSufficient: wordCount >= 200 && exchangeCount >= 3,
  };
}
