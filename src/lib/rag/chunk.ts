/**
 * Markdown chunker for the four Knowledge Base files.
 *
 * Goals:
 *   • Split on natural section boundaries — headings AND the ASCII-art
 *     "═══" / "───" separators the KB files use.
 *   • Target 300-500 tokens per chunk (~1200-2000 chars).
 *   • Preserve a sectionPath like `positioning.framework.5c.customer` so the
 *     retriever can surface breadcrumbs.
 *   • Never break mid-list or mid-code-block.
 */

export interface Chunk {
  sectionPath: string;
  content: string;
  tokenCount: number;
}

const TARGET_CHARS = 2000;
const MAX_CHARS = 3000;
const MIN_CHARS = 200;

/**
 * Rough token estimate (English text averages ~4 chars/token).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Slugify a heading line into a sectionPath segment.
 */
function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[│┌└├─┐┘┤]+/g, "") // strip box-drawing characters
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Parse a heading from a line. Returns { level, text } or null.
 */
function parseHeading(line: string): { level: number; text: string } | null {
  const md = line.match(/^(#{1,6})\s+(.*)$/);
  if (md) return { level: md[1].length, text: md[2].trim() };

  // ASCII boxes: titles often appear inside │ or are SHOUTY CAPS lines
  if (/^[A-Z][A-Z 0-9&·:.,'"\-/]+$/.test(line.trim()) && line.trim().length > 6 && line.trim().length < 80) {
    return { level: 2, text: line.trim() };
  }

  return null;
}

/**
 * Split a markdown file into chunks.
 */
export function chunkMarkdown(source: string, markdown: string): Chunk[] {
  const lines = markdown.split(/\r?\n/);
  const chunks: Chunk[] = [];

  let buffer: string[] = [];
  const pathStack: string[] = [source];
  let pathAtBufferStart: string[] = [...pathStack];

  function pushChunk(force = false) {
    const content = buffer.join("\n").trim();
    if (!content) {
      buffer = [];
      return;
    }

    if (content.length < MIN_CHARS && !force) {
      // Too small — keep appending; resets only when we hit a hard boundary
      return;
    }

    chunks.push({
      sectionPath: pathAtBufferStart.join("."),
      content,
      tokenCount: estimateTokens(content),
    });

    buffer = [];
    pathAtBufferStart = [...pathStack];
  }

  for (const line of lines) {
    // Skip ASCII-art separators entirely
    if (/^[═━─]{5,}$/.test(line.trim())) continue;

    const heading = parseHeading(line);

    if (heading) {
      // New heading → flush buffer
      pushChunk(true);

      // Adjust path stack to this heading's level (relative to source root at level 1)
      const targetDepth = heading.level;
      while (pathStack.length > targetDepth) pathStack.pop();
      while (pathStack.length < targetDepth) pathStack.push("");
      pathStack[targetDepth - 1] = slugifyHeading(heading.text);

      pathAtBufferStart = [...pathStack];

      // Include the heading line in the next chunk so retrieved context shows
      // what section it came from
      buffer.push(line);
      continue;
    }

    buffer.push(line);

    // Mid-section flush when the buffer gets big
    const joined = buffer.join("\n");
    if (joined.length >= MAX_CHARS) {
      // Try to flush at a paragraph boundary (last blank line within the last 500 chars)
      const lastBlank = joined.lastIndexOf("\n\n", MAX_CHARS);
      if (lastBlank > TARGET_CHARS) {
        chunks.push({
          sectionPath: pathAtBufferStart.join("."),
          content: joined.slice(0, lastBlank).trim(),
          tokenCount: estimateTokens(joined.slice(0, lastBlank)),
        });
        buffer = [joined.slice(lastBlank + 2)];
        pathAtBufferStart = [...pathStack];
      } else {
        pushChunk(true);
      }
    }
  }

  pushChunk(true);

  return chunks.filter((c) => c.content.length >= 50);
}
