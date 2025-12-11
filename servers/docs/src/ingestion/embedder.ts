import { logger } from "@mcp/shared/logger";
import type { EmbeddingModel } from "ai";
import { embedMany } from "ai";

export type EmbedOptions = {
  /** Number of texts per batch (default: 100) */
  batchSize?: number;
  /** Number of concurrent batches (default: 5) */
  concurrency?: number;
};

/**
 * Service for generating text embeddings using an AI model.
 * Supports batched processing with concurrency limits.
 */
export class EmbedderService {
  private readonly log = logger.child({ module: "EmbedderService" });

  constructor(private readonly embeddingModel: EmbeddingModel<string>) {}

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const { embeddings } = await embedMany({
      model: this.embeddingModel,
      values: texts,
      maxRetries: 3,
    });
    return embeddings;
  }

  async embedInBatches(
    texts: string[],
    options: EmbedOptions = {},
  ): Promise<number[][]> {
    const { batchSize = 100, concurrency = 5 } = options;

    if (texts.length === 0) {
      return [];
    }

    // Split into batches
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    this.log.debug("Starting embedding", {
      texts: texts.length,
      batches: batches.length,
      concurrency,
    });

    // Process batches with concurrency limit
    const results: number[][] = new Array(texts.length);
    let completedBatches = 0;

    // Process in chunks of `concurrency` batches
    for (let i = 0; i < batches.length; i += concurrency) {
      const chunk = batches.slice(i, i + concurrency);
      const chunkPromises = chunk.map(async (batch, chunkIndex) => {
        const batchIndex = i + chunkIndex;
        const embeddings = await this.generateEmbeddings(batch);

        // Place results in correct position
        const startIdx = batchIndex * batchSize;
        for (let j = 0; j < embeddings.length; j++) {
          // biome-ignore lint/style/noNonNullAssertion: cannot be null here
          results[startIdx + j] = embeddings[j]!;
        }

        completedBatches++;
        this.log.debug("Embedded batch", {
          batch: `${completedBatches}/${batches.length}`,
          texts: batch.length,
        });
      });

      await Promise.all(chunkPromises);
    }

    return results;
  }
}
