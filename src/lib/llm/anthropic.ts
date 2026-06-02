import Anthropic from "@anthropic-ai/sdk";

const SOAP_MODEL = "claude-sonnet-4-6";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

function getClient(apiKey?: string | null): Anthropic {
  const resolvedKey = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!resolvedKey) {
    throw new Error("No Anthropic API key is configured for this workspace");
  }
  return new Anthropic({ apiKey: resolvedKey });
}

/**
 * Call Claude Sonnet for SOAP analysis.
 * Returns the raw text response.
 */
export async function callSoap(
  systemPrompt: string,
  userMessage: string,
  apiKey?: string | null
): Promise<string> {
  const anthropic = getClient(apiKey);

  const response = await anthropic.messages.create({
    model: SOAP_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text || "";
}

/**
 * Call Claude Haiku for lightweight tasks (second-layer interpretation, etc.).
 */
export async function callHaiku(
  systemPrompt: string,
  userMessage: string,
  apiKey?: string | null
): Promise<string> {
  const anthropic = getClient(apiKey);

  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text || "";
}

/**
 * Quick ping to verify the API key works.
 */
export async function pingAnthropic(apiKey?: string | null): Promise<boolean> {
  try {
    const anthropic = getClient(apiKey);
    await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 5,
      messages: [{ role: "user", content: "OK" }],
    });
    return true;
  } catch {
    return false;
  }
}
