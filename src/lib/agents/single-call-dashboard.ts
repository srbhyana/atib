import { db } from "@/lib/db/client";
import { transcripts, soapNotes, signals } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { SoapOutput, AnalysisOutput } from "@/lib/utils/types";

/**
 * Single-Call Dashboard Agent — deterministic render.
 *
 * Given a transcript_id, assembles the structured per-call view.
 * Two framings: ENABLEMENT (rep sees "language working") and
 * DRIFT (PMM sees "positioning intelligence").
 * Same data, different emotional design.
 */

export interface SingleCallView {
  transcript: {
    id: string;
    account: string;
    contact: string;
    callDate: string;
    callOutcome: string;
  };
  soap: SoapOutput;
  analysis: {
    ladderedNeed: {
      feature: string;
      advantage: string;
      terminalBenefit: string;
    };
    icpVerdict: string;
    realBlocker: string;
    buyingStage: string;
    pillarAlignment: string[];
    driftScore: number;
    kindergartenSummary: string;
    qualityWarning: string;
  };
  signals: Array<{
    id: string;
    title: string;
    content: string;
    type: string;
    verbatimQuote: string;
    polarity: string;
    tier: string;
    pillarTag: number;
    strategicImportance: string;
    canonicalContradiction: string;
  }>;
  framing: "enablement" | "drift";
}

/**
 * Build the single-call dashboard view for a given transcript.
 */
export async function buildSingleCallView(
  transcriptId: string,
  workspaceId: string,
  framing: "enablement" | "drift" = "enablement"
): Promise<SingleCallView | null> {
  // Fetch transcript
  const [transcript] = await db
    .select()
    .from(transcripts)
    .where(
      and(
        eq(transcripts.id, transcriptId),
        eq(transcripts.workspaceId, workspaceId)
      )
    )
    .limit(1);

  if (!transcript) return null;

  // Fetch SOAP note
  const [soapNote] = await db
    .select()
    .from(soapNotes)
    .where(eq(soapNotes.transcriptId, transcriptId))
    .limit(1);

  // Fetch signals for this transcript
  const callSignals = await db
    .select()
    .from(signals)
    .where(eq(signals.sourceTranscriptId, transcriptId));

  // Parse the SOAP data
  const soap: SoapOutput = soapNote
    ? {
        subjective: soapNote.subjective,
        objective: soapNote.objective,
        assessment: soapNote.assessment,
        plan: soapNote.plan,
        confidence: (soapNote.confidence as SoapOutput["confidence"]) || {
          subjective: 3,
          objective: 3,
          assessment: 3,
          plan: 3,
        },
      }
    : {
        subjective: "No SOAP analysis available.",
        objective: "No SOAP analysis available.",
        assessment: "No SOAP analysis available.",
        plan: "No SOAP analysis available.",
        confidence: { subjective: 0, objective: 0, assessment: 0, plan: 0 },
      };

  // Build the analysis view with reframed labels
  const qualityWarning = soapNote?.qualityWarning || "";

  return {
    transcript: {
      id: transcript.id,
      account: transcript.prospectAccount,
      contact: transcript.prospectContact,
      callDate: transcript.callDate,
      callOutcome: transcript.callOutcome,
    },
    soap,
    analysis: {
      ladderedNeed: {
        feature: "",
        advantage: "",
        terminalBenefit: "",
      },
      icpVerdict: "",
      realBlocker: "",
      buyingStage: "",
      pillarAlignment: [],
      driftScore: 50,
      kindergartenSummary: "",
      qualityWarning,
    },
    signals: callSignals.map((s) => ({
      id: s.id,
      title: s.title,
      content: s.content,
      type: s.signalType,
      verbatimQuote: s.verbatimQuote,
      polarity: s.polarity,
      tier: s.tier,
      pillarTag: s.pillarTag,
      strategicImportance: s.strategicImportance,
      canonicalContradiction: s.canonicalContradiction,
    })),
    framing,
  };
}

/**
 * Apply framing-specific label transformations.
 * ENABLEMENT framing (rep): "language working", "key phrases that resonated"
 * DRIFT framing (PMM): "positioning drift", "canonical misalignment"
 *
 * Same data; opposite emotional design.
 */
export function getFramingLabels(framing: "enablement" | "drift") {
  if (framing === "enablement") {
    return {
      sectionTitle: "Call Intelligence",
      signalLabel: "Language That Worked",
      driftLabel: "Pillar Alignment Score",
      contestedLabel: "Messaging Opportunity",
      emptyState: "No signals detected from this call yet.",
      qualityNote: "This call had limited data — try pasting a fuller transcript for richer insights.",
    };
  }

  return {
    sectionTitle: "PMM Signal Report",
    signalLabel: "Positioning Signals",
    driftLabel: "Drift Score",
    contestedLabel: "Canonical Contradiction",
    emptyState: "Nothing new this week.",
    qualityNote: "Insufficient data for positioning analysis.",
  };
}
