import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { EmbeddingModel } from "ai";
import { EmbeddingCache } from "../cache/embedding-cache.js";
import {
  createMockEmbedding,
  seedSources,
  TestFixture,
} from "../test-utils/db.js";
import { ToolService } from "./tool-service.js";

// Mock the ai module's embed function
mock.module("ai", () => ({
  embed: async ({ value }: { value: string }) => ({
    embedding: createMockEmbedding(value),
  }),
}));

// Mock embedding model for testing (the embed mock ignores the model)
const mockEmbeddingModel = {} as EmbeddingModel<string>;

describe("ToolService.searchSourceDocs", () => {
  let fixture: TestFixture;
  let service: ToolService;
  let embeddingCache: EmbeddingCache;

  beforeEach(async () => {
    fixture = await TestFixture.createSeeded();
    embeddingCache = new EmbeddingCache();
    service = new ToolService(fixture.repo, embeddingCache, mockEmbeddingModel);
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test("performs hybrid search on a source", async () => {
    const result = await service.searchSourceDocs("test-docs", {
      query: "how to authenticate",
      limit: 5,
    });

    expect(result.isError).toBeUndefined();
    // Should return markdown-formatted results
    expect(result.content[0]?.type).toBe("text");
  });

  test("returns no results message when nothing found", async () => {
    const result = await service.searchSourceDocs("another-source", {
      query: "xyznonexistentquery123",
      limit: 5,
    });

    expect(result.content[0]?.text).toContain("No results found");
  });

  test("respects limit parameter", async () => {
    const result = await service.searchSourceDocs("test-docs", {
      query: "documentation",
      limit: 1,
    });

    expect(result.isError).toBeUndefined();
    // Should only have 1 result section
    const text = result.content[0]?.text ?? "";
    const resultCount = (text.match(/^## /gm) || []).length;
    expect(resultCount).toBeLessThanOrEqual(1);
  });

  test("uses default limit of 5", async () => {
    const result = await service.searchSourceDocs("test-docs", {
      query: "documentation",
    });

    expect(result.isError).toBeUndefined();
    // Should have at most 5 results
    const text = result.content[0]?.text ?? "";
    const resultCount = (text.match(/^## /gm) || []).length;
    expect(resultCount).toBeLessThanOrEqual(5);
  });

  test("includes title and URL in results", async () => {
    const result = await service.searchSourceDocs("test-docs", {
      query: "getting started",
      limit: 3,
    });

    const text = result.content[0]?.text ?? "";
    if (text.includes("##")) {
      // Results format: ## Title\nURL\n\nContent
      expect(text).toMatch(/## .+\nhttps?:\/\//);
      expect(text).toContain("https://");
    }
  });

  test("handles special characters in search query", async () => {
    const result = await service.searchSourceDocs("test-docs", {
      query: "test <script>alert('xss')</script>",
      limit: 5,
    });

    // Should not throw, just return no results or safe results
    expect(result.content[0]?.type).toBe("text");
  });
});

describe("ToolService Edge Cases", () => {
  let fixture: TestFixture;
  let service: ToolService;
  let embeddingCache: EmbeddingCache;

  beforeEach(async () => {
    fixture = await TestFixture.create();
    embeddingCache = new EmbeddingCache();
    service = new ToolService(fixture.repo, embeddingCache, mockEmbeddingModel);
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test("handles source with no documents", async () => {
    await seedSources(fixture.repo);

    const result = await service.searchSourceDocs("test-docs", {
      query: "anything",
    });

    expect(result.content[0]?.text).toContain("No results found");
  });

  test("handles nonexistent source gracefully", async () => {
    const result = await service.searchSourceDocs("nonexistent-source", {
      query: "test query",
    });

    expect(result.content[0]?.text).toContain("No results found");
  });
});
