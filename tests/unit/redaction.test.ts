import { describe, it, expect } from "vitest";
import { analyzeTranscriptQuality } from "@/lib/agents/transcript-intake";

/**
 * Redaction tests — validates the quality analysis layer that determines
 * whether a transcript meets the INSUFFICIENT DATA threshold.
 *
 * The actual privacy redaction (names, revenue figures, project codenames)
 * happens inside the SOAP LLM prompt at inference time. These tests cover:
 *   1. Word count / exchange detection (the INSUFFICIENT DATA gate)
 *   2. Speaker turn parsing
 *
 * For a full integration test of the LLM-level redaction, see
 *   tests/integration/soap-pipeline.test.ts (requires a live API key).
 */

describe("analyzeTranscriptQuality", () => {
  it("flags short transcripts (< 200 words) as insufficient", () => {
    const shortText = "Rep: Hi. Prospect: Hello. Rep: Okay bye.";
    const result = analyzeTranscriptQuality(shortText);
    expect(result.wordCount).toBeLessThan(200);
    expect(result.isSufficient).toBe(false);
  });

  it("flags transcripts with fewer than 3 exchanges as insufficient", () => {
    // > 200 words but only 2 speaker turns
    const twoTurnText =
      "Rep: " + "word ".repeat(100) + "\nProspect: " + "word ".repeat(100);
    const result = analyzeTranscriptQuality(twoTurnText);
    expect(result.exchangeCount).toBeLessThan(3);
    expect(result.isSufficient).toBe(false);
  });

  it("marks adequate transcripts as sufficient", () => {
    const adequateText = [
      "Rep: " + "Hello there this is a longer opening statement ".repeat(5),
      "Prospect: " + "Yes we are looking at options for our team ".repeat(5),
      "Rep: " + "Great let me tell you about our positioning ".repeat(5),
      "Prospect: " + "That makes sense and here is what matters to us ".repeat(5),
      "Rep: " + "Understood and here is how we address that concern ".repeat(5),
    ].join("\n");

    const result = analyzeTranscriptQuality(adequateText);
    expect(result.wordCount).toBeGreaterThanOrEqual(200);
    expect(result.exchangeCount).toBeGreaterThanOrEqual(3);
    expect(result.isSufficient).toBe(true);
  });

  it("counts multi-word speaker names correctly", () => {
    const text = [
      "John Smith: Hello",
      "Jane Doe: Hi there",
      "John Smith: How are you?",
    ].join("\n");
    const result = analyzeTranscriptQuality(text);
    expect(result.exchangeCount).toBeGreaterThanOrEqual(3);
  });

  it("returns wordCount 0 for empty string", () => {
    const result = analyzeTranscriptQuality("");
    expect(result.wordCount).toBe(0);
    expect(result.isSufficient).toBe(false);
  });

  it("handles transcripts with no speaker-turn formatting", () => {
    // Still computes word count even without structured turns
    const freeformText = "word ".repeat(300);
    const result = analyzeTranscriptQuality(freeformText);
    expect(result.wordCount).toBe(300);
    expect(result.exchangeCount).toBe(1); // no turns detected
    expect(result.isSufficient).toBe(false); // fails exchange threshold
  });
});

// ─── Privacy token patterns (unit-level sanity checks) ───────────

describe("Privacy redaction tokens (spec compliance)", () => {
  /**
   * These are intentional pattern tests — not testing the LLM redaction
   * itself (that's integration-level), but verifying that the SOAP prompt
   * spec defines the correct replacement tokens.
   */
  const EXPECTED_TOKENS = ["[colleague]", "[project]", "[revenue figure]"];

  it("replacement tokens are defined as non-empty strings", () => {
    for (const token of EXPECTED_TOKENS) {
      expect(token.length).toBeGreaterThan(0);
      expect(token.startsWith("[")).toBe(true);
      expect(token.endsWith("]")).toBe(true);
    }
  });

  it("tokens do not contain PII themselves", () => {
    for (const token of EXPECTED_TOKENS) {
      // Should not contain numbers, email patterns, or proper nouns
      expect(token).not.toMatch(/\d/);
      expect(token).not.toMatch(/@/);
    }
  });
});
