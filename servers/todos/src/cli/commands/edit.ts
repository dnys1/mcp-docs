import { parseArgs } from "node:util";
import { createDbClient } from "../../db/client.js";
import { initializeDatabase } from "../../db/migrations.js";
import { TodoRepository } from "../../db/repository.js";
import { TodoService } from "../../services/todo-service.js";
import type {
  TodoPriority,
  TodoStatus,
  UpdateTodoInput,
} from "../../types/index.js";
import { shortId } from "../../utils/id.js";

const HELP = `
Usage: mcp-todos edit <id> [options]

Edit a todo.

Options:
  -t, --title <text>         New title
  -d, --description <text>   New description
  -s, --status <status>      New status: open, in_progress, done
  -p, --priority <level>     New priority: low, normal, high, urgent
  -h, --help                 Show this help message

Examples:
  mcp-todos edit abc123 --title "Updated title"
  mcp-todos edit abc123 -s in_progress
  mcp-todos edit abc123 -p high -d "More details"
`;

export async function editCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      title: { type: "string", short: "t" },
      description: { type: "string", short: "d" },
      status: { type: "string", short: "s" },
      priority: { type: "string", short: "p" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const todoId = positionals[0];
  if (!todoId) {
    console.error("Error: Todo ID is required");
    console.log(HELP);
    process.exit(1);
  }

  const status = values.status as TodoStatus | undefined;
  if (status && !["open", "in_progress", "done"].includes(status)) {
    console.error(
      `Error: Invalid status '${status}'. Use: open, in_progress, done`,
    );
    process.exit(1);
  }

  const priority = values.priority as TodoPriority | undefined;
  if (priority && !["low", "normal", "high", "urgent"].includes(priority)) {
    console.error(
      `Error: Invalid priority '${priority}'. Use: low, normal, high, urgent`,
    );
    process.exit(1);
  }

  const input: UpdateTodoInput = {};
  if (values.title) input.title = values.title;
  if (values.description) input.description = values.description;
  if (status) input.status = status;
  if (priority) input.priority = priority;

  if (Object.keys(input).length === 0) {
    console.error("Error: No changes specified");
    console.log(HELP);
    process.exit(1);
  }

  const db = createDbClient();
  const repo = new TodoRepository(db);

  try {
    await initializeDatabase(db);
    const todoService = new TodoService(repo);

    const todo = await todoService.update(todoId, input);
    if (!todo) {
      console.error(`Error: Todo '${todoId}' not found`);
      process.exit(1);
    }

    console.log(`Updated todo ${shortId(todo.id)}`);
  } finally {
    await repo.close();
  }
}
