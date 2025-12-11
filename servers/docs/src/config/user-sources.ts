import { logger } from "@mcp/shared/logger";
import { z } from "zod";
import type { DocsRepository } from "../db/repository.js";
import type { DocSource } from "../types/index.js";

const log = logger.child({ module: "sources" });

// Schema for validating sources
const sourceOptionsSchema = z.object({
  crawlLimit: z.number().positive().optional(),
  includeOptional: z.boolean().optional(),
  includePaths: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
});

export const docSourceSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["llms_txt", "firecrawl"]),
  url: z.string().url(),
  description: z.string().optional(),
  groupName: z.string().optional(),
  options: sourceOptionsSchema.optional(),
});

export type ValidatedDocSource = z.infer<typeof docSourceSchema>;

/**
 * Service for managing documentation sources.
 * All sources are stored in the database.
 */
export class SourcesService {
  constructor(private repo: DocsRepository) {}

  /**
   * Get all documentation sources.
   */
  async getAllSources(): Promise<DocSource[]> {
    return this.listSources();
  }

  /**
   * List all sources from the database.
   */
  async listSources(): Promise<DocSource[]> {
    const rows = await this.repo.listSourcesWithOptions();

    return rows.map((row) => {
      const source: DocSource = {
        name: row.name,
        type: row.type as "llms_txt" | "firecrawl",
        url: row.base_url,
      };

      if (row.description) {
        source.description = row.description;
      }

      if (row.group_name) {
        source.groupName = row.group_name;
      }

      if (row.options) {
        try {
          const parsed = JSON.parse(row.options);
          // Only set options if there are fields
          if (Object.keys(parsed).length > 0) {
            source.options = parsed;
          }
        } catch {
          log.warn("Failed to parse source options", { name: row.name });
        }
      }

      return source;
    });
  }

  /**
   * Add or update a source.
   */
  async saveSource(source: DocSource): Promise<void> {
    // Validate the source
    docSourceSchema.parse(source);

    const hasOptions = source.options && Object.keys(source.options).length > 0;

    await this.repo.upsertSource({
      name: source.name,
      type: source.type,
      baseUrl: source.url,
      options: hasOptions ? JSON.stringify(source.options) : null,
      groupName: source.groupName ?? null,
      description: source.description ?? null,
    });

    log.info("Saved source", {
      name: source.name,
      ...(source.groupName && { groupName: source.groupName }),
    });
  }

  /**
   * Remove a source and all its data.
   */
  async removeSource(name: string): Promise<boolean> {
    const source = await this.repo.getSourceByName(name);
    if (!source) {
      return false;
    }

    const removed = await this.repo.removeSource(name);
    if (removed) {
      log.info("Removed source", { name });
    }
    return removed;
  }

  /**
   * Check if a source exists.
   */
  async sourceExists(name: string): Promise<boolean> {
    const source = await this.repo.getSourceByName(name);
    return source !== null;
  }

  /**
   * Check if a name refers to a group.
   */
  async isGroup(name: string): Promise<boolean> {
    return this.repo.isGroup(name);
  }

  /**
   * Get all sources in a group.
   */
  async getSourcesInGroup(groupName: string): Promise<DocSource[]> {
    const rows = await this.repo.getSourcesByGroup(groupName);

    return rows.map((row) => {
      const source: DocSource = {
        name: row.name,
        type: row.type as "llms_txt" | "firecrawl",
        url: row.base_url,
      };

      if (row.description) {
        source.description = row.description;
      }

      if (row.group_name) {
        source.groupName = row.group_name;
      }

      if (row.options) {
        try {
          const parsed = JSON.parse(row.options);
          if (Object.keys(parsed).length > 0) {
            source.options = parsed;
          }
        } catch {
          // ignore
        }
      }

      return source;
    });
  }

  /**
   * Remove all sources in a group.
   */
  async removeGroup(groupName: string): Promise<string[]> {
    const removedNames = await this.repo.removeGroup(groupName);
    if (removedNames.length > 0) {
      log.info("Removed group", { groupName, sources: removedNames });
    }
    return removedNames;
  }

  /**
   * Get distinct group names.
   */
  async listGroups(): Promise<string[]> {
    return this.repo.listGroups();
  }
}

// Backwards compatibility aliases
export { SourcesService as UserSourcesService };
export { docSourceSchema as userSourceSchema };
