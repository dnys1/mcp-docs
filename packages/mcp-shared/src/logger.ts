/**
 * Structured logger with support for log levels and JSON/text output.
 *
 * Configuration via environment variables:
 * - LOG_LEVEL: "debug" | "info" | "warn" | "error" (default: "info")
 * - LOG_FORMAT: "json" | "text" (default: "text")
 *
 * All output goes to stderr to avoid interfering with MCP stdio transport.
 *
 * @example
 * ```ts
 * import { logger } from "@mcp/shared/logger";
 *
 * logger.info("Processing document", { title: "foo", chunks: 5 });
 * logger.error("Failed to ingest", { error: err.message });
 *
 * // Child logger with preset context
 * const serviceLogger = logger.child({ service: "TodoService" });
 * serviceLogger.info("Created todo", { id: "abc123" });
 * ```
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = {
  [key: string]: unknown;
};

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
};

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  if (level && level in LOG_LEVELS) {
    return level as LogLevel;
  }
  return "info";
}

function getLogFormat(): "json" | "text" {
  const format = process.env.LOG_FORMAT?.toLowerCase();
  if (format === "json") {
    return "json";
  }
  return "text";
}

function shouldLog(level: LogLevel): boolean {
  const currentLevel = getLogLevel();
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatText(entry: LogEntry): string {
  const levelColors: Record<LogLevel, string> = {
    debug: "\x1b[90m", // gray
    info: "\x1b[36m", // cyan
    warn: "\x1b[33m", // yellow
    error: "\x1b[31m", // red
  };
  const reset = "\x1b[0m";
  const color = levelColors[entry.level];
  const levelStr = entry.level.toUpperCase().padEnd(5);

  let msg = `${color}[${levelStr}]${reset} ${entry.message}`;

  if (entry.context && Object.keys(entry.context).length > 0) {
    const contextStr = Object.entries(entry.context)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(" ");
    msg += ` ${color}${contextStr}${reset}`;
  }

  return msg;
}

function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  };

  const format = getLogFormat();
  const output = format === "json" ? formatJson(entry) : formatText(entry);

  // Always write to stderr to avoid interfering with MCP stdio transport
  // MCP uses stdout exclusively for JSON-RPC messages
  console.error(output);
}

export type Logger = {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  child: (baseContext: LogContext) => Omit<Logger, "child">;
};

export const logger: Logger = {
  debug: (message: string, context?: LogContext) =>
    log("debug", message, context),
  info: (message: string, context?: LogContext) =>
    log("info", message, context),
  warn: (message: string, context?: LogContext) =>
    log("warn", message, context),
  error: (message: string, context?: LogContext) =>
    log("error", message, context),

  /**
   * Create a child logger with preset context fields.
   * Useful for adding consistent context like service name or request ID.
   */
  child: (baseContext: LogContext) => ({
    debug: (message: string, context?: LogContext) =>
      log("debug", message, { ...baseContext, ...context }),
    info: (message: string, context?: LogContext) =>
      log("info", message, { ...baseContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      log("warn", message, { ...baseContext, ...context }),
    error: (message: string, context?: LogContext) =>
      log("error", message, { ...baseContext, ...context }),
  }),
};
