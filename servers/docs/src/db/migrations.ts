import type { Client } from "@libsql/client";
import { logger } from "@mcp/shared/logger";
import { SCHEMA } from "./schema.js";

const log = logger.child({ module: "migrations" });

export async function initializeDatabase(db: Client): Promise<void> {
  log.debug("Initializing database schema");

  try {
    // Enable WAL mode for better concurrent access
    // This prevents SQLITE_BUSY errors when multiple processes access the database
    await db.execute("PRAGMA journal_mode=WAL");
    await db.execute("PRAGMA busy_timeout=5000");

    await db.execute(SCHEMA.sources);
    await db.execute(SCHEMA.documents);
    await db.execute(SCHEMA.chunks);
    await db.execute(SCHEMA.chunksIndex);
    await db.execute(SCHEMA.chunksFts);
    await db.execute(SCHEMA.chunksFtsInsertTrigger);
    await db.execute(SCHEMA.chunksFtsDeleteTrigger);
    await db.execute(SCHEMA.chunksFtsUpdateTrigger);
    await db.execute(SCHEMA.ingestionProgress);

    // Run migrations for existing databases
    await runMigrations(db);

    log.debug("Database schema initialized");
  } catch (error) {
    log.error("Error initializing database schema", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function runMigrations(db: Client): Promise<void> {
  // Migration: Add options and is_user_defined columns to sources table
  await addColumnIfNotExists(db, "sources", "options", "TEXT");
  await addColumnIfNotExists(
    db,
    "sources",
    "is_user_defined",
    "INTEGER DEFAULT 0",
  );
  // Migration: Add group_name and description columns for source grouping
  await addColumnIfNotExists(db, "sources", "group_name", "TEXT");
  await addColumnIfNotExists(db, "sources", "description", "TEXT");
}

async function addColumnIfNotExists(
  db: Client,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  try {
    // Check if column exists by querying table info
    const result = await db.execute(`PRAGMA table_info(${table})`);
    const columnExists = result.rows.some((row) => row.name === column);

    if (!columnExists) {
      await db.execute(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
      );
      log.debug("Added column", { table, column });
    }
  } catch {
    // Ignore errors - column might already exist or table doesn't exist yet
  }
}
