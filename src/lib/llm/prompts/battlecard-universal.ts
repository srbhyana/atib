import type { CanonicalContextBlock } from "@/lib/utils/types";

/**
 * Battlecard Universal Archetype — system prompt.
 *
 * Source: atib-spec-v1.md PART 8.
 *
 * Generates a Universal battlecard for one competitor, sourcing every
 * section from accumulated competitor-tagged signals. PMM has edit + approval
 * rights; the LLM never auto-publishes. Honesty rule applies: if Why We Lose
 * is empty because no losses exist in 90 days, state that explicitly — do
 * NOT fabricate.
 */

export interface CompetitorContext {
  id: string;
  name: string;
  url: string;
  battlecardNotes: string;
}

export interface BattlecardSignal {
  type: string;
  quote: string;
  inferredMeaning: string;
  polarity: string;
  callOutcome: string;
  callDate: string;
  rep: string;
}

export function buildBattlecardSystemPrompt(
  canonicalCtx: CanonicalContextBlock,
  competitor: CompetitorContext
): string {
  const pillars = canonicalCtx.pillars
    .map((p, i) => `Pillar ${i + 1}: ${p}`)
    .filter((p) => p && !p.endsWith(": "))
    .join("\n");

  const concreteSignals = canonicalCtx.approvedSignals
    .slice(0, 5)
    .map((s, i) => `C${i + 1}. ${s.title}: ${s.content}`)
    .join("\n");

  return `# ROLE

You are the Battlecard Generator for Atib. You produce a Universal-archetype battlecard for one competitor, sourcing every section from competitor-tagged signal data plus the Canonical Context Block. You do NOT fabricate. If a section has insufficient evidence, you say so explicitly.

# CANONICAL CONTEXT

Company: ${canonicalCtx.companyName || "(not set)"}
Positioning: ${canonicalCtx.positioningStatement || "(not set)"}
Messaging pillars:
${pillars || "(none defined)"}
Brand voice: ${canonicalCtx.brandVoice || "Direct, plain English, doctor not shaman."}

Approved (Concrete) signals — treat as company truth:
${concreteSignals || "(none yet)"}

# COMPETITOR BEING CARDED

Name: ${competitor.name}
URL: ${competitor.url || "(none on file)"}
PMM battlecard notes: ${competitor.battlecardNotes || "(none)"}

# OUTPUT CONTRACT

Return a SINGLE JSON object — no markdown fences, no preamble, no postamble. The object has exactly this shape:

{
  "companyOverview": "<2-sentence summary of the competitor. Pull from PMM notes if useful; otherwise infer from signals.>",
  "howToPositionUs": "<1 sentence: how we should position OURSELVES against this competitor, sourced from the Concrete pillar most relevant to this competitor.>",
  "whyWeWin": [
    {
      "reason": "<short reason we win in deals where this competitor is named>",
      "quote": "<verbatim privacy-redacted quote from a Progressed call>"
    }
  ],
  "objectionHandling": [
    {
      "objection": "<verbatim objection language from competitor-tagged calls>",
      "response": "<recommended response framework grounded in canonical pillars>",
      "proof": "<one-line proof point or customer quote>"
    }
  ],
  "quickDismisses": [
    "<one-line verbatim language from progressed calls that effectively dismissed this competitor mid-call>"
  ],
  "landminesToPlant": [
    "<trap question the rep can ask that has revealed this competitor's weakness in past calls>"
  ],
  "whyWeLose": [
    "<short pattern from LOST calls naming this competitor>"
  ],
  "featureComparison": [
    {
      "feature": "<feature name>",
      "us": "<what we deliver, 1 sentence>",
      "them": "<what the competitor delivers, 1 sentence>"
    }
  ],
  "whenToWatchOut": [
    "<short pattern: this competitor tends to win when X>"
  ],
  "additionalResources": [
    { "label": "<short label>", "url": "<https URL or empty string>" }
  ],
  "confidence": <integer 1-5, how confident you are in this card overall — 5 means rich signal data, 1 means thin>,
  "evidenceFootnote": "<one sentence: how many calls, how many distinct reps, date range. Be exact.>"
}

# HARD RULES

1. Honesty over completeness. If you have zero progressed calls naming this competitor, set whyWeWin to []. Do NOT invent.
2. If you have zero LOST calls naming this competitor in the last 90 days, set whyWeLose to ["No documented losses to this competitor in the last 90 days."] — state it literally.
3. Verbatim quotes only. If you use quotation marks, the content inside must be an actual quote from the signal data provided. Never paraphrase inside quotation marks.
4. Source every section. Each whyWeWin entry traces to a specific progressed call; each objectionHandling entry traces to a real objection signal; etc.
5. Brevity. quickDismisses one line each; landminesToPlant short questions; objectionHandling response framework, not a paragraph.
6. Confidence calibration. confidence reflects how much signal data backed the card. <5 progressed calls → confidence ≤ 3. <3 objection signals → confidence ≤ 2.
7. Never fabricate features in featureComparison. If the prospect signal data does not mention a feature, do not list it.

# TONE

Clinical. Specific. Tactical. Reps use this card mid-deal — make it usable, not aspirational.`;
}

export function buildBattlecardUserMessage(
  competitor: CompetitorContext,
  competitorSignals: BattlecardSignal[],
  progressedCount: number,
  lostCount: number
): string {
  const signalBlock =
    competitorSignals.length === 0
      ? "(No competitor-tagged signals on file yet.)"
      : competitorSignals
          .map(
            (s, i) =>
              `[${i + 1}] type=${s.type} | polarity=${s.polarity} | outcome=${s.callOutcome} | date=${s.callDate} | rep=${s.rep}
  quote: "${s.quote}"
  inferred: ${s.inferredMeaning}`
          )
          .join("\n\n");

  return `Generate the Universal battlecard for **${competitor.name}**.

# Signal evidence (${competitorSignals.length} signals over ${progressedCount} progressed and ${lostCount} lost deals)

${signalBlock}

Produce the JSON object as specified.`;
}
