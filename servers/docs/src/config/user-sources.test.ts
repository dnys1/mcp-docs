import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { initializeDatabase } from "../db/migrations.js";
import { DocsRepository } from "../db/repository.js";
import type { DocSource } from "../types/index.js";
import { docSourceSchema, SourcesService } from "./user-sources.js";

describe("SourcesService", () => {
  let repo: DocsRepository;
  let service: SourcesService;

  beforeEach(async () => {
    // Create in-memory database for tests
    const db = createClient({ url: ":memory:" });
    repo = new DocsRepository(db);
    service = new SourcesService(repo);

    // Initialize schema
    await initializeDatabase(db);
  });

  afterEach(async () => {
    await repo.close();
  });

  describe("listSources", () => {
    test("returns empty array when no sources exist", async () => {
      const sources = await service.listSources();
      expect(sources).toEqual([]);
    });

    test("returns all sources", async () => {
      await service.saveSource({
        name: "source-1",
        type: "llms_txt",
        url: "https://example1.com/llms.txt",
      });

      await service.saveSource({
        name: "source-2",
        type: "firecrawl",
        url: "https://example2.com/docs",
      });

      const sources = await service.listSources();
      expect(sources).toHaveLength(2);
      expect(sources.map((s) => s.name).sort()).toEqual([
        "source-1",
        "source-2",
      ]);
    });
  });

  describe("saveSource", () => {
    test("saves a new source", async () => {
      const source: DocSource = {
        name: "new-source",
        type: "llms_txt",
        url: "https://example.com/llms.txt",
      };

      await service.saveSource(source);

      const sources = await service.listSources();
      expect(sources).toHaveLength(1);
      expect(sources[0]?.name).toBe("new-source");
      expect(sources[0]?.type).toBe("llms_txt");
      expect(sources[0]?.url).toBe("https://example.com/llms.txt");
    });

    test("updates existing source", async () => {
      await service.saveSource({
        name: "test",
        type: "llms_txt",
        url: "https://old-url.com/llms.txt",
      });

      await service.saveSource({
        name: "test",
        type: "firecrawl",
        url: "https://new-url.com/docs",
      });

      const sources = await service.listSources();
      expect(sources).toHaveLength(1);
      expect(sources[0]?.url).toBe("https://new-url.com/docs");
      expect(sources[0]?.type).toBe("firecrawl");
    });

    test("saves options correctly", async () => {
      await service.saveSource({
        name: "with-options",
        type: "firecrawl",
        url: "https://example.com/docs",
        options: { crawlLimit: 50 },
      });

      const sources = await service.listSources();
      expect(sources[0]?.options?.crawlLimit).toBe(50);
    });

    test("saves description correctly", async () => {
      await service.saveSource({
        name: "with-desc",
        type: "llms_txt",
        url: "https://example.com/llms.txt",
        description: "Test documentation source",
      });

      const sources = await service.listSources();
      expect(sources[0]?.description).toBe("Test documentation source");
    });

    test("throws on invalid source", async () => {
      const invalidSource = {
        name: "",
        type: "invalid",
        url: "not-a-url",
      } as unknown as DocSource;

      await expect(service.saveSource(invalidSource)).rejects.toThrow();
    });
  });

  describe("removeSource", () => {
    test("removes existing source", async () => {
      await service.saveSource({
        name: "to-remove",
        type: "llms_txt",
        url: "https://example.com/llms.txt",
      });

      const result = await service.removeSource("to-remove");

      expect(result).toBe(true);
      const sources = await service.listSources();
      expect(sources).toHaveLength(0);
    });

    test("returns false when source not found", async () => {
      const result = await service.removeSource("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("getAllSources", () => {
    test("returns empty array when no sources", async () => {
      const sources = await service.getAllSources();
      expect(sources).toEqual([]);
    });

    test("returns all sources", async () => {
      await service.saveSource({
        name: "source-a",
        type: "llms_txt",
        url: "https://a.com/llms.txt",
      });

      await service.saveSource({
        name: "source-b",
        type: "firecrawl",
        url: "https://b.com/docs",
      });

      const sources = await service.getAllSources();
      expect(sources).toHaveLength(2);
    });
  });

  describe("sourceExists", () => {
    test("returns true for existing source", async () => {
      await service.saveSource({
        name: "existing",
        type: "llms_txt",
        url: "https://existing.com",
      });

      const exists = await service.sourceExists("existing");
      expect(exists).toBe(true);
    });

    test("returns false for nonexistent source", async () => {
      const exists = await service.sourceExists("nonexistent");
      expect(exists).toBe(false);
    });
  });
});

describe("docSourceSchema", () => {
  test("validates correct source", () => {
    const valid = {
      name: "test",
      type: "llms_txt",
      url: "https://example.com",
    };
    expect(() => docSourceSchema.parse(valid)).not.toThrow();
  });

  test("rejects invalid type", () => {
    const invalid = {
      name: "test",
      type: "invalid",
      url: "https://example.com",
    };
    expect(() => docSourceSchema.parse(invalid)).toThrow();
  });

  test("rejects invalid url", () => {
    const invalid = {
      name: "test",
      type: "llms_txt",
      url: "not-a-url",
    };
    expect(() => docSourceSchema.parse(invalid)).toThrow();
  });

  test("accepts valid options", () => {
    const valid = {
      name: "test",
      type: "firecrawl",
      url: "https://example.com",
      options: { crawlLimit: 100, includeOptional: true },
    };
    expect(() => docSourceSchema.parse(valid)).not.toThrow();
  });

  test("accepts description", () => {
    const valid = {
      name: "test",
      type: "llms_txt",
      url: "https://example.com",
      description: "A test source",
    };
    expect(() => docSourceSchema.parse(valid)).not.toThrow();
  });
});
