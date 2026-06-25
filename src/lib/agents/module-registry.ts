import type { FocusArea, Stage } from "./workspace-config";

/**
 * Dashboard module registry — declarative metadata for every surface the
 * dashboard can render. Each module declares:
 *
 *   - id: stable identifier used in workspace_config.module_overrides
 *   - title: display name (matches the existing SectionShell title)
 *   - defaultStages: which lifecycle stages show this by default
 *   - defaultFocusAreas: which focus areas show this by default
 *   - description: one-line label for the settings UI
 *
 * Module visibility is the intersection of stage AND focus-area defaults,
 * then overridden per module by workspace_config.module_overrides. The
 * dashboard page reads these and renders only what's active.
 *
 * Adding a new module means appending here AND adding the JSX block in
 * dashboard/page.tsx — no other plumbing. The lever, not the surfaces, is
 * what makes this a platform.
 */

export interface ModuleDescriptor {
  id: string;
  title: string;
  description: string;
  defaultStages: Stage[];
  defaultFocusAreas: FocusArea[];
}

export const MODULE_REGISTRY: ModuleDescriptor[] = [
  {
    id: "hero",
    title: "What changed this week",
    description: "Emergence tiles for new pains, new competitors, graduated signals, contested unresolved.",
    defaultStages: ["pmf", "scale"],
    defaultFocusAreas: ["enablement", "competitive", "positioning"],
  },
  {
    id: "drift_hero",
    title: "Positioning–Market Drift",
    description: "Single drift score across the active signal pool. Pillar lights below.",
    defaultStages: ["pmf", "scale"],
    defaultFocusAreas: ["enablement", "positioning"],
  },
  {
    id: "pillars",
    title: "Pillar Traffic Lights",
    description: "Per-pillar reinforcement vs contradiction. Needs canonical pillars set.",
    defaultStages: ["pmf", "scale"],
    defaultFocusAreas: ["positioning", "enablement"],
  },
  {
    id: "icp",
    title: "ICP Fit Distribution",
    description: "Strong / Adjacent / Outside with per-bucket win rate.",
    defaultStages: ["pmf", "scale"],
    defaultFocusAreas: ["enablement", "positioning"],
  },
  {
    id: "blocker",
    title: "Real Blocker Distribution",
    description: "Buckets across price / trust / timing / product / fit / not-blocked.",
    defaultStages: ["pmf", "scale"],
    defaultFocusAreas: ["enablement"],
  },
  {
    id: "top_signals",
    title: "Top Recurring Signals",
    description: "Top 5 by reinforcement count and recency. Useful at every stage.",
    defaultStages: ["pre_pmf", "pmf", "scale"],
    defaultFocusAreas: ["enablement", "competitive", "positioning"],
  },
  {
    id: "contested",
    title: "Contested Queue",
    description: "Signals contradicting canonical. Only meaningful once Concrete exists.",
    defaultStages: ["pmf", "scale"],
    defaultFocusAreas: ["positioning"],
  },
  {
    id: "auto_answers",
    title: "Auto-Answers Queue",
    description: "Repeated questions worth canonical answers. Highest value at scale.",
    defaultStages: ["pmf", "scale"],
    defaultFocusAreas: ["enablement"],
  },
  {
    id: "competitor",
    title: "Competitor Intelligence",
    description: "Mention share, win rate, trend, switching triggers.",
    defaultStages: ["pre_pmf", "pmf", "scale"],
    defaultFocusAreas: ["competitive", "enablement"],
  },
  {
    id: "benefits",
    title: "Terminal Benefit Themes",
    description: "Outcome themes from use-case and expansion signals.",
    defaultStages: ["pmf", "scale"],
    defaultFocusAreas: ["positioning", "enablement"],
  },
  {
    id: "enablement",
    title: "Enablement Opportunities",
    description: "Rep language from progressed calls — candidates for canonical messaging.",
    defaultStages: ["pmf", "scale"],
    defaultFocusAreas: ["enablement"],
  },
  {
    id: "interpretation",
    title: "Second-Layer Read",
    description: "Plain-language synthesis from the page's own numbers.",
    defaultStages: ["pre_pmf", "pmf", "scale"],
    defaultFocusAreas: ["enablement", "competitive", "positioning"],
  },
];

const REGISTRY_BY_ID = new Map(MODULE_REGISTRY.map((m) => [m.id, m]));

export function getModule(id: string): ModuleDescriptor | undefined {
  return REGISTRY_BY_ID.get(id);
}

/**
 * Compute the set of active module IDs for a given workspace state.
 *
 * The decision tree per module:
 *   1. If module_overrides[id] is set explicitly → use that.
 *   2. Else: active if stage ∈ defaultStages AND focusAreas overlaps
 *      defaultFocusAreas.
 *
 * Returns the IDs in registry order. The dashboard page renders modules
 * in this order; reordering is a future PR.
 */
export function getActiveModuleIds(
  focusAreas: FocusArea[],
  stage: Stage,
  moduleOverrides: Record<string, boolean>
): Set<string> {
  const active = new Set<string>();
  for (const m of MODULE_REGISTRY) {
    const override = moduleOverrides[m.id];
    if (override === true) {
      active.add(m.id);
      continue;
    }
    if (override === false) continue;
    const stageMatch = m.defaultStages.includes(stage);
    const focusMatch = m.defaultFocusAreas.some((f) => focusAreas.includes(f));
    if (stageMatch && focusMatch) active.add(m.id);
  }
  return active;
}
