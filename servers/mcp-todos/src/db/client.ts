import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";

function getDefaultDbPath(): string {
  const dataDir = join(homedir(), ".local", "share", "mcp-todos");

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  return join(dataDir, "todos.db");
}

export function createDbClient(url?: string): Client {
  const databaseUrl =
    url || process.env.DATABASE_URL || `file:${getDefaultDbPath()}`;

  return createClient({ url: databaseUrl });
}
