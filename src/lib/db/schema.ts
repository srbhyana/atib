import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  date,
  pgEnum,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Custom pgvector type ──────────────────────────────────────────
const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    return JSON.parse(value as string);
  },
});

// ─── Enums ─────────────────────────────────────────────────────────
export const planEnum = pgEnum("plan_enum", [
  "beta",
  "starter",
  "pro",
  "enterprise",
]);

export const roleEnum = pgEnum("role_enum", [
  "pmm_admin",
  "sales_rep",
  "sales_leader",
  "viewer",
]);

export const callOutcomeEnum = pgEnum("call_outcome_enum", [
  "progressed",
  "stalled",
  "lost",
  "unclear",
]);

export const llmSourceEnum = pgEnum("llm_source_enum", [
  "llm",
  "heuristic",
]);

export const signalTypeEnum = pgEnum("signal_type_enum", [
  "objection",
  "language_pattern",
  "competitor_mention",
  "use_case",
  "ICP_signal",
  "pricing_signal",
  "feature_request",
  "buying_trigger",
  "churn_risk",
  "expansion_signal",
]);

export const polarityEnum = pgEnum("polarity_enum", [
  "Reinforces",
  "Contradicts",
  "Extends",
  "Neutral",
]);

export const importanceEnum = pgEnum("importance_enum", [
  "Low",
  "Medium",
  "High",
  "Critical",
]);

export const tierEnum = pgEnum("tier_enum", [
  "suggestion",
  "evolving",
  "contested",
  "concrete",
  "archived",
  "dismissed",
]);

export const resolutionEnum = pgEnum("resolution_enum", [
  "in_favor_of_concrete",
  "in_favor_of_new",
  "hold_for_review",
]);

export const autoAnswerStateEnum = pgEnum("auto_answer_state_enum", [
  "suggestion",
  "evolving",
  "approved",
  "dismissed",
]);

export const battlecardArchetypeEnum = pgEnum("battlecard_archetype_enum", [
  "universal",
  "just_say_this",
  "topical",
  "role_based",
  "dynamic",
]);

export const battlecardStatusEnum = pgEnum("battlecard_status_enum", [
  "draft",
  "published",
  "archived",
]);

export const frameworkEnum = pgEnum("framework_enum", [
  "5c",
  "need_gap",
  "pop_pod",
  "laddering",
  "needscope",
  "kindergarten",
  "positioning_statement",
]);

export const kbSourceEnum = pgEnum("kb_source_enum", [
  "positioning",
  "messaging",
  "comp_intel",
  "gtm",
]);

// ─── Tables ────────────────────────────────────────────────────────

// Tenant boundary
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  plan: planEnum("plan").default("beta").notNull(),
  anthropicApiKey: text("anthropic_api_key"), // encrypted — per-workspace
  openaiApiKey: text("openai_api_key"),       // encrypted — per-workspace
});

/**
 * Workspace-level configuration that shapes the surface the PMM sees.
 * One row per workspace, created on demand. Stage is computed at read
 * time from transcript count (not stored) so it always reflects reality.
 *
 * focus_areas drives which dashboard modules show by default. A workspace
 * can have one or more active focus areas (typically one, sometimes two
 * for PMMs who split their time).
 *
 * module_overrides lets a PMM explicitly enable/disable a module by id,
 * overriding the focus-area + stage default. Empty {} = use defaults.
 */
export const workspaceConfig = pgTable("workspace_config", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // Plain-string defaults Postgres coerces to jsonb. Matches the pattern
  // every other jsonb column in this schema uses (auto_answers.alternatives,
  // soap_notes.confidence, etc.). The sql`` literal form trips drizzle-kit
  // push in some environments.
  focusAreas: jsonb("focus_areas").default('["enablement"]').notNull(),
  moduleOverrides: jsonb("module_overrides").default('{}').notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// People
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"), // null for magic-link-only reps
    role: roleEnum("role").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)]
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  tokenHash: text("token_hash").unique().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  email: text("email").notNull(),
  intendedRole: roleEnum("intended_role").notNull(),
  token: text("token").unique().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  invitedBy: uuid("invited_by")
    .references(() => users.id)
    .notNull(),
});

