import { logger } from "@mcp/shared/logger";
import { embed } from "ai";
import { getEmbeddingCache } from "../cache/embedding-cache.js";
import { getEmbeddingModel } from "../config/embeddings.js";
import type { DocsRepository } from "../db/repository.js";
import {
  cleanMarkdown,
  truncateContent,
} from "../ingestion/markdown-cleaner.js";

export interface SearchSourceParams {
  query: string;
  limit?: number;
}

export interface SearchGroupParams {
  query: string;
  sources: string[];
  limit?: number;
}

export interface ToolResponse {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Format full documents as markdown for LLM consumption.
 */
function formatDocsAsMarkdown(
  documents: Array<{
    title: string;
    url: string;
    content: string;
  }>,
): string {
  if (documents.length === 0) {
    return "No results found.";
  }

  return documents
    .map((doc) => `## ${doc.title}\n${doc.url}\n\n${doc.content}`)
    .join("\n\n---\n\n");
}

/**
 * Service for handling MCP tool requests.
 */
export class ToolService {
  private log = logger.child({ service: "ToolService" });

  constructor(private repo: DocsRepository) {}

  /**
   * Search documentation for a specific source.
   * Returns full cleaned documents with de-duplication.
   */
  async searchSourceDocs(
    source: string,
    params: SearchSourceParams,
  ): Promise<ToolResponse> {
    const result = await this.searchSourceDocsFullContent(source, params);

    if (result.documents.length === 0) {
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
          text: formatDocsAsMarkdown(result.documents),
        },
      ],
    };
  }

  /**
   * Search documentation across multiple sources (for groups).
   * Returns full cleaned documents with de-duplication.
   */
  async searchGroupDocs(
    groupName: string,
    params: SearchGroupParams,
  ): Promise<ToolResponse> {
    const result = await this.searchGroupDocsFullContent(groupName, params);

    if (result.documents.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No results found for "${params.query}" in ${groupName} documentation.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: formatDocsAsMarkdown(result.documents),
        },
      ],
    };
  }

  /**
   * Search documentation and return full cleaned documents.
   * Uses hybrid search to find relevant chunks, then fetches and cleans full documents.
   */
  async searchSourceDocsFullContent(
    source: string,
    params: SearchSourceParams,
    options: { maxTotalChars?: number } = {},
  ): Promise<{
    documents: Array<{ title: string; url: string; content: string }>;
    totalChars: number;
    truncated: boolean;
  }> {
    const startTime = performance.now();
    const limit = params.limit ?? 5;
    const maxTotalChars = options.maxTotalChars ?? 50000;

    this.log.debug("Searching docs (full content)", {
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
      this.log.debug("Generated embedding", {
        ms: Math.round(embeddingTimeMs),
      });
    }

    // Hybrid search to find relevant chunks
    const dbStart = performance.now();
    const chunkResults = await this.repo.searchChunksHybrid(
      embedding,
      params.query,
      { source, limit: limit * 3 }, // Fetch more chunks to get diverse documents
    );

    // Extract unique document IDs (preserving relevance order)
    const seenDocIds = new Set<number>();
    const uniqueDocIds: number[] = [];
    for (const chunk of chunkResults) {
      if (!seenDocIds.has(chunk.document_id)) {
        seenDocIds.add(chunk.document_id);
        uniqueDocIds.push(chunk.document_id);
        if (uniqueDocIds.length >= limit) break;
      }
    }

    // Fetch full documents
    const documents = await this.repo.getDocumentsByIds(uniqueDocIds);
    const dbTimeMs = performance.now() - dbStart;

    // Sort documents by their order in the search results
    const docOrder = new Map(uniqueDocIds.map((id, index) => [id, index]));
    documents.sort(
      (a, b) => (docOrder.get(a.id) ?? 0) - (docOrder.get(b.id) ?? 0),
    );

    // Clean and truncate documents
    let totalChars = 0;
    let truncated = false;
    const cleanedDocs: Array<{ title: string; url: string; content: string }> =
      [];

    for (const doc of documents) {
      const cleaned = cleanMarkdown(doc.content);
      const remainingChars = maxTotalChars - totalChars;

      if (remainingChars <= 0) {
        truncated = true;
        break;
      }

      const content =
        cleaned.length > remainingChars
          ? truncateContent(cleaned, remainingChars)
          : cleaned;

      cleanedDocs.push({
        title: doc.title,
        url: doc.url,
        content,
      });

      totalChars += content.length;

      if (totalChars >= maxTotalChars) {
        truncated = true;
        break;
      }
    }

    this.log.info("Full content search completed", {
      source,
      query: params.query.slice(0, 50),
      documents: cleanedDocs.length,
      totalChars,
      truncated,
      cacheHit,
      dbMs: Math.round(dbTimeMs),
      totalMs: Math.round(performance.now() - startTime),
    });

    return {
      documents: cleanedDocs,
      totalChars,
      truncated,
    };
  }

  /**
   * Search across multiple sources and return full cleaned documents.
   */
  async searchGroupDocsFullContent(
    groupName: string,
    params: SearchGroupParams,
    options: { maxTotalChars?: number } = {},
  ): Promise<{
    documents: Array<{ title: string; url: string; content: string }>;
    totalChars: number;
    truncated: boolean;
  }> {
    const startTime = performance.now();
    const limit = params.limit ?? 5;
    const maxTotalChars = options.maxTotalChars ?? 50000;

    this.log.debug("Searching group docs (full content)", {
      group: groupName,
      sources: params.sources,
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
      this.log.debug("Generated embedding", {
        ms: Math.round(embeddingTimeMs),
      });
    }

    // Search across all sources in the group
    const dbStart = performance.now();
    const allResults = await Promise.all(
      params.sources.map((source) =>
        this.repo.searchChunksHybrid(embedding, params.query, {
          source,
          limit: Math.ceil((limit * 3) / params.sources.length) + 2,
        }),
      ),
    );

    // Merge and re-rank results
    const mergedResults = allResults.flat();
    mergedResults.sort((a, b) => a.distance - b.distance);

    // Extract unique document IDs
    const seenDocIds = new Set<number>();
    const uniqueDocIds: number[] = [];
    for (const chunk of mergedResults) {
      if (!seenDocIds.has(chunk.document_id)) {
        seenDocIds.add(chunk.document_id);
        uniqueDocIds.push(chunk.document_id);
        if (uniqueDocIds.length >= limit) break;
      }
    }

    // Fetch full documents
    const documents = await this.repo.getDocumentsByIds(uniqueDocIds);
    const dbTimeMs = performance.now() - dbStart;

    // Sort documents by their order in the search results
    const docOrder = new Map(uniqueDocIds.map((id, index) => [id, index]));
    documents.sort(
      (a, b) => (docOrder.get(a.id) ?? 0) - (docOrder.get(b.id) ?? 0),
    );

    // Clean and truncate documents
    let totalChars = 0;
    let truncated = false;
    const cleanedDocs: Array<{ title: string; url: string; content: string }> =
      [];

    for (const doc of documents) {
      const cleaned = cleanMarkdown(doc.content);
      const remainingChars = maxTotalChars - totalChars;

      if (remainingChars <= 0) {
        truncated = true;
        break;
      }

      const content =
        cleaned.length > remainingChars
          ? truncateContent(cleaned, remainingChars)
          : cleaned;

      cleanedDocs.push({
        title: doc.title,
        url: doc.url,
        content,
      });

      totalChars += content.length;

      if (totalChars >= maxTotalChars) {
        truncated = true;
        break;
      }
    }

    this.log.info("Full content group search completed", {
      group: groupName,
      query: params.query.slice(0, 50),
      documents: cleanedDocs.length,
      totalChars,
      truncated,
      cacheHit,
      dbMs: Math.round(dbTimeMs),
      totalMs: Math.round(performance.now() - startTime),
    });

    return {
      documents: cleanedDocs,
      totalChars,
      truncated,
    };
  }
}
