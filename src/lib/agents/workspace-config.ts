import { db } from "@/lib/db/client";
import { workspaceConfig, transcripts } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Workspace config — the "what kind of PMM is this" knob.
 *
 * Two pieces:
 *   1. focusAreas — what the PMM is working on this quarter. Shapes which
 *      modules show up on the dashboard by default. Multi-select, but
 *      usually one.
 *   2. moduleOverrides — explicit per-module on/off the PMM toggles
 *      manually. Wins over focus-area defaults.
 *
 * Stage isn't stored. It's computed from transcript count at read time
 * so it always tracks reality (a workspace that ingests 100 transcripts
 * over a weekend graduates from pre-PMF to PMF immediately).
 */

export type FocusArea = "enablement" | "competitive" | "positioning";
export type Stage = "pre_pmf" | "pmf" | "scale";

export const FOCUS_AREAS: FocusArea[] = ["enablement", "competitive", "positioning"];

export const FOCUS_AREA_LABELS: Record<FocusArea, string> = {
  enablement: "Enablement",
  competitive: "Competitive intelligence",
  positioning: "Positioning / strategy",
};

export const FOCUS_AREA_DESCRIPTIONS: Record<FocusArea, string> = {
  enablement: "Rep language, battlecards, objection updates. The default for most PMMs.",
  competitive: "Competitor tracking, win/loss patterns, mention share. Specialty workstream.",
  positioning: "Drift detection, repositioning, periodic audits. Quarterly, not weekly.",
};

export interface WorkspaceConfigShape {
  focusAreas: FocusArea[];
  moduleOverrides: Record<string, boolean>;
}

/**
 * Stage thresholds. Stage isn't a config knob — it's read from data.
 * A workspace below 30 transcripts is pre-PMF: no Concrete yet, nothing
 * to drift from, dashboard focuses on raw signal density. 30-300 is PMF.
 * 300+ is scale, where alert-first UI starts mattering.
 */
const STAGE_PMF_MIN = 30;
const STAGE_SCALE_MIN = 300;

export async function computeStage(workspaceId: string): Promise<Stage> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transcripts)
    .where(eq(transcripts.workspaceId, workspaceId));
  const count = row?.count ?? 0;
  if (count >= STAGE_SCALE_MIN) return "scale";
  if (count >= STAGE_PMF_MIN) return "pmf";
  return "pre_pmf";
}

function isFocusArea(v: unknown): v is FocusArea {
  return v === "enablement" || v === "competitive" || v === "positioning";
}

function coerceFocusAreas(raw: unknown): FocusArea[] {
  if (!Array.isArray(raw)) return ["enablement"];
  const valid = raw.filter(isFocusArea);
  return valid.length > 0 ? valid : ["enablement"];
}

function coerceOverrides(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

export async function getOrCreateWorkspaceConfig(
  workspaceId: string
): Promise<WorkspaceConfigShape> {
  const [row] = await db
    .select({
      focusAreas: workspaceConfig.focusAreas,
      moduleOverrides: workspaceConfig.moduleOverrides,
    })
    .from(workspaceConfig)
    .where(eq(workspaceConfig.workspaceId, workspaceId))
    .limit(1);

  if (row) {
    return {
      focusAreas: coerceFocusAreas(row.focusAreas),
      moduleOverrides: coerceOverrides(row.moduleOverrides),
    };
  }

  // Default config — created lazily on first read so workspaces created
  // before this table existed don't need a separate backfill migration.
  const defaults: WorkspaceConfigShape = {
    focusAreas: ["enablement"],
    moduleOverrides: {},
  };
  await db
    .insert(workspaceConfig)
    .values({
      workspaceId,
      focusAreas: defaults.focusAreas,
      moduleOverrides: defaults.moduleOverrides,
    })
    .onConflictDoNothing();

  return defaults;
}

export async function setFocusAreas(
  workspaceId: string,
  focusAreas: FocusArea[]
): Promise<void> {
  const cleaned = coerceFocusAreas(focusAreas);
  await db
    .insert(workspaceConfig)
    .values({
      workspaceId,
      focusAreas: cleaned,
      moduleOverrides: {},
    })
    .onConflictDoUpdate({
      target: workspaceConfig.workspaceId,
      set: {
        focusAreas: cleaned,
        updatedAt: new Date(),
      },
    });
}

export async function setModuleOverride(
  workspaceId: string,
  moduleId: string,
  enabled: boolean
): Promise<void> {
  const config = await getOrCreateWorkspaceConfig(workspaceId);
  const next = { ...config.moduleOverrides, [moduleId]: enabled };
  await db
    .insert(workspaceConfig)
    .values({
      workspaceId,
      focusAreas: config.focusAreas,
      moduleOverrides: next,
    })
    .onConflictDoUpdate({
      target: workspaceConfig.workspaceId,
      set: {
        moduleOverrides: next,
        updatedAt: new Date(),
      },
    });
}
