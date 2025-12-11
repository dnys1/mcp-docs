import crypto from "node:crypto";
import { logger } from "@mcp/shared/logger";
import type { DocsRepository, IngestionProgress } from "../db/repository.js";
import { chunkDocument } from "../ingestion/chunker.js";
import { embedInBatches } from "../ingestion/embedder.js";
import { crawlWebDocs } from "../ingestion/firecrawl.js";
import { fetchLlmsTxtDocs } from "../ingestion/llms-txt.js";
import type { DocSource, FetchedDocument } from "../types/index.js";
import { generateSourceDescription } from "./description-service.js";

export interface IngestionOptions {
  resume?: boolean;
  dryRun?: boolean;
}

export interface DryRunResult {
  source: string;
  documentCount: number;
  documents: Array<{
    title: string;
    url: string;
    path?: string;
    contentLength: number;
    estimatedChunks: number;
  }>;
  totalContentSize: number;
  estimatedTotalChunks: number;
}

/**
 * Service for ingesting documentation from various sources.
 */
export class IngestionService {
  private log = logger.child({ service: "IngestionService" });

  constructor(private repo: DocsRepository) {}

  async ingestSource(
    source: DocSource,
    options?: IngestionOptions,
  ): Promise<DryRunResult | undefined> {
    this.log.info(`Starting ingestion for ${source.name}`, {
      source: source.name,
      type: source.type,
      dryRun: options?.dryRun ?? false,
    });

    // Get cached URLs to exclude from crawl (saves Firecrawl costs)
    let cachedUrls: string[] = [];
    if (source.type === "firecrawl" && !options?.dryRun) {
      const existingSource = await this.repo.getSourceByName(source.name);
      if (existingSource) {
        cachedUrls = await this.repo.getDocumentUrls(existingSource.id);
        if (cachedUrls.length > 0) {
          this.log.info(
            `Found ${cachedUrls.length} cached documents to exclude from crawl`,
          );
        }
      }
    }

    let documents: FetchedDocument[];

    try {
      documents = await this.fetchDocuments(source, cachedUrls);
    } catch (error) {
      this.log.error(`Failed to fetch documents for ${source.name}`, {
        source: source.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Dry run mode - just return what would be ingested
    if (options?.dryRun) {
      return this.performDryRun(source, documents);
    }

    // Generate description from document titles if not already set
    let description = source.description;
    if (!description) {
      this.log.info("Generating description from document titles...");
      const titles = documents.map((d) => d.title);
      description = await generateSourceDescription(
        source.name,
        source.url,
        titles,
      );
      this.log.info("Generated description", { description });
    }

    const sourceId = await this.repo.upsertSource({
      name: source.name,
      type: source.type,
      baseUrl: source.url,
      groupName: source.groupName,
      description,
    });

    // Check for existing incomplete ingestion
    let progress: IngestionProgress | null = null;
    let startIndex = 0;

    if (options?.resume) {
      progress = await this.repo.getIncompleteProgress(sourceId);
      if (progress) {
        this.log.info(`Resuming from previous ingestion`, {
          source: source.name,
          processed: progress.processedDocuments,
          total: documents.length,
        });
        // Find where to resume from
        if (progress.lastProcessedUrl) {
          const lastIndex = documents.findIndex(
            (d) => d.url === progress?.lastProcessedUrl,
          );
          if (lastIndex >= 0) {
            startIndex = lastIndex + 1;
          }
        }
      }
    }

    // Create new progress record if not resuming
    if (!progress) {
      try {
        progress = await this.repo.createProgress(sourceId, documents.length);
      } catch {
        // Progress table may not exist in older DBs, continue without tracking
        progress = {
          id: -1,
          processedDocuments: 0,
          skippedDocuments: 0,
          failedDocuments: 0,
          lastProcessedUrl: null,
        };
      }
    }

    this.log.info(`Processing ${documents.length} documents`, {
      source: source.name,
      startIndex: startIndex + 1,
      total: documents.length,
    });

    let processedCount = progress.processedDocuments;
    let skippedCount = progress.skippedDocuments;
    let failedCount = progress.failedDocuments;

    for (let i = startIndex; i < documents.length; i++) {
      const doc = documents[i];
      if (!doc) continue;
      const progressPct = Math.round(((i + 1) / documents.length) * 100);

      try {
        const contentHash = this.computeHash(doc.content);
        const existing = await this.repo.getDocumentByUrl(sourceId, doc.url);

        if (existing?.content_hash === contentHash) {
          this.log.debug(`Skipping unchanged document`, {
            title: doc.title,
            progress: `${progressPct}%`,
          });
          skippedCount++;
          await this.updateProgressSafe(progress.id, {
            processedDocuments: processedCount,
            skippedDocuments: skippedCount,
            failedDocuments: failedCount,
            lastProcessedUrl: doc.url,
          });
          continue;
        }

        const chunks = await chunkDocument(doc.content);
        this.log.debug(`Chunked document`, {
          title: doc.title,
          chunks: chunks.length,
          progress: `${progressPct}%`,
        });

        const embeddings = await embedInBatches(chunks);

        const documentId = await this.repo.upsertDocument({
          sourceId,
          url: doc.url,
          title: doc.title,
          path: doc.path || null,
          content: doc.content,
          contentHash,
          metadata: doc.metadata ? JSON.stringify(doc.metadata) : null,
        });

        await this.insertChunks(documentId, chunks, embeddings);

        this.log.info(`Ingested document`, {
          title: doc.title,
          url: doc.url,
          chunks: chunks.length,
          progress: `${progressPct}%`,
        });
        processedCount++;

        await this.updateProgressSafe(progress.id, {
          processedDocuments: processedCount,
          skippedDocuments: skippedCount,
          failedDocuments: failedCount,
          lastProcessedUrl: doc.url,
        });
      } catch (error) {
        this.log.error(`Failed to ingest document`, {
          title: doc.title,
          progress: `${progressPct}%`,
          error: error instanceof Error ? error.message : String(error),
        });
        failedCount++;
        await this.updateProgressSafe(progress.id, {
          processedDocuments: processedCount,
          skippedDocuments: skippedCount,
          failedDocuments: failedCount,
          lastProcessedUrl: doc.url,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.repo.updateSourceIngestedAt(sourceId);
    await this.completeProgressSafe(
      progress.id,
      failedCount > 0 ? "completed_with_errors" : "completed",
    );

    this.log.info(`Ingestion complete`, {
      source: source.name,
      processed: processedCount,
      skipped: skippedCount,
      failed: failedCount,
    });
  }

  // ============ Private Methods ============

  private async fetchDocuments(
    source: DocSource,
    cachedUrls: string[] = [],
  ): Promise<FetchedDocument[]> {
    if (source.type === "llms_txt") {
      return fetchLlmsTxtDocs(source.url, source.options);
    } else if (source.type === "firecrawl") {
      return crawlWebDocs(source.url, {
        ...source.options,
        cachedUrls,
      });
    } else {
      throw new Error(`Unknown source type: ${source.type}`);
    }
  }

  private performDryRun(
    source: DocSource,
    documents: FetchedDocument[],
  ): DryRunResult {
    const CHUNK_SIZE = 1000; // Approximate chunk size in characters

    const docDetails = documents.map((doc) => {
      const contentLength = doc.content.length;
      const estimatedChunks = Math.max(
        1,
        Math.ceil(contentLength / CHUNK_SIZE),
      );
      return {
        title: doc.title,
        url: doc.url,
        path: doc.path,
        contentLength,
        estimatedChunks,
      };
    });

    const totalContentSize = docDetails.reduce(
      (sum, d) => sum + d.contentLength,
      0,
    );
    const estimatedTotalChunks = docDetails.reduce(
      (sum, d) => sum + d.estimatedChunks,
      0,
    );

    this.log.info(`Dry run complete for ${source.name}`, {
      documents: documents.length,
      totalContentSize,
      estimatedChunks: estimatedTotalChunks,
    });

    return {
      source: source.name,
      documentCount: documents.length,
      documents: docDetails,
      totalContentSize,
      estimatedTotalChunks,
    };
  }

  private computeHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  private async insertChunks(
    documentId: number,
    chunks: string[],
    embeddings: number[][],
  ): Promise<void> {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      if (!chunk || !embedding) {
        this.log.warn(`Skipping chunk - missing data`, { chunkIndex: i });
        continue;
      }

      await this.repo.insertChunk({
        documentId,
        chunkIndex: i,
        content: chunk,
        embedding,
        tokenCount: Math.ceil(chunk.length / 4),
      });
    }
  }

  private async updateProgressSafe(
    progressId: number,
    data: {
      processedDocuments: number;
      skippedDocuments: number;
      failedDocuments: number;
      lastProcessedUrl: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    if (progressId < 0) return; // No progress tracking
    try {
      await this.repo.updateProgress(progressId, data);
    } catch {
      // Ignore progress update failures
    }
  }

  private async completeProgressSafe(
    progressId: number,
    status: "completed" | "completed_with_errors",
  ): Promise<void> {
    if (progressId < 0) return;
    try {
      await this.repo.completeProgress(progressId, status);
    } catch {
      // Ignore
    }
  }
}