// Canonical truth — one row per workspace
export const canonicalContext = pgTable("canonical_context", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  companyName: text("company_name").default("").notNull(),
  positioningStatement: text("positioning_statement").default("").notNull(),
  pillar1: text("pillar_1").default("").notNull(),
  pillar2: text("pillar_2").default("").notNull(),
  pillar3: text("pillar_3").default("").notNull(),
  icpCore: text("icp_core").default("").notNull(),
  icpAdjacent: text("icp_adjacent").default("").notNull(),
  brandVoice: text("brand_voice").default("Direct, plain English, doctor not shaman.").notNull(),
  personaProfiles: jsonb("persona_profiles").default("[]"),
  winLossNotes: text("win_loss_notes").default("").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

export const competitors = pgTable("competitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  url: text("url").default("").notNull(),
  battlecardNotes: text("battlecard_notes").default("").notNull(),
  trackingSince: timestamp("tracking_since", { withTimezone: true }).defaultNow().notNull(),
});

export const approvedSignals = pgTable("approved_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).defaultNow().notNull(),
  approvedBy: uuid("approved_by")
    .references(() => users.id)
    .notNull(),
  promotedFromSignalId: uuid("promoted_from_signal_id"),
});

// Operational data
export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    repId: uuid("rep_id")
      .references(() => users.id)
      .notNull(),
    prospectAccount: text("prospect_account").default("").notNull(),
    prospectContact: text("prospect_contact").default("").notNull(),
    prospectRole: text("prospect_role").default("").notNull(),
    prospectCompanySize: text("prospect_company_size").default("").notNull(),
    callDate: date("call_date").notNull(),
    callOutcome: callOutcomeEnum("call_outcome").default("unclear").notNull(),
    rawText: text("raw_text").notNull(),
    redactedText: text("redacted_text").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("transcripts_workspace_idx").on(table.workspaceId),
    index("transcripts_rep_idx").on(table.repId),
  ]
);

export const soapNotes = pgTable("soap_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  transcriptId: uuid("transcript_id")
    .references(() => transcripts.id, { onDelete: "cascade" })
    .notNull(),
  subjective: text("subjective").default("").notNull(),
  objective: text("objective").default("").notNull(),
  assessment: text("assessment").default("").notNull(),
  plan: text("plan").default("").notNull(),
  confidence: jsonb("confidence").default("{}"),
  qualityWarning: text("quality_warning").default("").notNull(),
  llmModel: text("llm_model").default("").notNull(),
  llmSource: llmSourceEnum("llm_source").default("heuristic").notNull(),
  promptVersion: text("prompt_version").default("v3.1").notNull(),
  // Persisted SOAP analysis. Only fields the surface actually reads. Dropped
  // market_enemy, pop_pod_movement, and five_c_failures in v3.2 — they were
  // extracted but never displayed, and the prompt complexity cost was real.
  callType: text("call_type").default("sales").notNull(),
  icpVerdict: text("icp_verdict").default("").notNull(),
  blockerType: text("blocker_type").default("").notNull(),
  buyingStage: text("buying_stage").default("").notNull(),
  needGap: text("need_gap").default("").notNull(),
  resonanceLayer: text("resonance_layer").default("").notNull(),
  terminalBenefit: text("terminal_benefit").default("").notNull(),
  reasonToBelieve: text("reason_to_believe").default("").notNull(),
  buyingTrigger: text("buying_trigger").default("").notNull(),
  useCase: text("use_case").default("").notNull(),
  kindergartenSummary: text("kindergarten_summary").default("").notNull(),
  driftScore: integer("drift_score").default(50).notNull(),
  championStrength: text("champion_strength").default("").notNull(),
  hiddenStakeholders: jsonb("hidden_stakeholders").default("[]"),
  personaTagged: text("persona_tagged").default("").notNull(),
  segmentTagged: text("segment_tagged").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const signals = pgTable(
  "signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    sourceTranscriptId: uuid("source_transcript_id")
      .references(() => transcripts.id, { onDelete: "set null" }),
    sourceSoapNoteId: uuid("source_soap_note_id")
      .references(() => soapNotes.id, { onDelete: "set null" }),
    signalType: signalTypeEnum("signal_type").notNull(),
    title: text("title").default("").notNull(),
    content: text("content").default("").notNull(),
    verbatimQuote: text("verbatim_quote").default("").notNull(),
    inferredMeaning: text("inferred_meaning").default("").notNull(),
    pillarTag: integer("pillar_tag").default(0).notNull(),
    polarity: polarityEnum("polarity").default("Neutral").notNull(),
    strategicImportance: importanceEnum("strategic_importance").default("Medium").notNull(),
    tier: tierEnum("tier").default("suggestion").notNull(),
    competitorTagged: uuid("competitor_tagged").references(() => competitors.id),
    competitorName: text("competitor_name").default("").notNull(),
    personaTagged: text("persona_tagged").default("").notNull(),
    segmentTagged: text("segment_tagged").default("").notNull(),
    reinforcementCount: integer("reinforcement_count").default(1).notNull(),
    firstSeen: timestamp("first_seen", { withTimezone: true }).defaultNow().notNull(),
    lastReinforced: timestamp("last_reinforced", { withTimezone: true }).defaultNow().notNull(),
    embedding: vector("embedding"),
    canonicalContradiction: text("canonical_contradiction").default("no").notNull(),
    contestedAgainst: uuid("contested_against").references(() => approvedSignals.id),
    route: text("route").default("signal_library").notNull(),
    sourceSection: text("source_section").default("").notNull(),
    // Per-signal confidence is the one v3.1 field that earns its keep — the
    // dashboard down-weights low-confidence signals. The rest of the v3.1
    // per-signal framework tags (switching_force, needscope_layer, ladder_*,
    // industry, seniority, need_gap, market_maturity) were dropped in v3.2
    // after the audit found them stored-and-never-read.
    confidenceScore: integer("confidence_score").default(50).notNull(),  // 0..100
    promptVersion: text("prompt_version").default("v3.2").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("signals_workspace_tier_idx").on(table.workspaceId, table.tier),
    index("signals_workspace_type_idx").on(table.workspaceId, table.signalType),
    index("signals_workspace_first_seen_idx").on(table.workspaceId, table.firstSeen),
  ]
);

