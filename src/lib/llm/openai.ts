import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";

function getClient(apiKey?: string | null): OpenAI {
  const resolvedKey = apiKey || process.env.OPENAI_API_KEY;
  if (!resolvedKey) {
    throw new Error("No OpenAI API key is configured for this workspace");
  }
  return new OpenAI({ apiKey: resolvedKey });
}

/**
 * Generate an embedding vector for the given text.
 * Returns a 1536-dimensional float array.
 */
export async function getEmbedding(text: string, apiKey?: string | null): Promise<number[]> {
  const openai = getClient(apiKey);

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000), // Cap input to avoid token limit
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a single batch call.
 */
export async function getEmbeddings(texts: string[], apiKey?: string | null): Promise<number[][]> {
  const openai = getClient(apiKey);

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
  });

  return response.data.map((d) => d.embedding);
}
