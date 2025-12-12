/**
 * Test utilities for database operations.
 * Provides helpers for setting up test fixtures with in-memory databases.
 */

import { type Client, createClient } from "@libsql/client";
import { DocsMigrationService } from "../db/migrations.js";
import { DocsRepository } from "../db/repository.js";

/**
 * Test fixture for in-memory database testing.
 */
export class TestFixture {
  constructor(
    readonly db: Client,
    readonly repo: DocsRepository,
  ) {}

  /**
   * Create a test fixture with an in-memory database.
   */
  static async create(): Promise<TestFixture> {
    const db = createClient({ url: ":memory:" });
    const repo = new DocsRepository(db);

    // Suppress console output during tests
    const originalLog = console.log;
    console.log = () => {};
    const migrationService = new DocsMigrationService(db);
    await migrationService.initialize();
    console.log = originalLog;

    return new TestFixture(db, repo);
  }

  /**
   * Create a fully seeded test database with sources, documents, and chunks.
   */
  static async createSeeded(): Promise<TestFixture> {
    const fixture = await TestFixture.create();

    const [sourceId] = await seedSources(fixture.repo);
    if (!sourceId) throw new Error("Failed to seed sources");

    const docIds = await seedDocuments(fixture.repo, sourceId);

    // Seed chunks for each document
    const contents = [
      "Welcome to the documentation. This guide will help you get up and running quickly with our platform.",
      "The API provides RESTful endpoints for managing resources. Use standard HTTP methods.",
      "Authentication requires an API key. Include it in the Authorization header.",
    ];

    for (let i = 0; i < docIds.length; i++) {
      const docId = docIds[i];
      const content = contents[i];
      if (docId && content) {
        await seedChunks(fixture.repo, docId, content);
      }
    }

    return fixture;
  }

  async cleanup(): Promise<void> {
    await this.repo.close();
  }
}

/**
 * Seed the database with sample sources.
 */
export async function seedSources(repo: DocsRepository): Promise<number[]> {
  const sourceIds: number[] = [];

  sourceIds.push(
    await repo.upsertSource({
      name: "test-docs",
      type: "llms_txt",
      baseUrl: "https://test.com/llms.txt",
    }),
  );

  sourceIds.push(
    await repo.upsertSource({
      name: "another-source",
      type: "firecrawl",
      baseUrl: "https://another.com/docs",
    }),
  );

  return sourceIds;
}

/**
 * Seed the database with sample documents.
 */
export async function seedDocuments(
  repo: DocsRepository,
  sourceId: number,
): Promise<number[]> {
  const docIds: number[] = [];

  docIds.push(
    await repo.upsertDocument({
      sourceId,
      url: "https://test.com/docs/getting-started",
      title: "Getting Started",
      path: "getting-started",
      content:
        "# Getting Started\n\nWelcome to the documentation. This guide will help you get up and running quickly.",
      contentHash: "hash1",
      metadata: JSON.stringify({ section: "Guide" }),
    }),
  );

  docIds.push(
    await repo.upsertDocument({
      sourceId,
      url: "https://test.com/docs/api/overview",
      title: "API Overview",
      path: "api/overview",
      content:
        "# API Overview\n\nThis document covers the main API endpoints and how to use them.",
      contentHash: "hash2",
      metadata: JSON.stringify({ section: "API" }),
    }),
  );

  docIds.push(
    await repo.upsertDocument({
      sourceId,
      url: "https://test.com/docs/api/authentication",
      title: "Authentication",
      path: "api/authentication",
      content:
        "# Authentication\n\nLearn how to authenticate with the API using tokens and API keys.",
      contentHash: "hash3",
      metadata: JSON.stringify({ section: "API" }),
    }),
  );

  return docIds;
}

/**
 * Seed chunks with mock embeddings.
 * Uses simple deterministic embeddings based on content for testing.
 */
export async function seedChunks(
  repo: DocsRepository,
  documentId: number,
  content: string,
): Promise<void> {
  // Create a simple mock embedding (1536 dimensions for OpenAI compatibility)
  const mockEmbedding = createMockEmbedding(content);

  await repo.insertChunk({
    documentId,
    chunkIndex: 0,
    content,
    embedding: mockEmbedding,
    tokenCount: Math.ceil(content.length / 4),
  });
}

/**
 * Create a deterministic mock embedding based on content.
 * This creates reproducible embeddings for testing.
 */
export function createMockEmbedding(content: string): number[] {
  const dimensions = 1536;
  const embedding: number[] = new Array(dimensions).fill(0);

  // Simple hash-based embedding for deterministic results
  for (let i = 0; i < content.length; i++) {
    const charCode = content.charCodeAt(i);
    const idx = (i * 31 + charCode) % dimensions;
    embedding[idx] = (embedding[idx] ?? 0) + charCode / 1000;
  }

  // Normalize
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0),
  );
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] = (embedding[i] ?? 0) / magnitude;
    }
  }

  return embedding;
}
