import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/session";
import {
  getOrCreateWorkspaceConfig,
  setFocusAreas,
  setModuleOverride,
  computeStage,
  FOCUS_AREAS,
  type FocusArea,
} from "@/lib/agents/workspace-config";

export async function GET() {
  try {
    const session = await requireAuth();
    const [config, stage] = await Promise.all([
      getOrCreateWorkspaceConfig(session.workspaceId),
      computeStage(session.workspaceId),
    ]);
    return NextResponse.json({
      ok: true,
      focusAreas: config.focusAreas,
      moduleOverrides: config.moduleOverrides,
      stage,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load config." },
      { status: 500 }
    );
  }
}

function isFocusArea(v: unknown): v is FocusArea {
  return typeof v === "string" && (FOCUS_AREAS as readonly string[]).includes(v);
}

export async function PUT(request: Request) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const body = await request.json();

    if (Array.isArray(body.focusAreas)) {
      const cleaned = body.focusAreas.filter(isFocusArea);
      if (cleaned.length === 0) {
        return NextResponse.json(
          { ok: false, error: "At least one focus area required." },
          { status: 400 }
        );
      }
      await setFocusAreas(session.workspaceId, cleaned);
    }

    if (typeof body.moduleId === "string" && typeof body.enabled === "boolean") {
      await setModuleOverride(session.workspaceId, body.moduleId, body.enabled);
    }

    const config = await getOrCreateWorkspaceConfig(session.workspaceId);
    return NextResponse.json({
      ok: true,
      focusAreas: config.focusAreas,
      moduleOverrides: config.moduleOverrides,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save config." },
      { status: 500 }
    );
  }
}
