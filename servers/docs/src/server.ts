import { logger } from "@mcp/shared/logger";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SourcesService } from "./config/user-sources.js";
import { createDbClient } from "./db/client.js";
import { initializeDatabase } from "./db/migrations.js";
import { DocsRepository } from "./db/repository.js";
import { generateGroupDescription } from "./services/description-service.js";
import { ToolService } from "./services/tool-service.js";
import type { DocSource } from "./types/index.js";

/**
 * Register a search tool for a standalone documentation source.
 */
function registerSourceTool(
  server: McpServer,
  toolService: ToolService,
  source: DocSource,
): void {
  const toolName = `search_${source.name}_docs`;
  const description =
    source.description || `Search ${source.name} documentation.`;

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

/**
 * Register a search tool for a group of documentation sources.
 */
async function registerGroupTool(
  server: McpServer,
  toolService: ToolService,
  groupName: string,
  sources: DocSource[],
): Promise<void> {
  const toolName = `search_${groupName}_docs`;
  const sourceNames = sources.map((s) => s.name);
  const sourceDescriptions = sources
    .map((s) => s.description)
    .filter((d): d is string => !!d);

  // Generate description for the group based on source descriptions
  const description = await generateGroupDescription(
    groupName,
    sourceDescriptions,
  );

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
      return toolService.searchGroupDocs(groupName, {
        query: args.query as string,
        sources: sourceNames,
        limit: args.limit as number | undefined,
      });
    },
  );

  logger.debug("Registered group tool", {
    tool: toolName,
    sources: sourceNames,
  });
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

  // Organize sources by group
  const groups = new Map<string, DocSource[]>();
  const standalone: DocSource[] = [];

  for (const source of sources) {
    if (source.groupName) {
      const group = groups.get(source.groupName) || [];
      group.push(source);
      groups.set(source.groupName, group);
    } else {
      standalone.push(source);
    }
  }

  // Create MCP server
  const server = new McpServer({
    name: "mcp-docs",
    version: "1.0.0",
  });

  // Register tools for groups
  for (const [groupName, groupSources] of groups.entries()) {
    await registerGroupTool(server, toolService, groupName, groupSources);
  }

  // Register tools for standalone sources
  for (const source of standalone) {
    registerSourceTool(server, toolService, source);
  }

  const toolCount = groups.size + standalone.length;
  const groupNames = Array.from(groups.keys());
  const standaloneNames = standalone.map((s) => s.name);

  logger.info("Registered documentation tools", {
    tools: toolCount,
    groups: groupNames,
    standalone: standaloneNames,
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
