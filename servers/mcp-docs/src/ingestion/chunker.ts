import { MDocument } from "@mastra/rag";

export interface ChunkOptions {
  /** Maximum chunk size in characters (default: 512) */
  maxSize?: number;
  /** Overlap between chunks in characters (default: 50) */
  overlap?: number;
}

const DEFAULT_OPTIONS = {
  maxSize: 512,
  overlap: 50,
};

/**
 * Chunk document content using Mastra's MDocument.
 * Uses recursive strategy for reliable markdown-aware chunking.
 */
export async function chunkDocument(
  content: string,
  options: ChunkOptions = {},
): Promise<string[]> {
  if (!content || !content.trim()) {
    return [];
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  const doc = MDocument.fromText(content);

  const chunks = await doc.chunk({
    strategy: "recursive",
    maxSize: opts.maxSize,
    overlap: opts.overlap,
  });

  // Extract text from chunk objects and filter empty chunks
  return chunks
    .map((chunk) => chunk.text.trim())
    .filter((text) => text.length > 0);
}
