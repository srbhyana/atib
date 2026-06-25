import { callSoap } from "@/lib/llm/anthropic";
import { buildSoapPrompt, buildSoapUserMessage } from "@/lib/llm/prompts/soap-v3";
import type {
  CanonicalContextBlock,
  SoapOutput,
  AnalysisOutput,
  SoapResult,
} from "@/lib/utils/types";
import { analyzeTranscriptQuality } from "./transcript-intake";

/**
 * SOAP Agent — LLM-powered (the core of the system).
 *
 * Owns: clinical PMM-grade intelligence extraction from a single transcript.
 * Model: Claude Sonnet 4.6. Haiku is too small for this job.
 *
 * Handles five failure modes explicitly:
 * 1. INSUFFICIENT DATA
 * 2. OFF-TOPIC
 * 3. OUTSIDE ICP
 * 4. TRANSCRIPT QUALITY WARNING
 * 5. API timeout/failure → heuristic fallback
 */

export async function runSoapAnalysis(
  transcript: string,
  account: string,
  contact: string,
  canonicalCtx: CanonicalContextBlock,
  apiKeys?: {
    anthropicApiKey?: string | null;
  }
): Promise<SoapResult> {
  // Try LLM first
  try {
    const systemPrompt = buildSoapPrompt(canonicalCtx);
    const userMessage = buildSoapUserMessage(account, contact, transcript);

    const rawResponse = await callSoap(
      systemPrompt,
      userMessage,
      apiKeys?.anthropicApiKey || null
    );
    const parsed = parseSoapResponse(rawResponse);

    if (parsed) {
      return { soap: parsed.soap, analysis: parsed.analysis, source: "llm" };
    }
  } catch (error) {
    console.error("LLM SOAP failed, falling back to heuristic:", error);
  }

  // Heuristic fallback
  const heuristic = buildHeuristicSoap(transcript, account, contact, canonicalCtx);
  return { ...heuristic, source: "heuristic" };
}

/**
 * Parse the LLM's JSON response into typed SOAP + Analysis objects.
 */
function parseSoapResponse(
  text: string
): { soap: SoapOutput; analysis: AnalysisOutput } | null {
  try {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);

    if (!parsed.soap || !parsed.analysis) {
      return null;
    }

    // Ensure confidence scores are numbers
    if (parsed.soap.confidence) {
      for (const key of ["subjective", "objective", "assessment", "plan"]) {
        parsed.soap.confidence[key] = Number(parsed.soap.confidence[key]) || 3;
      }
    }

    // Ensure signals is an array
    if (!Array.isArray(parsed.analysis.signals)) {
      parsed.analysis.signals = [];
    }

    // Ensure questions is an array
    if (!Array.isArray(parsed.analysis.questions)) {
      parsed.analysis.questions = [];
    }

    return { soap: parsed.soap, analysis: parsed.analysis };
  } catch {
    return null;
  }
}

/**
 * Heuristic SOAP fallback — when the LLM is unavailable.
 * Produces a best-effort analysis from the transcript text alone.
 * Ported from server/domain.js in the prototype.
 */
