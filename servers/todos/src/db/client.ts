import { Database } from "@mcp/shared/db";

const APP_NAME = "mcp-todos";
const DB_FILE_NAME = "todos.db";

/**
 * Database for the todos MCP server.
 * Stores todos in ~/.local/share/mcp-todos/todos.db
 */
export class TodosDatabase extends Database {
  constructor(url?: string) {
    super({ appName: APP_NAME, dbFileName: DB_FILE_NAME }, url);
  }
}
