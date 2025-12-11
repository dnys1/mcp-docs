import { parseArgs } from "node:util";
import { createDbClient } from "../../db/client.js";
import { initializeDatabase } from "../../db/migrations.js";
import { TodoRepository } from "../../db/repository.js";
import { TodoService } from "../../services/todo-service.js";
import { shortId } from "../../utils/id.js";

const HELP = `
Usage: mcp-todos show <id>

Show details of a specific todo.

Options:
  -h, --help    Show this help message

Examples:
  mcp-todos show abc123
`;

export async function showCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
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

  const db = createDbClient();
  const repo = new TodoRepository(db);

  try {
    await initializeDatabase(db);
    const todoService = new TodoService(repo);

    const todo = await todoService.get(todoId);
    if (!todo) {
      console.error(`Error: Todo '${todoId}' not found`);
      process.exit(1);
    }

    console.log(`ID:          ${shortId(todo.id)}`);
    console.log(`Title:       ${todo.title}`);
    console.log(`Status:      ${todo.status}`);
    console.log(`Priority:    ${todo.priority}`);
    if (todo.description) {
      console.log(`Description: ${todo.description}`);
    }
    console.log(`Created:     ${todo.createdAt}`);
    console.log(`Updated:     ${todo.updatedAt}`);
    if (todo.completedAt) {
      console.log(`Completed:   ${todo.completedAt}`);
    }
  } finally {
    await repo.close();
  }
}
