import { logger } from "@mcp/shared/logger";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createDbClient } from "./db/client.js";
import { initializeDatabase } from "./db/migrations.js";
import { TodoRepository } from "./db/repository.js";
import { ProjectService } from "./services/project-service.js";
import { TodoService } from "./services/todo-service.js";
import { ToolService } from "./services/tool-service.js";

export async function startServer() {
  // Initialize dependencies
  const db = createDbClient();
  await initializeDatabase(db);

  const repo = new TodoRepository(db);
  const projectService = new ProjectService(repo);
  const todoService = new TodoService(repo);
  const toolService = new ToolService(projectService, todoService);

  // Get working directory from environment or fallback to process.cwd()
  const getCwd = () => process.env.MCP_WORKING_DIR || process.cwd();

  // Create MCP server
  const server = new McpServer({
    name: "mcp-todos",
    version: "1.0.0",
  });

  // === Todo Tools ===

  server.registerTool(
    "todo_add",
    {
      description: "Add a new todo to the current project",
      inputSchema: {
        title: z.string().describe("Title of the todo"),
        description: z.string().optional().describe("Description of the todo"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .default("normal")
          .describe("Priority level"),
      },
    },
    async (args) => {
      return toolService.todoAdd(getCwd(), {
        title: args.title as string,
        description: args.description as string | undefined,
        priority: args.priority as "low" | "normal" | "high" | "urgent",
      });
    },
  );

  server.registerTool(
    "todo_list",
    {
      description:
        "List todos. Defaults to current project unless --all is specified",
      inputSchema: {
        project: z.string().optional().describe("Filter by project name"),
        status: z
          .enum(["open", "in_progress", "done"])
          .optional()
          .describe("Filter by status"),
        all: z.boolean().optional().describe("Show todos from all projects"),
        limit: z.number().optional().describe("Limit number of results"),
      },
    },
    async (args) => {
      return toolService.todoList(getCwd(), {
        project: args.project as string | undefined,
        status: args.status as "open" | "in_progress" | "done" | undefined,
        all: args.all as boolean | undefined,
        limit: args.limit as number | undefined,
      });
    },
  );

  server.registerTool(
    "todo_get",
    {
      description: "Get details of a specific todo",
      inputSchema: {
        id: z.string().describe("Todo ID (can be short ID)"),
      },
    },
    async (args) => {
      return toolService.todoGet(args.id as string);
    },
  );

  server.registerTool(
    "todo_update",
    {
      description: "Update a todo",
      inputSchema: {
        id: z.string().describe("Todo ID (can be short ID)"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        status: z
          .enum(["open", "in_progress", "done"])
          .optional()
          .describe("New status"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .describe("New priority"),
      },
    },
    async (args) => {
      return toolService.todoUpdate(args.id as string, {
        title: args.title as string | undefined,
        description: args.description as string | undefined,
        status: args.status as "open" | "in_progress" | "done" | undefined,
        priority: args.priority as
          | "low"
          | "normal"
          | "high"
          | "urgent"
          | undefined,
      });
    },
  );

  server.registerTool(
    "todo_done",
    {
      description: "Mark a todo as done",
      inputSchema: {
        id: z.string().describe("Todo ID (can be short ID)"),
      },
    },
    async (args) => {
      return toolService.todoDone(args.id as string);
    },
  );

  server.registerTool(
    "todo_delete",
    {
      description: "Delete a todo",
      inputSchema: {
        id: z.string().describe("Todo ID (can be short ID)"),
      },
    },
    async (args) => {
      return toolService.todoDelete(args.id as string);
    },
  );

  // === Project Tools ===

  server.registerTool(
    "project_list",
    {
      description: "List all known projects",
      inputSchema: {},
    },
    async () => {
      return toolService.projectList();
    },
  );

  server.registerTool(
    "project_current",
    {
      description: "Get the current project (based on working directory)",
      inputSchema: {},
    },
    async () => {
      return toolService.projectCurrent(getCwd());
    },
  );

  logger.info("Registered todo tools", {
    tools: [
      "todo_add",
      "todo_list",
      "todo_get",
      "todo_update",
      "todo_done",
      "todo_delete",
      "project_list",
      "project_current",
    ],
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
  logger.info("MCP Todos Server running on stdio");
}
