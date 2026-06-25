// ─── Atib Type Definitions ─────────────────────────────────────────

export type Role = "pmm_admin" | "sales_rep" | "sales_leader" | "viewer";

export type Tier =
  | "suggestion"
  | "evolving"
  | "contested"
  | "concrete"
  | "archived"
  | "dismissed";

export type SignalType =
  | "objection"
  | "language_pattern"
  | "competitor_mention"
  | "use_case"
  | "ICP_signal"
  | "pricing_signal"
  | "feature_request"
  | "buying_trigger"
  | "churn_risk"
  | "expansion_signal";

export type Polarity = "Reinforces" | "Contradicts" | "Extends" | "Neutral";

export type Importance = "Low" | "Medium" | "High" | "Critical";

export type CallOutcome = "progressed" | "stalled" | "lost" | "unclear";

export type Resolution =
  | "in_favor_of_concrete"
  | "in_favor_of_new"
  | "hold_for_review";

export type Framework =
  | "5c"
  | "need_gap"
  | "pop_pod"
  | "laddering"
  | "needscope"
  | "kindergarten"
  | "positioning_statement";

// ─── SOAP Output Types ─────────────────────────────────────────────

export interface SoapConfidence {
  subjective: number;
  objective: number;
  assessment: number;
  plan: number;
}

export interface SoapOutput {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  confidence: SoapConfidence;
}

export interface SignalOutput {
  title: string;
  content: string;
  type: SignalType;
  quote: string;
  inferredMeaning: string;
  pillarTag: number;
  polarity: Polarity;
  strategicImportance: Importance;
  state: "suggestion" | "evolving";
  canonicalContradiction: "yes" | "no" | "partial";
  contestedAgainst: string;
  route: string;
  sourceSection: string;
  competitorTagged: string;
  confidenceScore: number;        // 0.0..1.0
}

export interface QuestionOutput {
  question: string;
  draftedAnswer: string;
  alternatives: string[];
}

export interface AnalysisOutput {
  qualityWarning: string;
  callType: string;
  insufficientData: boolean;
  offTopic: boolean;
  callOutcome: CallOutcome;
  blockerType: string;
  buyingStage: string;
  icpVerdict: string;
  needGap: string;
  resonanceLayer: string;
  featureRequested: string;
  advantage: string;
  terminalBenefit: string;
  reasonToBelieve: string;
  personaTagged: string;
  segmentTagged: string;
  buyingTrigger: string;
  useCase: string;
  primaryConcern: string;
  primaryPain: string;
  nextStep: string;
  driftScore: number;
  kindergartenSummary: string;
  competitors: string[];
  matchedPillars: string[];
  // v3.1 call-level stakeholder intelligence — kept because the dashboard
  // surfaces championStrength and hiddenStakeholders directly. Dropped
  // marketEnemy, popPodMovement, fiveCFailures from v3.2.
  championStrength: "Strong" | "Medium" | "Weak" | "Absent" | "";
  hiddenStakeholders: string[];
  signals: SignalOutput[];
  questions: QuestionOutput[];
}

export interface SoapResult {
  soap: SoapOutput;
  analysis: AnalysisOutput;
  source: "llm" | "heuristic";
}

// ─── Canonical Context Block ───────────────────────────────────────

export interface CanonicalContextBlock {
  companyName: string;
  positioningStatement: string;
  pillars: [string, string, string];
  icpCore: string;
  icpAdjacent: string;
  brandVoice: string;
  competitors: Array<{
    id: string;
    name: string;
    url: string;
    battlecardNotes: string;
  }>;
  approvedSignals: Array<{
    id: string;
    title: string;
    content: string;
  }>;
}

// ─── Dashboard Types ───────────────────────────────────────────────

export interface DriftScore {
  overall: number;
  pillar1: number;
  pillar2: number;
  pillar3: number;
  color: "green" | "amber" | "red";
}

export interface DashboardModule {
  type: string;
  items: unknown[];
  total: number;
}

// ─── Session / Auth ────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  workspaceId: string;
}
