import type { Client } from "@libsql/client";
import { SCHEMA } from "./schema.js";

export async function initializeDatabase(db: Client): Promise<void> {
  console.log("Initializing database schema...");

  try {
    // Enable WAL mode for better concurrent access
    // This prevents SQLITE_BUSY errors when multiple processes access the database
    await db.execute("PRAGMA journal_mode=WAL");
    await db.execute("PRAGMA busy_timeout=5000");

    await db.execute(SCHEMA.sources);
    console.log("  ✓ Created sources table");

    await db.execute(SCHEMA.documents);
    console.log("  ✓ Created documents table");

    await db.execute(SCHEMA.chunks);
    console.log("  ✓ Created chunks table");

    await db.execute(SCHEMA.chunksIndex);
    console.log("  ✓ Created chunks embedding index");

    await db.execute(SCHEMA.chunksFts);
    await db.execute(SCHEMA.chunksFtsInsertTrigger);
    await db.execute(SCHEMA.chunksFtsDeleteTrigger);
    await db.execute(SCHEMA.chunksFtsUpdateTrigger);
    console.log("  ✓ Created FTS5 search index");

    await db.execute(SCHEMA.ingestionProgress);
    console.log("  ✓ Created ingestion_progress table");

    // Run migrations for existing databases
    await runMigrations(db);

    console.log("Database schema initialized successfully");
  } catch (error) {
    console.error("Error initializing database schema:", error);
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
      console.log(`  ✓ Added ${column} column to ${table}`);
    }
  } catch {
    // Ignore errors - column might already exist or table doesn't exist yet
  }
}
