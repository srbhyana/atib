import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { autoAnswers } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireRole(["pmm_admin"]);

    const items = await db
      .select()
      .from(autoAnswers)
      .where(eq(autoAnswers.workspaceId, session.workspaceId))
      .orderBy(desc(autoAnswers.frequency))
      .limit(50);

    return NextResponse.json({ ok: true, autoAnswers: items });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Auto-answers GET error:", error);
    return NextResponse.json({ ok: false, error: "Failed to load auto-answers." }, { status: 500 });
  }
}
