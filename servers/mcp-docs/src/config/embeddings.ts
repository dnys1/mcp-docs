import { openai } from "@ai-sdk/openai";
import type { EmbeddingModel } from "ai";

export function getEmbeddingModel(): EmbeddingModel<string> {
  const provider = process.env.EMBEDDING_PROVIDER || "openai";
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

  switch (provider) {
    case "openai":
      return openai.embedding(model);
    default:
      console.warn(`Unknown provider "${provider}", defaulting to OpenAI`);
      return openai.embedding(model);
  }
}

export const EMBEDDING_DIMENSIONS = parseInt(
  process.env.EMBEDDING_DIMENSIONS || "1536",
  10,
);
