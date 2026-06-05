CREATE TYPE "public"."auto_answer_state_enum" AS ENUM('suggestion', 'evolving', 'approved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."battlecard_archetype_enum" AS ENUM('universal', 'just_say_this', 'topical', 'role_based', 'dynamic');--> statement-breakpoint
CREATE TYPE "public"."battlecard_status_enum" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."call_outcome_enum" AS ENUM('progressed', 'stalled', 'lost', 'unclear');--> statement-breakpoint
CREATE TYPE "public"."framework_enum" AS ENUM('5c', 'need_gap', 'pop_pod', 'laddering', 'needscope', 'kindergarten', 'positioning_statement');--> statement-breakpoint
CREATE TYPE "public"."importance_enum" AS ENUM('Low', 'Medium', 'High', 'Critical');--> statement-breakpoint
CREATE TYPE "public"."kb_source_enum" AS ENUM('positioning', 'messaging', 'comp_intel', 'gtm');--> statement-breakpoint
CREATE TYPE "public"."llm_source_enum" AS ENUM('llm', 'heuristic');--> statement-breakpoint
CREATE TYPE "public"."plan_enum" AS ENUM('beta', 'starter', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."polarity_enum" AS ENUM('Reinforces', 'Contradicts', 'Extends', 'Neutral');--> statement-breakpoint
CREATE TYPE "public"."resolution_enum" AS ENUM('in_favor_of_concrete', 'in_favor_of_new', 'hold_for_review');--> statement-breakpoint
CREATE TYPE "public"."role_enum" AS ENUM('pmm_admin', 'sales_rep', 'sales_leader', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."signal_type_enum" AS ENUM('objection', 'language_pattern', 'competitor_mention', 'use_case', 'ICP_signal', 'pricing_signal', 'feature_request', 'buying_trigger', 'churn_risk', 'expansion_signal');--> statement-breakpoint
CREATE TYPE "public"."tier_enum" AS ENUM('suggestion', 'evolving', 'contested', 'concrete', 'archived', 'dismissed');--> statement-breakpoint
CREATE TABLE "approved_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid NOT NULL,
	"promoted_from_signal_id" uuid
);
--> statement-breakpoint
CREATE TABLE "auto_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"question" text NOT NULL,
	"drafted_answer" text DEFAULT '' NOT NULL,
	"alternatives" jsonb DEFAULT '[]',
	"frequency" integer DEFAULT 1 NOT NULL,
	"state" "auto_answer_state_enum" DEFAULT 'suggestion' NOT NULL,
	"source_account" text DEFAULT '' NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "battlecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"archetype" "battlecard_archetype_enum" DEFAULT 'universal' NOT NULL,
	"role_variant" text,
	"sections" jsonb DEFAULT '{}',
	"status" "battlecard_status_enum" DEFAULT 'draft' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "canonical_context" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"company_name" text DEFAULT '' NOT NULL,
	"positioning_statement" text DEFAULT '' NOT NULL,
	"pillar_1" text DEFAULT '' NOT NULL,
	"pillar_2" text DEFAULT '' NOT NULL,
	"pillar_3" text DEFAULT '' NOT NULL,
	"icp_core" text DEFAULT '' NOT NULL,
	"icp_adjacent" text DEFAULT '' NOT NULL,
	"brand_voice" text DEFAULT 'Direct, plain English, doctor not shaman.' NOT NULL,
	"persona_profiles" jsonb DEFAULT '[]',
	"win_loss_notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"battlecard_notes" text DEFAULT '' NOT NULL,
	"tracking_since" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contested_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"resolved_by" uuid NOT NULL,
	"resolution" "resolution_enum" NOT NULL,
	"resolution_notes" text DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"forced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "emails_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"resend_id" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}',
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"intended_role" "role_enum" NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"invited_by" uuid NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "kb_source_enum" NOT NULL,
	"section_path" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"token_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positioning_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"framework" "framework_enum" NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"output" jsonb DEFAULT '{}',
	"flags" jsonb DEFAULT '[]'
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_transcript_id" uuid,
	"source_soap_note_id" uuid,
	"signal_type" "signal_type_enum" NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"verbatim_quote" text DEFAULT '' NOT NULL,
	"inferred_meaning" text DEFAULT '' NOT NULL,
	"pillar_tag" integer DEFAULT 0 NOT NULL,
	"polarity" "polarity_enum" DEFAULT 'Neutral' NOT NULL,
	"strategic_importance" "importance_enum" DEFAULT 'Medium' NOT NULL,
	"tier" "tier_enum" DEFAULT 'suggestion' NOT NULL,
	"competitor_tagged" uuid,
	"competitor_name" text DEFAULT '' NOT NULL,
	"persona_tagged" text DEFAULT '' NOT NULL,
	"segment_tagged" text DEFAULT '' NOT NULL,
	"reinforcement_count" integer DEFAULT 1 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reinforced" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding" vector(1536),
	"canonical_contradiction" text DEFAULT 'no' NOT NULL,
	"contested_against" uuid,
	"route" text DEFAULT 'signal_library' NOT NULL,
	"source_section" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soap_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"transcript_id" uuid NOT NULL,
	"subjective" text DEFAULT '' NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"assessment" text DEFAULT '' NOT NULL,
	"plan" text DEFAULT '' NOT NULL,
	"confidence" jsonb DEFAULT '{}',
	"quality_warning" text DEFAULT '' NOT NULL,
	"llm_model" text DEFAULT '' NOT NULL,
	"llm_source" "llm_source_enum" DEFAULT 'heuristic' NOT NULL,
	"prompt_version" text DEFAULT 'v3.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"rep_id" uuid NOT NULL,
	"prospect_account" text DEFAULT '' NOT NULL,
	"prospect_contact" text DEFAULT '' NOT NULL,
	"prospect_role" text DEFAULT '' NOT NULL,
	"prospect_company_size" text DEFAULT '' NOT NULL,
	"call_date" date NOT NULL,
	"call_outcome" "call_outcome_enum" DEFAULT 'unclear' NOT NULL,
	"raw_text" text NOT NULL,
	"redacted_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" "role_enum" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"plan" "plan_enum" DEFAULT 'beta' NOT NULL,
	"anthropic_api_key" text,
	"openai_api_key" text
);
--> statement-breakpoint
ALTER TABLE "approved_signals" ADD CONSTRAINT "approved_signals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approved_signals" ADD CONSTRAINT "approved_signals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_answers" ADD CONSTRAINT "auto_answers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battlecards" ADD CONSTRAINT "battlecards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battlecards" ADD CONSTRAINT "battlecards_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battlecards" ADD CONSTRAINT "battlecards_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_context" ADD CONSTRAINT "canonical_context_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_context" ADD CONSTRAINT "canonical_context_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contested_resolutions" ADD CONSTRAINT "contested_resolutions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contested_resolutions" ADD CONSTRAINT "contested_resolutions_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contested_resolutions" ADD CONSTRAINT "contested_resolutions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails_sent" ADD CONSTRAINT "emails_sent_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positioning_audits" ADD CONSTRAINT "positioning_audits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_source_transcript_id_transcripts_id_fk" FOREIGN KEY ("source_transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_source_soap_note_id_soap_notes_id_fk" FOREIGN KEY ("source_soap_note_id") REFERENCES "public"."soap_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_competitor_tagged_competitors_id_fk" FOREIGN KEY ("competitor_tagged") REFERENCES "public"."competitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_contested_against_approved_signals_id_fk" FOREIGN KEY ("contested_against") REFERENCES "public"."approved_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soap_notes" ADD CONSTRAINT "soap_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soap_notes" ADD CONSTRAINT "soap_notes_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_rep_id_users_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_workspace_idx" ON "events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "signals_workspace_tier_idx" ON "signals" USING btree ("workspace_id","tier");--> statement-breakpoint
CREATE INDEX "signals_workspace_type_idx" ON "signals" USING btree ("workspace_id","signal_type");--> statement-breakpoint
CREATE INDEX "transcripts_workspace_idx" ON "transcripts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "transcripts_rep_idx" ON "transcripts" USING btree ("rep_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");