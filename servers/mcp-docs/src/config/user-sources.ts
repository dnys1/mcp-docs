import { z } from "zod";
import type { DocsRepository } from "../db/repository.js";
import type { DocSource } from "../types/index.js";
import { logger } from "../utils/logger.js";

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

      if (row.options) {
        try {
          const parsed = JSON.parse(row.options);
          // Extract description from options if present
          if (parsed.description) {
            source.description = parsed.description;
            delete parsed.description;
          }
          // Only set options if there are remaining fields
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

    // Combine description and options into a single JSON field
    const optionsWithDescription = {
      ...source.options,
      ...(source.description ? { description: source.description } : {}),
    };
    const hasOptions = Object.keys(optionsWithDescription).length > 0;

    await this.repo.upsertSource({
      name: source.name,
      type: source.type,
      baseUrl: source.url,
      options: hasOptions ? JSON.stringify(optionsWithDescription) : null,
    });

    log.info("Saved source", { name: source.name });
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
}

// Backwards compatibility aliases
export { SourcesService as UserSourcesService };
export { docSourceSchema as userSourceSchema };
