import type { Client } from "@libsql/client";
import { logger } from "@mcp/shared/logger";
import { SCHEMA } from "./schema.js";

export class DocsMigrationService {
  private readonly log = logger.child({ module: "DocsMigrationService" });

  constructor(private readonly db: Client) {}

  async initialize(): Promise<void> {
    this.log.debug("Initializing database schema");

    try {
      // Enable WAL mode for better concurrent access
      // This prevents SQLITE_BUSY errors when multiple processes access the database
      await this.db.execute("PRAGMA journal_mode=WAL");
      await this.db.execute("PRAGMA busy_timeout=5000");

      await this.db.execute(SCHEMA.sources);
      await this.db.execute(SCHEMA.documents);
      await this.db.execute(SCHEMA.chunks);
      await this.db.execute(SCHEMA.chunksIndex);
      await this.db.execute(SCHEMA.chunksFts);
      await this.db.execute(SCHEMA.chunksFtsInsertTrigger);
      await this.db.execute(SCHEMA.chunksFtsDeleteTrigger);
      await this.db.execute(SCHEMA.chunksFtsUpdateTrigger);
      await this.db.execute(SCHEMA.ingestionProgress);

      // Run migrations for existing databases
      await this.runMigrations();

      this.log.debug("Database schema initialized");
    } catch (error) {
      this.log.error("Error initializing database schema", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async runMigrations(): Promise<void> {
    // Migration: Add options and is_user_defined columns to sources table
    await this.addColumnIfNotExists("sources", "options", "TEXT");
    await this.addColumnIfNotExists(
      "sources",
      "is_user_defined",
      "INTEGER DEFAULT 0",
    );
    // Migration: Add group_name and description columns for source grouping
    await this.addColumnIfNotExists("sources", "group_name", "TEXT");
    await this.addColumnIfNotExists("sources", "description", "TEXT");
  }

  private async addColumnIfNotExists(
    table: string,
    column: string,
    definition: string,
  ): Promise<void> {
    try {
      // Check if column exists by querying table info
      const result = await this.db.execute(`PRAGMA table_info(${table})`);
      const columnExists = result.rows.some((row) => row.name === column);

      if (!columnExists) {
        await this.db.execute(
          `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
        );
        this.log.debug("Added column", { table, column });
      }
    } catch {
      // Ignore errors - column might already exist or table doesn't exist yet
    }
  }
}
