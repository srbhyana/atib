import { db } from "@/lib/db/client";
import {
  canonicalContext,
  competitors,
  approvedSignals,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { CanonicalContextBlock } from "@/lib/utils/types";

/**
 * Canonical Context Agent — deterministic CRUD.
 *
 * Owns: company truth. Positioning statement, three messaging pillars,
 * top three competitors, ICP segments, approved Concrete signals.
 *
 * This is where "PMM stays in the loop" is enforced.
 * Nothing else writes to canonical state.
 */

// ─── Read ──────────────────────────────────────────────────────────

export async function getCanonicalContext(
  workspaceId: string
): Promise<CanonicalContextBlock | null> {
  const ctxResult = await db
    .select()
    .from(canonicalContext)
    .where(eq(canonicalContext.workspaceId, workspaceId))
    .limit(1);

  if (ctxResult.length === 0) return null;

  const ctx = ctxResult[0];

  const comps = await db
    .select()
    .from(competitors)
    .where(eq(competitors.workspaceId, workspaceId));

  const approved = await db
    .select()
    .from(approvedSignals)
    .where(eq(approvedSignals.workspaceId, workspaceId));

  return {
    companyName: ctx.companyName,
    positioningStatement: ctx.positioningStatement,
    pillars: [ctx.pillar1, ctx.pillar2, ctx.pillar3],
    icpCore: ctx.icpCore,
    icpAdjacent: ctx.icpAdjacent,
    brandVoice: ctx.brandVoice,
    competitors: comps.map((c) => ({
      id: c.id,
      name: c.name,
      url: c.url,
      battlecardNotes: c.battlecardNotes,
    })),
    approvedSignals: approved.map((s) => ({
      id: s.id,
      title: s.title,
      content: s.content,
    })),
  };
}

// ─── Create / Update ───────────────────────────────────────────────

export async function upsertCanonicalContext(
  workspaceId: string,
  data: Partial<{
    companyName: string;
    positioningStatement: string;
    pillar1: string;
    pillar2: string;
    pillar3: string;
    icpCore: string;
    icpAdjacent: string;
    brandVoice: string;
    personaProfiles: unknown;
    winLossNotes: string;
  }>,
  updatedBy?: string
): Promise<void> {
  const existing = await db
    .select()
    .from(canonicalContext)
    .where(eq(canonicalContext.workspaceId, workspaceId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(canonicalContext).values({
      workspaceId,
      ...data,
      updatedBy: updatedBy || null,
      updatedAt: new Date(),
    });
  } else {
    await db
      .update(canonicalContext)
      .set({
        ...data,
        updatedBy: updatedBy || existing[0].updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(canonicalContext.workspaceId, workspaceId));
  }
}

// ─── Competitors ───────────────────────────────────────────────────

export async function addCompetitor(
  workspaceId: string,
  data: { name: string; url?: string; battlecardNotes?: string }
) {
  const result = await db
    .insert(competitors)
    .values({
      workspaceId,
      name: data.name,
      url: data.url || "",
      battlecardNotes: data.battlecardNotes || "",
    })
    .returning();
  return result[0];
}

export async function updateCompetitor(
  id: string,
  data: Partial<{ name: string; url: string; battlecardNotes: string }>
) {
  await db.update(competitors).set(data).where(eq(competitors.id, id));
}

export async function removeCompetitor(id: string) {
  await db.delete(competitors).where(eq(competitors.id, id));
}

export async function getCompetitors(workspaceId: string) {
  return db
    .select()
    .from(competitors)
    .where(eq(competitors.workspaceId, workspaceId));
}

// ─── Approved Signals ──────────────────────────────────────────────

export async function addApprovedSignal(
  workspaceId: string,
  data: {
    title: string;
    content: string;
    approvedBy: string;
    promotedFromSignalId?: string;
  }
) {
  const result = await db
    .insert(approvedSignals)
    .values({
      workspaceId,
      title: data.title,
      content: data.content,
      approvedBy: data.approvedBy,
      promotedFromSignalId: data.promotedFromSignalId || null,
    })
    .returning();
  return result[0];
}

export async function removeApprovedSignal(id: string) {
  await db.delete(approvedSignals).where(eq(approvedSignals.id, id));
}

export async function getApprovedSignals(workspaceId: string) {
  return db
    .select()
    .from(approvedSignals)
    .where(eq(approvedSignals.workspaceId, workspaceId));
}