function buildHeuristicSoap(
  transcript: string,
  account: string,
  contact: string,
  ctx: CanonicalContextBlock
): { soap: SoapOutput; analysis: AnalysisOutput } {
  const quality = analyzeTranscriptQuality(transcript);
  const lines = transcript.split("\n").filter((l) => l.trim().length > 0);
  const lowerText = transcript.toLowerCase();

  // Detect competitors
  const mentionedCompetitors = ctx.competitors
    .filter((c) => lowerText.includes(c.name.toLowerCase()))
    .map((c) => c.name);

  // Detect pillar matches
  const matchedPillars = ctx.pillars.filter(
    (p) => p && lowerText.includes(p.toLowerCase().split(" ")[0])
  );

  // Detect keywords for call type and outcome
  const isDemoCall = /demo|demonstration|walkthrough|show you/i.test(transcript);
  const isSupportCall = /ticket|issue|bug|broken|not working/i.test(transcript);
  const isProgressed = /next step|follow up|schedule|let's move|sounds good/i.test(transcript);
  const isLost = /not a fit|going with|chose .+ instead|not interested/i.test(transcript);

  const callOutcome = isProgressed
    ? "progressed"
    : isLost
      ? "lost"
      : "unclear";

  // Extract potential verbatim quotes (lines in quotation marks or said by prospect)
  const quotes = lines
    .filter((l) => l.includes('"') || l.includes("'"))
    .slice(0, 3);

  // Build signals from keyword detection
  const heuristicSignals = [];

  if (mentionedCompetitors.length > 0) {
    heuristicSignals.push({
      title: `Competitor mentioned: ${mentionedCompetitors[0]}`,
      content: `Prospect mentioned ${mentionedCompetitors.join(", ")} during the call.`,
      type: "competitor_mention" as const,
      quote: quotes[0] || "(extracted from transcript context)",
      inferredMeaning: "[INFER] Prospect is evaluating alternatives including named competitors.",
      pillarTag: 0,
      polarity: "Neutral" as const,
      strategicImportance: "Medium" as const,
      state: "suggestion" as const,
      canonicalContradiction: "no" as const,
      contestedAgainst: "",
      route: "competitor_radar",
      sourceSection: "objective",
      competitorTagged: mentionedCompetitors[0],
      // Heuristic fallback can't infer confidence reliably; default low.
      confidenceScore: 0.3,
    });
  }

  const soap: SoapOutput = {
    subjective: quality.isSufficient
      ? `Prospect from ${account || "unknown account"} discussed their needs. ${quotes.length > 0 ? `Key quote: "${quotes[0]?.slice(0, 100)}"` : "No direct quotes captured."} [Heuristic analysis — connect an Anthropic API key for full intelligence extraction.]`
      : "Insufficient transcript data for meaningful subjective analysis.",
    objective: `Contact: ${contact || "Unknown"}. Account: ${account || "Unknown"}. Transcript length: ${quality.wordCount} words, ${quality.exchangeCount} exchanges. ${mentionedCompetitors.length > 0 ? `Competitors mentioned: ${mentionedCompetitors.join(", ")}.` : ""} Call outcome: ${callOutcome}.`,
    assessment: quality.isSufficient
      ? `[INFER] Based on heuristic analysis of transcript keywords. ${matchedPillars.length > 0 ? `Pillars touched: ${matchedPillars.join(", ")}.` : "No clear pillar alignment detected."} ${isDemoCall ? "Call type appears to be a demo." : isSupportCall ? "Call type appears to be support-related." : "Standard sales conversation."} Full LLM analysis required for accurate assessment.`
      : "Insufficient data for messaging analysis.",
    plan: quality.isSufficient
      ? `SALES ACTION: Follow up within 48 hours with ${account || "the prospect"} to maintain momentum. PMM ACTION: Review this transcript with full LLM analysis enabled for accurate signal extraction.`
      : "Insufficient data — request fuller transcript.",
    confidence: {
      subjective: quality.isSufficient ? 2 : 1,
      objective: quality.isSufficient ? 3 : 1,
      assessment: quality.isSufficient ? 1 : 1,
      plan: quality.isSufficient ? 2 : 1,
    },
  };

  const analysis: AnalysisOutput = {
    qualityWarning: quality.isSufficient ? "" : "INSUFFICIENT DATA",
    callType: isDemoCall ? "demo" : isSupportCall ? "support" : "sales",
    insufficientData: !quality.isSufficient,
    offTopic: isDemoCall || isSupportCall,
    callOutcome,
    blockerType: "not_blocked",
    buyingStage: "awareness",
    icpVerdict: "unclear",
    needGap: "awareness",
    resonanceLayer: "rational",
    featureRequested: "",
    advantage: "",
    terminalBenefit: "",
    reasonToBelieve: "",
    personaTagged: contact || "Unknown",
    segmentTagged: "mid-market",
    buyingTrigger: "",
    useCase: "",
    primaryConcern: "",
    primaryPain: "",
    nextStep: isProgressed ? "Follow-up scheduled" : "",
    driftScore: 50,
    kindergartenSummary: "",
    competitors: mentionedCompetitors,
    matchedPillars,
    championStrength: "",
    hiddenStakeholders: [],
    signals: heuristicSignals,
    questions: [],
  };

  return { soap, analysis };
}
