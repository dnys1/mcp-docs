/**
 * @mcp/shared - Shared utilities for MCP servers
 *
 * @example
 * ```ts
 * // Import specific modules
 * import { logger } from "@mcp/shared/logger";
 * import { createDbClient } from "@mcp/shared/db-client";
 * import { runConfigureCommand } from "@mcp/shared/configure";
 * import { prompt, confirm } from "@mcp/shared/cli";
 *
 * // Or import from main entry
 * import { logger, createDbClient } from "@mcp/shared";
 * ```
 */

export { logger, type Logger, type LogContext, type LogLevel } from "./logger.ts";
export { createDbClient, type DbClientOptions } from "./db-client.ts";
