import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";

function getDefaultDbPath(): string {
  const xdgDataHome =
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  const dbDir = join(xdgDataHome, "mcp-docs");

  mkdirSync(dbDir, { recursive: true });

  return join(dbDir, "docs.db");
}

/**
 * Creates a new database client.
 * Each call returns a new client instance - caller is responsible for closing it.
 */
export function createDbClient(url?: string): Client {
  const databaseUrl =
    url || process.env.DATABASE_URL || `file:${getDefaultDbPath()}`;

  return createClient({
    url: databaseUrl,
  });
}

// ============ Legacy singleton support (for backwards compatibility) ============

let _legacyClient: Client | null = null;

/**
 * @deprecated Use createDbClient() instead. This singleton pattern will be removed.
 */
export function getDbClient(): Client {
  if (_legacyClient) {
    return _legacyClient;
  }

  _legacyClient = createDbClient();
  return _legacyClient;
}

/**
 * @deprecated Use repository.close() instead.
 */
export async function closeDbClient(): Promise<void> {
  if (_legacyClient) {
    await _legacyClient.close();
    _legacyClient = null;
  }
}
