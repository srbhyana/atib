import { describe, it, expect } from "vitest";
import {
  evaluateTierTransition,
  isContestedExpired,
  getReinforcementWeight,
  type SignalMetrics,
} from "@/lib/utils/tier-machine";

// ─── Base metrics factory ──────────────────────────────────────────

function base(overrides: Partial<SignalMetrics> = {}): SignalMetrics {
  return {
    callCount: 1,
    distinctReps: 1,
    distinctSegments: 1,
    daysSinceFirstSeen: 5,
    daysSinceLastReinforced: 2,
    progressedCount: 0,
    totalAppearances: 1,
    contradictsConcrete: false,
    contradictionCallCount: 0,
    pmmApproved: false,
    currentTier: "suggestion",
    ...overrides,
  };
}

// ─── Suggestion → Evolving ────────────────────────────────────────

describe("Suggestion → Evolving", () => {
  it("auto-promotes when thresholds met (3+ calls, 14d window, 2+ reps)", () => {
    const result = evaluateTierTransition(
      base({ callCount: 3, distinctReps: 2, daysSinceFirstSeen: 10 })
    );
    expect(result).not.toBeNull();
    expect(result?.to).toBe("evolving");
    expect(result?.requiresPmmAction).toBe(false);
  });

  it("does NOT promote when only 2 calls", () => {
    const result = evaluateTierTransition(
      base({ callCount: 2, distinctReps: 2, daysSinceFirstSeen: 10 })
    );
    // callCount threshold is 3
    expect(result).toBeNull();
  });

  it("does NOT promote when only 1 rep and 1 segment (needs diversity)", () => {
    const result = evaluateTierTransition(
      base({ callCount: 3, distinctReps: 1, distinctSegments: 1, daysSinceFirstSeen: 10 })
    );
    expect(result).toBeNull();
  });

  it("promotes via segment diversity even without rep diversity", () => {
    const result = evaluateTierTransition(
      base({ callCount: 3, distinctReps: 1, distinctSegments: 2, daysSinceFirstSeen: 10 })
    );
    expect(result?.to).toBe("evolving");
  });

  it("does NOT promote when outside the 14-day window", () => {
    const result = evaluateTierTransition(
      base({ callCount: 3, distinctReps: 2, daysSinceFirstSeen: 20 })
    );
    expect(result).toBeNull();
  });
});

// ─── Evolving → Concrete ─────────────────────────────────────────

describe("Evolving → Concrete", () => {
  it("promotes immediately on PMM approval", () => {
    const result = evaluateTierTransition(
      base({ currentTier: "evolving", pmmApproved: true })
    );
    expect(result?.to).toBe("concrete");
    expect(result?.requiresPmmAction).toBe(false);
  });

  it("auto-promotes when all thresholds met (8+ calls, 30d, 50%+ progressed, no contradictions)", () => {
    const result = evaluateTierTransition(
      base({
        currentTier: "evolving",
        callCount: 8,
        daysSinceFirstSeen: 25,
        progressedCount: 5,
        totalAppearances: 8,
        contradictsConcrete: false,
      })
    );
    expect(result?.to).toBe("concrete");
    expect(result?.requiresPmmAction).toBe(true); // notification required
  });

  it("does NOT auto-promote when below progressed threshold (< 50%)", () => {
    const result = evaluateTierTransition(
      base({
        currentTier: "evolving",
        callCount: 8,
        daysSinceFirstSeen: 25,
        progressedCount: 3, // 3/8 = 37.5%
        totalAppearances: 8,
        contradictsConcrete: false,
      })
    );
    expect(result).toBeNull();
  });

  it("does NOT auto-promote when contradictsConcrete is true", () => {
    const result = evaluateTierTransition(
      base({
        currentTier: "evolving",
        callCount: 8,
        daysSinceFirstSeen: 25,
        progressedCount: 5,
        totalAppearances: 8,
        contradictsConcrete: true,
      })
    );
    // Can't go Concrete when actively contradicting
    expect(result?.to).not.toBe("concrete");
  });
});

// ─── Any → Contested ─────────────────────────────────────────────

describe("Any → Contested", () => {
  it("moves to contested when contradictsConcrete AND 3+ contradiction calls", () => {
    const result = evaluateTierTransition(
      base({
        currentTier: "suggestion",
        contradictsConcrete: true,
        contradictionCallCount: 3,
      })
    );
    expect(result?.to).toBe("contested");
    expect(result?.requiresPmmAction).toBe(true);
  });

  it("does NOT move to contested with only 2 contradiction calls", () => {
    const result = evaluateTierTransition(
      base({
        currentTier: "suggestion",
        contradictsConcrete: true,
        contradictionCallCount: 2,
      })
    );
    expect(result?.to).not.toBe("contested");
  });

  it("does NOT move dismissed signals to contested", () => {
    const result = evaluateTierTransition(
      base({
        currentTier: "dismissed",
        contradictsConcrete: true,
        contradictionCallCount: 5,
      })
    );
    expect(result).toBeNull();
  });

  it("does NOT move archived signals to contested", () => {
    const result = evaluateTierTransition(
      base({
        currentTier: "archived",
        contradictsConcrete: true,
        contradictionCallCount: 5,
      })
    );
    expect(result).toBeNull();
  });
});

// ─── Time decay ───────────────────────────────────────────────────

describe("Time decay", () => {
  it("archives evolving signal inactive 90+ days", () => {
    const result = evaluateTierTransition(
      base({ currentTier: "evolving", daysSinceLastReinforced: 95 })
    );
    expect(result?.to).toBe("archived");
  });

  it("demotes evolving to suggestion after 30-89 days inactive", () => {
    const result = evaluateTierTransition(
      base({ currentTier: "evolving", daysSinceLastReinforced: 45 })
    );
    expect(result?.to).toBe("suggestion");
  });

  it("demotes suggestion to archived after 30+ days inactive", () => {
    const result = evaluateTierTransition(
      base({ currentTier: "suggestion", daysSinceLastReinforced: 35 })
    );
    expect(result?.to).toBe("archived");
  });

  it("does NOT decay concrete signals", () => {
    const result = evaluateTierTransition(
      base({ currentTier: "concrete", daysSinceLastReinforced: 200 })
    );
    expect(result).toBeNull();
  });

  it("does NOT decay already-archived signals", () => {
    const result = evaluateTierTransition(
      base({ currentTier: "archived", daysSinceLastReinforced: 200 })
    );
    expect(result).toBeNull();
  });
});

// ─── Helpers ──────────────────────────────────────────────────────

describe("isContestedExpired", () => {
  it("returns true at 30 days", () => {
    expect(isContestedExpired(30)).toBe(true);
  });
  it("returns false at 29 days", () => {
    expect(isContestedExpired(29)).toBe(false);
  });
});

describe("getReinforcementWeight", () => {
  it("returns 2 for progressed calls", () => {
    expect(getReinforcementWeight("progressed")).toBe(2);
  });
  it("returns 1 for non-progressed calls", () => {
    expect(getReinforcementWeight("stalled")).toBe(1);
    expect(getReinforcementWeight("lost")).toBe(1);
  });
});
