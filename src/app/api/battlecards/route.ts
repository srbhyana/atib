import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import {
  listBattlecards,
  generateUniversalBattlecard,
} from "@/lib/agents/battlecard";
import { getWorkspaceAnthropicKey } from "@/lib/security/secrets";

export async function GET(request: Request) {
  try {
    const session = await requireRole([
      "pmm_admin",
      "sales_rep",
      "sales_leader",
    ]);
    const url = new URL(request.url);
    const competitorId = url.searchParams.get("competitor_id") || undefined;

    const cards = await listBattlecards(session.workspaceId, competitorId);
    return NextResponse.json({ ok: true, data: cards });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("List battlecards error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to list battlecards." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const body = await request.json();
    const competitorId = String(body.competitorId || "").trim();
    const archetype = String(body.archetype || "universal");

    if (!competitorId) {
      return NextResponse.json(
        { ok: false, error: "competitorId is required" },
        { status: 400 }
      );
    }

    if (archetype !== "universal") {
      return NextResponse.json(
        {
          ok: false,
          error: "Only the 'universal' archetype is supported in v1.",
        },
        { status: 400 }
      );
    }

    const anthropicKey = await getWorkspaceAnthropicKey(session.workspaceId);
    const result = await generateUniversalBattlecard(
      session.workspaceId,
      competitorId,
      anthropicKey
    );

    return NextResponse.json({
      ok: true,
      data: result,
      message:
        result.source === "llm"
          ? "Battlecard draft generated from signal data."
          : "Battlecard scaffolded (no LLM available — plug in an Anthropic key for full generation).",
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Generate battlecard error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to generate battlecard." },
      { status: 500 }
    );
  }
}
