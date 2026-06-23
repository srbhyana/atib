import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { ingestTranscript } from "@/lib/agents/transcript-intake";
import { runSoapAnalysis } from "@/lib/agents/soap";
import { getCanonicalContext } from "@/lib/agents/canonical-context";
import { ingestSignals } from "@/lib/agents/signal-bank";
import { ingestAutoAnswer } from "@/lib/agents/auto-answer-bank";
import { buildSingleCallView } from "@/lib/agents/single-call-dashboard";
import { db } from "@/lib/db/client";
import { soapNotes, transcripts, workspaces } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { CallOutcome } from "@/lib/utils/types";
import { decryptSecret, getWorkspaceOpenAIKey } from "@/lib/security/secrets";

/**
 * POST /api/transcripts
 *
 * The big pipeline endpoint:
 * 1. Creates transcript row (Intake Agent)
 * 2. Runs SOAP analysis (SOAP Agent)
 * 3. Stores SOAP note
 * 4. Ingests signals (Signal Bank Agent)
 * 5. Ingests questions (Auto-Answers)
 * 6. Returns single-call dashboard view
 */
export async function POST(request: Request) {
  try {
    const session = await requireAuth();

    if (
      !hasPermission(session.role, "transcript.create")
    ) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // 1. Ingest transcript
    const transcript = await ingestTranscript({
      workspaceId: session.workspaceId,
      repId: session.id,
      prospectAccount: body.account || "",
      prospectContact: body.contact || "",
      prospectRole: body.prospectRole || "",
      prospectCompanySize: body.companySize || "",
      callDate: body.callDate || new Date().toISOString().slice(0, 10),
      callOutcome: (body.callOutcome || "unclear") as CallOutcome,
      rawText: body.transcript || "",
    });

    // 2. Get canonical context for SOAP
    const ctx = await getCanonicalContext(session.workspaceId);
    if (!ctx) {
      return NextResponse.json(
        { ok: false, error: "Please complete setup first." },
        { status: 400 }
      );
    }

    const [workspace] = await db
      .select({
        anthropicApiKey: workspaces.anthropicApiKey,
      })
      .from(workspaces)
      .where(eq(workspaces.id, session.workspaceId))
      .limit(1);

    // 3. Run SOAP analysis
    const soapResult = await runSoapAnalysis(
      transcript.rawText,
      transcript.prospectAccount,
      transcript.prospectContact,
      ctx,
      {
        anthropicApiKey: workspace?.anthropicApiKey
          ? decryptSecret(workspace.anthropicApiKey)
          : null,
      }
    );

    // 4. Store SOAP note — persist the full analysis blob (v3.1).
    //    Every column below feeds at least one dashboard / framework module.
    //    See thesis §25 for the field contract.
    const a = soapResult.analysis;
    const [soapNote] = await db
      .insert(soapNotes)
      .values({
        workspaceId: session.workspaceId,
        transcriptId: transcript.id,
        subjective: soapResult.soap.subjective,
        objective: soapResult.soap.objective,
        assessment: soapResult.soap.assessment,
        plan: soapResult.soap.plan,
        confidence: soapResult.soap.confidence,
        qualityWarning: a.qualityWarning || "",
        llmModel: soapResult.source === "llm" ? "claude-sonnet-4-6" : "heuristic",
        llmSource: soapResult.source === "llm" ? "llm" : "heuristic",
        promptVersion: "v3.1",
        callType: a.callType || "sales",
        icpVerdict: a.icpVerdict || "",
        blockerType: a.blockerType || "",
        buyingStage: a.buyingStage || "",
        needGap: a.needGap || "",
        resonanceLayer: a.resonanceLayer || "",
        terminalBenefit: a.terminalBenefit || "",
        reasonToBelieve: a.reasonToBelieve || "",
        marketEnemy: a.marketEnemy || "",
        buyingTrigger: a.buyingTrigger || "",
        useCase: a.useCase || "",
        kindergartenSummary: a.kindergartenSummary || "",
        driftScore: typeof a.driftScore === "number" ? a.driftScore : 50,
        popPodMovement: a.popPodMovement || "",
        fiveCFailures: Array.isArray(a.fiveCFailures) ? a.fiveCFailures : [],
        championStrength: a.championStrength || "",
        hiddenStakeholders: Array.isArray(a.hiddenStakeholders) ? a.hiddenStakeholders : [],
        personaTagged: a.personaTagged || "",
        segmentTagged: a.segmentTagged || "",
      })
      .returning();

    // 5. Ingest signals — denormalise the call-level persona/segment down to each signal
    //    so signals.persona_tagged / segment_tagged carry meaningful values for filtering.
    await ingestSignals(
      session.workspaceId,
      transcript.id,
      soapNote.id,
      soapResult.analysis.signals || [],
      {
        callLevelPersona: a.personaTagged || "",
        callLevelSegment: a.segmentTagged || "",
      }
    );

    // 6. Ingest questions into auto-answers with semantic dedup. Repeat
    //    questions across calls now increment frequency on the existing row
    //    instead of creating duplicates. The spec's "3+ calls" promotion
    //    threshold becomes reachable.
    if (soapResult.analysis.questions && soapResult.analysis.questions.length > 0) {
      const openaiKey = await getWorkspaceOpenAIKey(session.workspaceId);
      for (const q of soapResult.analysis.questions) {
        if (!q.question || !q.question.trim()) continue;
        try {
          await ingestAutoAnswer(
            session.workspaceId,
            {
              question: q.question,
              draftedAnswer: q.draftedAnswer || "",
              alternatives: q.alternatives || [],
              sourceAccount: transcript.prospectAccount || "",
            },
            openaiKey
          );
        } catch (err) {
          console.warn("Auto-answer ingest failed for one question:", err);
        }
      }
    }

    // 7. Build single-call dashboard view
    const framing = session.role === "pmm_admin" ? "drift" : "enablement";
    const dashboardView = await buildSingleCallView(
      transcript.id,
      session.workspaceId,
      framing as "enablement" | "drift"
    );

    return NextResponse.json({
      ok: true,
      message:
        soapResult.source === "llm"
          ? "SOAP analysis complete (LLM)."
          : "SOAP analysis complete (heuristic fallback — connect an API key for full intelligence).",
      transcript: { id: transcript.id },
      soap: soapResult.soap,
      analysis: soapResult.analysis,
      source: soapResult.source,
      dashboardView,
    });
  } catch (error) {
    console.error("Transcript pipeline error:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/transcripts
 *
 * List transcripts with optional filters.
 */
export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const url = new URL(request.url);

    const conditions = [eq(transcripts.workspaceId, session.workspaceId)];

    // Reps can only see their own transcripts
    if (session.role === "sales_rep") {
      conditions.push(eq(transcripts.repId, session.id));
    }

    const repId = url.searchParams.get("rep_id");
    if (repId && session.role !== "sales_rep") {
      conditions.push(eq(transcripts.repId, repId));
    }

    const result = await db
      .select({
        id: transcripts.id,
        account: transcripts.prospectAccount,
        contact: transcripts.prospectContact,
        callDate: transcripts.callDate,
        callOutcome: transcripts.callOutcome,
        createdAt: transcripts.createdAt,
      })
      .from(transcripts)
      .where(and(...conditions))
      .orderBy(desc(transcripts.createdAt))
      .limit(50);

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    console.error("List transcripts error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to list transcripts." },
      { status: 500 }
    );
  }
}
