import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { ingestTranscript } from "@/lib/agents/transcript-intake";
import { runSoapAnalysis } from "@/lib/agents/soap";
import { getCanonicalContext } from "@/lib/agents/canonical-context";
import { ingestSignals } from "@/lib/agents/signal-bank";
import { buildSingleCallView } from "@/lib/agents/single-call-dashboard";
import { db } from "@/lib/db/client";
import { soapNotes, transcripts, autoAnswers, workspaces } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { CallOutcome } from "@/lib/utils/types";
import { decryptSecret } from "@/lib/security/secrets";

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

    // 4. Store SOAP note
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
        qualityWarning: soapResult.analysis.qualityWarning || "",
        llmModel: soapResult.source === "llm" ? "claude-sonnet-4-6" : "heuristic",
        llmSource: soapResult.source === "llm" ? "llm" : "heuristic",
        promptVersion: "v3.0",
      })
      .returning();

    // 5. Ingest signals
    await ingestSignals(
      session.workspaceId,
      transcript.id,
      soapNote.id,
      soapResult.analysis.signals || []
    );

    // 6. Ingest questions into auto-answers
    if (soapResult.analysis.questions && soapResult.analysis.questions.length > 0) {
      for (const q of soapResult.analysis.questions) {
        await db.insert(autoAnswers).values({
          workspaceId: session.workspaceId,
          question: q.question,
          draftedAnswer: q.draftedAnswer || "",
          alternatives: q.alternatives || [],
          frequency: 1,
          sourceAccount: transcript.prospectAccount || "",
        });
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
