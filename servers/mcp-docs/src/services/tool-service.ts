import { embed } from "ai";
import { getEmbeddingCache } from "../cache/embedding-cache.js";
import { getEmbeddingModel } from "../config/embeddings.js";
import type { DocsRepository } from "../db/repository.js";
import { logger } from "../utils/logger.js";

export interface SearchSourceParams {
  query: string;
  limit?: number;
}

export interface ToolResponse {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Format search results as markdown for LLM consumption.
 */
function formatResultsAsMarkdown(
  results: Array<{
    title: string;
    path: string | null;
    url: string;
    chunk_content: string;
  }>,
): string {
  if (results.length === 0) {
    return "No results found.";
  }

  return results
    .map((row) => {
      const path = row.path || "index";
      return `## ${row.title} (${path})\n${row.url}\n\n${row.chunk_content}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Service for handling MCP tool requests.
 */
export class ToolService {
  private log = logger.child({ service: "ToolService" });

  constructor(private repo: DocsRepository) {}

  /**
   * Search documentation for a specific source using hybrid search.
   */
  async searchSourceDocs(
    source: string,
    params: SearchSourceParams,
  ): Promise<ToolResponse> {
    const startTime = performance.now();
    const limit = params.limit ?? 5;

    this.log.debug("Searching docs", {
      source,
      query: params.query,
      limit,
    });

    // Get embedding for semantic search
    const cache = getEmbeddingCache();
    let embedding = cache.get(params.query);
    const cacheHit = !!embedding;

    if (!embedding) {
      const embeddingStart = performance.now();
      const embeddingModel = getEmbeddingModel();
      const result = await embed({
        model: embeddingModel,
        value: params.query,
      });
      embedding = result.embedding;
      cache.set(params.query, embedding);
      const embeddingTimeMs = performance.now() - embeddingStart;
      this.log.debug("Generated embedding", { ms: Math.round(embeddingTimeMs) });
    }

    // Hybrid search (semantic + keyword)
    const dbStart = performance.now();
    const results = await this.repo.searchChunksHybrid(
      embedding,
      params.query,
      { source, limit },
    );
    const dbTimeMs = performance.now() - dbStart;

    this.log.info("Search completed", {
      source,
      query: params.query.slice(0, 50),
      results: results.length,
      cacheHit,
      dbMs: Math.round(dbTimeMs),
      totalMs: Math.round(performance.now() - startTime),
    });

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No results found for "${params.query}" in ${source} documentation.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: formatResultsAsMarkdown(results),
        },
      ],
    };
  }
}
