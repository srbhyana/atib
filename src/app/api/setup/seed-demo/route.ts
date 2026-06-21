import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { canonicalContext, competitors, approvedSignals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type PresetKey = "refive" | "flowace";

const PRESETS: Record<PresetKey, {
  companyName: string;
  positioningStatement: string;
  pillar1: string;
  pillar2: string;
  pillar3: string;
  icpCore: string;
  icpAdjacent: string;
  brandVoice: string;
  competitors: { name: string; url: string; notes: string }[];
  approvedSignals: { title: string; content: string }[];
}> = {
  refive: {
    companyName: "Refive",
    positioningStatement:
      "The identification layer that turns the receipt into a frictionless customer-data moment, sitting beneath the loyalty program — not next to it.",
    pillar1: "Identification layer — turn anonymous shoppers into identified customers at the receipt",
    pillar2: "Buy vs build — purpose-built capture beats internal QR / WhatsApp builds at 5×+ the rate",
    pillar3: "Commercial fit — per-store, payback inside a year, sits in the existing retail-software band",
    icpCore: "Mid-market multi-location retail (50–500 stores) with anonymous-customer rate above 60%",
    icpAdjacent: "Petroleum, hospitality groups, and B2B fleet networks with mixed identification surfaces",
    brandVoice: "Direct, specific, operator-language. No category jargon. Real numbers over claims.",
    competitors: [
      { name: "Lightspeed", url: "https://www.lightspeedhq.com", notes: "POS-bundled digital receipt — receipt-as-feature, not identification layer." },
      { name: "Shopify POS", url: "https://www.shopify.com/pos", notes: "Bundled receipt PDF. Captures email at till, not identification at open." },
      { name: "Custom Build", url: "", notes: "Internal QR / WhatsApp builds. Historical ceiling ≈ 9% capture; maintenance tax permanent." },
    ],
    approvedSignals: [
      { title: "Identification layer — not a receipt feature", content: "The receipt is the trojan horse. Identification is the product. This framing converts highest in deal-room transcripts." },
      { title: "Sits beneath loyalty, not next to it", content: "Pre-emptive reframe for 'we already have a loyalty program' objection. Loyalty captures opted-in; we capture everyone before that." },
      { title: "Sub-30% baseline = high-fit prospect", content: "Champions with a baseline identification rate under 30% convert 3.2× faster than average. Use as ABM qualifier." },
    ],
  },
  flowace: {
    companyName: "Flowace",
    positioningStatement:
      "Operational clarity for distributed teams. Not surveillance. Signal density.",
    pillar1: "Operational intelligence, not activity tracking",
    pillar2: "Manager usability over analytics depth",
    pillar3: "Employee-side transparency, not employer-side enforcement",
    icpCore: "Mid-market BPO and distributed ops teams, 200–1000 employees",
    icpAdjacent: "Logistics, customer service, field ops teams 100–500 employees",
    brandVoice: "Operator-language. Direct. No HR-tech euphemisms. Trust comes from specifics.",
    competitors: [
      { name: "Hubstaff", url: "https://hubstaff.com", notes: "Activity-tracking framing. Strong SMB pull. Weakness: employee-side resentment." },
      { name: "Time Doctor", url: "https://www.timedoctor.com", notes: "Heavy enterprise feature footprint. Manager UX is dense." },
      { name: "ActivTrak", url: "https://activtrak.com", notes: "Analytics-depth pitch. Wins on dashboards. Loses on rep-side adoption." },
    ],
    approvedSignals: [
      { title: "Pricing is not our differentiator", content: "Approved Concrete. Pricing-led pitches underperform manager-simplicity pitches in win-rate by 18 points." },
      { title: "Manager simplicity is our wedge", content: "Single biggest progressed-deal correlate. Lead with the manager workflow, not the tracking depth." },
      { title: "Employee-side trust is the moat", content: "Customers who pilot the employee-side transparency feature renew at +24 points vs those who skip it." },
    ],
  },
};

export async function POST(request: Request) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const body = await request.json().catch(() => ({}));
    const preset = String(body.preset || "").toLowerCase() as PresetKey;
    const data = PRESETS[preset];
    if (!data) {
      return NextResponse.json(
        { ok: false, error: `Unknown preset "${preset}". Use 'refive' or 'flowace'.` },
        { status: 400 }
      );
    }

    // Upsert canonical context
    const existing = await db
      .select()
      .from(canonicalContext)
      .where(eq(canonicalContext.workspaceId, session.workspaceId))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(canonicalContext).values({
        workspaceId: session.workspaceId,
        companyName: data.companyName,
        positioningStatement: data.positioningStatement,
        pillar1: data.pillar1,
        pillar2: data.pillar2,
        pillar3: data.pillar3,
        icpCore: data.icpCore,
        icpAdjacent: data.icpAdjacent,
        brandVoice: data.brandVoice,
        updatedBy: session.id,
        updatedAt: new Date(),
      });
    } else {
      await db
        .update(canonicalContext)
        .set({
          companyName: data.companyName,
          positioningStatement: data.positioningStatement,
          pillar1: data.pillar1,
          pillar2: data.pillar2,
          pillar3: data.pillar3,
          icpCore: data.icpCore,
          icpAdjacent: data.icpAdjacent,
          brandVoice: data.brandVoice,
          updatedBy: session.id,
          updatedAt: new Date(),
        })
        .where(eq(canonicalContext.workspaceId, session.workspaceId));
    }

    // Replace competitors
    await db
      .delete(competitors)
      .where(eq(competitors.workspaceId, session.workspaceId));
    for (const c of data.competitors) {
      await db.insert(competitors).values({
        workspaceId: session.workspaceId,
        name: c.name,
        url: c.url,
        battlecardNotes: c.notes,
      });
    }

    // Replace approved signals
    await db
      .delete(approvedSignals)
      .where(eq(approvedSignals.workspaceId, session.workspaceId));
    for (const s of data.approvedSignals) {
      await db.insert(approvedSignals).values({
        workspaceId: session.workspaceId,
        title: s.title,
        content: s.content,
        approvedBy: session.id,
      });
    }

    return NextResponse.json({
      ok: true,
      preset,
      companyName: data.companyName,
      message: `Seeded canonical context for ${data.companyName}. Pillars, ICP, competitors, and 3 Concrete signals are now in place.`,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Seed demo error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Seed failed." },
      { status: 500 }
    );
  }
}
