import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";

const SECRET_PREFIX = "enc:v1:";

function getEncryptionKey(): Buffer | null {
  const raw = process.env.ATIB_ENCRYPTION_KEY;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  return createHash("sha256").update(trimmed).digest();
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(SECRET_PREFIX));
}

export function encryptSecret(value: string): string {
  const key = getEncryptionKey();
  const clean = String(value || "").trim();
  if (!clean || !key) {
    return clean;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${SECRET_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptSecret(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (!isEncryptedSecret(raw)) {
    return raw;
  }

  const key = getEncryptionKey();
  if (!key) {
    throw new Error("ATIB_ENCRYPTION_KEY is not configured");
  }

  const payload = raw.slice(SECRET_PREFIX.length);
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Encrypted secret payload is malformed");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

export function maskSecret(value: string | null | undefined, prefix = "", suffix = 4): string | null {
  const clean = decryptSecret(value);
  if (!clean) return null;
  const tail = clean.slice(-suffix);
  return prefix ? `${prefix}${tail}` : tail;
}

/**
 * Look up a workspace's per-workspace Anthropic API key and decrypt it.
 * Returns null if no key is configured (the caller falls back to env var or heuristic).
 */
export async function getWorkspaceAnthropicKey(
  workspaceId: string
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ anthropicApiKey: workspaces.anthropicApiKey })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!row?.anthropicApiKey) return null;
    return decryptSecret(row.anthropicApiKey) || null;
  } catch (err) {
    console.error("getWorkspaceAnthropicKey failed:", err);
    return null;
  }
}

/**
 * Look up a workspace's per-workspace OpenAI API key and decrypt it.
 * Used for embeddings (signal dedup + RAG).
 */
export async function getWorkspaceOpenAIKey(
  workspaceId: string
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ openaiApiKey: workspaces.openaiApiKey })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!row?.openaiApiKey) return null;
    return decryptSecret(row.openaiApiKey) || null;
  } catch (err) {
    console.error("getWorkspaceOpenAIKey failed:", err);
    return null;
  }
}
