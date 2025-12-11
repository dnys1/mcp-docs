/**
 * Database wrapper for MCP servers using libsql.
 *
 * Creates XDG-compliant database paths: ~/.local/share/{appName}/{dbFileName}
 *
 * @example
 * ```ts
 * import { Database } from "@mcp/shared/db";
 *
 * // Creates ~/.local/share/mcp-todos/todos.db
 * const db = new Database({
 *   appName: "mcp-todos",
 *   dbFileName: "todos.db",
 * });
 *
 * // Use the underlying client for SQL operations
 * const result = await db.client.execute("SELECT * FROM todos");
 *
 * // Clean up
 * db.close();
 * ```
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";

export type { Client } from "@libsql/client";

export type DatabaseOptions = {
  /** Application name, used for the directory (e.g., "mcp-todos") */
  appName: string;
  /** Database filename (e.g., "todos.db") */
  dbFileName: string;
};

function getDefaultDbPath(options: DatabaseOptions): string {
  const xdgDataHome =
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  const dbDir = join(xdgDataHome, options.appName);

  mkdirSync(dbDir, { recursive: true });

  return join(dbDir, options.dbFileName);
}

/**
 * Database wrapper for libsql.
 * Each instance manages its own connection - caller is responsible for closing it.
 */
export class Database {
  /** The underlying libsql client for SQL operations */
  readonly client: Client;

  /**
   * Creates a new database connection.
   *
   * @param options - Configuration for the default database path
   * @param url - Optional database URL (overrides default path). Also checks DATABASE_URL env var.
   */
  constructor(options: DatabaseOptions, url?: string) {
    const databaseUrl =
      url || process.env.DATABASE_URL || `file:${getDefaultDbPath(options)}`;

    this.client = createClient({
      url: databaseUrl,
    });
  }

  /** Close the database connection */
  close(): void {
    this.client.close();
  }
}
