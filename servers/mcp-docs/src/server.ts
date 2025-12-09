import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SourcesService } from "./config/user-sources.js";
import { createDbClient } from "./db/client.js";
import { initializeDatabase } from "./db/migrations.js";
import { DocsRepository } from "./db/repository.js";
import { ToolService } from "./services/tool-service.js";
import type { DocSource } from "./types/index.js";
import { logger } from "./utils/logger.js";

/**
 * Generate a default description for a source if none provided.
 */
function getSourceDescription(source: DocSource): string {
  if (source.description) {
    return source.description;
  }
  // Generate a generic description
  return `Search ${source.name} documentation.`;
}

/**
 * Register a search tool for a documentation source.
 */
function registerSourceTool(
  server: McpServer,
  toolService: ToolService,
  source: DocSource,
): void {
  const toolName = `search_${source.name}_docs`;
  const description = getSourceDescription(source);

  server.registerTool(
    toolName,
    {
      description,
      inputSchema: {
        query: z.string().describe("Search query"),
        limit: z
          .number()
          .optional()
          .default(5)
          .describe("Number of results to return (default: 5)"),
      },
    },
    async (args) => {
      return toolService.searchSourceDocs(source.name, {
        query: args.query as string,
        limit: args.limit as number | undefined,
      });
    },
  );

  logger.debug("Registered tool", { tool: toolName });
}

export async function startServer() {
  // Initialize dependencies
  const db = createDbClient();
  await initializeDatabase(db);

  const repo = new DocsRepository(db);
  const toolService = new ToolService(repo);
  const sourcesService = new SourcesService(repo);

  // Load all sources from database
  const sources = await sourcesService.getAllSources();

  // Create MCP server
  const server = new McpServer({
    name: "mcp-docs",
    version: "1.0.0",
  });

  // Register a search tool for each source
  for (const source of sources) {
    registerSourceTool(server, toolService, source);
  }

  logger.info("Registered documentation tools", {
    count: sources.length,
    sources: sources.map((s) => s.name),
  });

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await repo.close();
      logger.info("Database connection closed");
    } catch (error) {
      logger.error("Error during shutdown", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP Docs Server running on stdio");
}
