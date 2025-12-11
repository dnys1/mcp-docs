/**
 * Database client factory for MCP servers using libsql.
 *
 * Creates XDG-compliant database paths: ~/.local/share/{appName}/{dbFileName}
 *
 * @example
 * ```ts
 * import { createDbClient } from "@mcp/shared/db-client";
 *
 * // Creates ~/.local/share/mcp-todos/todos.db
 * const client = createDbClient({
 *   appName: "mcp-todos",
 *   dbFileName: "todos.db",
 * });
 *
 * // Or use custom URL
 * const testClient = createDbClient(
 *   { appName: "mcp-todos", dbFileName: "todos.db" },
 *   "file::memory:"
 * );
 * ```
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";

export type DbClientOptions = {
  /** Application name, used for the directory (e.g., "mcp-todos") */
  appName: string;
  /** Database filename (e.g., "todos.db") */
  dbFileName: string;
};

function getDefaultDbPath(options: DbClientOptions): string {
  const xdgDataHome =
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  const dbDir = join(xdgDataHome, options.appName);

  mkdirSync(dbDir, { recursive: true });

  return join(dbDir, options.dbFileName);
}

/**
 * Creates a new database client.
 * Each call returns a new client instance - caller is responsible for closing it.
 *
 * @param options - Configuration for the default database path
 * @param url - Optional database URL (overrides default path). Also checks DATABASE_URL env var.
 */
export function createDbClient(options: DbClientOptions, url?: string): Client {
  const databaseUrl =
    url || process.env.DATABASE_URL || `file:${getDefaultDbPath(options)}`;

  return createClient({
    url: databaseUrl,
  });
}
