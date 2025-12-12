import { openai } from "@ai-sdk/openai";
import type { EmbeddingModel } from "ai";

export type EmbeddingProvider = "openai";

export type EmbeddingConfigOptions = {
  provider?: EmbeddingProvider;
  model?: string;
  dimensions?: number;
};

export class EmbeddingConfig {
  /** Default embedding dimensions for OpenAI text-embedding-3-small */
  static readonly DEFAULT_DIMENSIONS = 1536;

  readonly provider: EmbeddingProvider;
  readonly modelName: string;
  readonly dimensions: number;

  constructor(options: EmbeddingConfigOptions = {}) {
    this.provider = options.provider ?? "openai";
    this.modelName = options.model ?? "text-embedding-3-small";
    this.dimensions = options.dimensions ?? 1536;
  }

  /**
   * Create config from environment variables.
   * Call this at composition root, not inside methods.
   */
  static fromEnv(): EmbeddingConfig {
    const provider =
      (process.env.EMBEDDING_PROVIDER as EmbeddingProvider) || "openai";
    const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
    const dimensions = Number.parseInt(
      process.env.EMBEDDING_DIMENSIONS || "1536",
      10,
    );

    return new EmbeddingConfig({ provider, model, dimensions });
  }

  get model(): EmbeddingModel<string> {
    switch (this.provider) {
      case "openai":
        return openai.embedding(this.modelName);
      default:
        console.warn(
          `Unknown provider "${this.provider}", defaulting to OpenAI`,
        );
        return openai.embedding(this.modelName);
    }
  }
}