export const contestedResolutions = pgTable("contested_resolutions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  signalId: uuid("signal_id")
    .references(() => signals.id, { onDelete: "cascade" })
    .notNull(),
  resolvedBy: uuid("resolved_by")
    .references(() => users.id)
    .notNull(),
  resolution: resolutionEnum("resolution").notNull(),
  resolutionNotes: text("resolution_notes").default("").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }).defaultNow().notNull(),
  forcedAt: timestamp("forced_at", { withTimezone: true }),
});

export const autoAnswers = pgTable("auto_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  question: text("question").notNull(),
  draftedAnswer: text("drafted_answer").default("").notNull(),
  alternatives: jsonb("alternatives").default("[]"),
  frequency: integer("frequency").default(1).notNull(),
  state: autoAnswerStateEnum("state").default("suggestion").notNull(),
  sourceAccount: text("source_account").default("").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  // Vector of the question text — used for semantic dedup so re-asks across
  // calls increment frequency instead of flooding the queue with duplicates.
  questionEmbedding: vector("question_embedding"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
});

export const battlecards = pgTable("battlecards", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  competitorId: uuid("competitor_id")
    .references(() => competitors.id, { onDelete: "cascade" })
    .notNull(),
  archetype: battlecardArchetypeEnum("archetype").default("universal").notNull(),
  roleVariant: text("role_variant"),
  sections: jsonb("sections").default("{}"),
  status: battlecardStatusEnum("status").default("draft").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export const positioningAudits = pgTable("positioning_audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  framework: frameworkEnum("framework").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
  output: jsonb("output").default("{}"),
  flags: jsonb("flags").default("[]"),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").default("{}"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("events_workspace_idx").on(table.workspaceId)]
);

export const emailsSent = pgTable("emails_sent", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  toEmail: text("to_email").notNull(),
  template: text("template").notNull(),
  subject: text("subject").notNull(),
  resendId: text("resend_id").default("").notNull(),
  status: text("status").default("sent").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
});

export const kbChunks = pgTable("kb_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: kbSourceEnum("source").notNull(),
  sectionPath: text("section_path").default("").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding"),
  tokenCount: integer("token_count").default(0).notNull(),
});

// ─── Relations ─────────────────────────────────────────────────────

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  users: many(users),
  canonicalContext: one(canonicalContext),
  competitors: many(competitors),
  transcripts: many(transcripts),
  signals: many(signals),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [users.workspaceId],
    references: [workspaces.id],
  }),
  sessions: many(sessions),
  transcripts: many(transcripts),
}));

export const transcriptsRelations = relations(transcripts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [transcripts.workspaceId],
    references: [workspaces.id],
  }),
  rep: one(users, {
    fields: [transcripts.repId],
    references: [users.id],
  }),
  soapNote: one(soapNotes),
  signals: many(signals),
}));

export const soapNotesRelations = relations(soapNotes, ({ one }) => ({
  transcript: one(transcripts, {
    fields: [soapNotes.transcriptId],
    references: [transcripts.id],
  }),
}));

export const signalsRelations = relations(signals, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [signals.workspaceId],
    references: [workspaces.id],
  }),
  sourceTranscript: one(transcripts, {
    fields: [signals.sourceTranscriptId],
    references: [transcripts.id],
  }),
}));
