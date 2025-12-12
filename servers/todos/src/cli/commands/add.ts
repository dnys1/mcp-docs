import { parseArgs } from "node:util";
import { TodosDatabase } from "../../db/client.js";
import { TodosMigrationService } from "../../db/migrations.js";
import { TodoRepository } from "../../db/repository.js";
import { ProjectService } from "../../services/project-service.js";
import { TodoService } from "../../services/todo-service.js";
import type { TodoPriority } from "../../types/index.js";
import { shortId } from "../../utils/id.js";

const HELP = `
Usage: mcp-todos add <title> [options]

Add a new todo to the current project.

Options:
  -d, --description <text>   Description for the todo
  -p, --priority <level>     Priority: low, normal, high, urgent (default: normal)
  -h, --help                 Show this help message

Examples:
  mcp-todos add "Fix login bug"
  mcp-todos add "Update docs" -d "Add API reference section"
  mcp-todos add "Critical fix" -p urgent
`;

export async function addCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      description: { type: "string", short: "d" },
      priority: { type: "string", short: "p" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const title = positionals[0];
  if (!title) {
    console.error("Error: Title is required");
    console.log(HELP);
    process.exit(1);
  }

  const priority = (values.priority as TodoPriority) ?? "normal";
  const validPriorities = ["low", "normal", "high", "urgent"];
  if (!validPriorities.includes(priority)) {
    console.error(
      `Error: Invalid priority '${priority}'. Use: ${validPriorities.join(", ")}`,
    );
    process.exit(1);
  }

  const db = new TodosDatabase();
  const repo = new TodoRepository(db.client);

  try {
    const migrationService = new TodosMigrationService(db.client);
    await migrationService.initialize();

    const projectService = new ProjectService(repo);
    const todoService = new TodoService(repo);

    const project = await projectService.getOrCreateProject(process.cwd());
    const todo = await todoService.add(project.id, {
      title,
      description: values.description,
      priority,
    });

    console.log(`Created todo ${shortId(todo.id)}: ${todo.title}`);
  } finally {
    await repo.close();
  }
}
