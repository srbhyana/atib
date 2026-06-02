import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { decryptSecret, encryptSecret } from "@/lib/security/secrets";
import { pingAnthropic } from "@/lib/llm/anthropic";

/**
 * GET /api/settings/keys — Read API key status (masked)
 */
export async function GET() {
  try {
    const session = await requireRole(["pmm_admin"]);

    const [ws] = await db
      .select({
        anthropicApiKey: workspaces.anthropicApiKey,
        openaiApiKey: workspaces.openaiApiKey,
      })
      .from(workspaces)
      .where(eq(workspaces.id, session.workspaceId))
      .limit(1);

    return NextResponse.json({
      ok: true,
      keys: {
        anthropic: ws?.anthropicApiKey ? `sk-ant-...${decryptSecret(ws.anthropicApiKey).slice(-4)}` : null,
        openai: ws?.openaiApiKey ? `sk-...${decryptSecret(ws.openaiApiKey).slice(-4)}` : null,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ ok: false, error: "Failed to read keys" }, { status: 500 });
  }
}

/**
 * PUT /api/settings/keys — Save API keys
 */
export async function PUT(request: Request) {
  try {
    const session = await requireRole(["pmm_admin"]);
    const body = await request.json();
    const { anthropicApiKey, openaiApiKey } = body;

    if (anthropicApiKey) {
      const valid = await pingAnthropic(anthropicApiKey);
      if (!valid) {
        return NextResponse.json(
          { ok: false, error: "Anthropic key test failed. Double-check the key and try again." },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, string | null> = {};
    if (anthropicApiKey !== undefined) {
      updateData.anthropicApiKey = anthropicApiKey ? encryptSecret(anthropicApiKey) : null;
    }
    if (openaiApiKey !== undefined) {
      updateData.openaiApiKey = openaiApiKey ? encryptSecret(openaiApiKey) : null;
    }

    if (Object.keys(updateData).length > 0) {
      await db
        .update(workspaces)
        .set(updateData)
        .where(eq(workspaces.id, session.workspaceId));
    }

    return NextResponse.json({ ok: true, tested: Boolean(anthropicApiKey) });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ ok: false, error: "Failed to save keys" }, { status: 500 });
  }
}
