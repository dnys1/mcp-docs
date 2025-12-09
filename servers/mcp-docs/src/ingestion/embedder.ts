import { embedMany } from "ai";
import { getEmbeddingModel } from "../config/embeddings.js";

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const embeddingModel = getEmbeddingModel();

  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: texts,
    maxRetries: 3,
  });
  return embeddings;
}

export async function embedInBatches(
  texts: string[],
  batchSize = 100,
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(
      `  Embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        texts.length / batchSize,
      )} (${batch.length} texts)...`,
    );

    const embeddings = await generateEmbeddings(batch);
    results.push(...embeddings);

    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}
