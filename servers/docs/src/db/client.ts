import { Database } from "@mcp/shared/db";

const APP_NAME = "mcp-docs";
const DB_FILE_NAME = "docs.db";

/**
 * Database for the docs MCP server.
 * Stores documentation index in ~/.local/share/mcp-docs/docs.db
 */
export class DocsDatabase extends Database {
  constructor(url?: string) {
    super({ appName: APP_NAME, dbFileName: DB_FILE_NAME }, url);
  }
}
