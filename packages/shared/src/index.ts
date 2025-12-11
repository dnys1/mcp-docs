/**
 * @mcp/shared - Shared utilities for MCP servers
 *
 * @example
 * ```ts
 * // Import specific modules
 * import { logger } from "@mcp/shared/logger";
 * import { Database } from "@mcp/shared/db";
 * import { runConfigureCommand } from "@mcp/shared/configure";
 * import { prompt, confirm } from "@mcp/shared/cli";
 *
 * // Or import from main entry
 * import { logger, Database } from "@mcp/shared";
 * ```
 */

export { type Client, Database, type DatabaseOptions } from "./db.ts";
export {
  type LogContext,
  type Logger,
  type LogLevel,
  logger,
} from "./logger.ts";
