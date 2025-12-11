import { parseArgs } from "node:util";
import { TodosDatabase } from "../../db/client.js";
import { initializeDatabase } from "../../db/migrations.js";
import { TodoRepository } from "../../db/repository.js";
import { TodoService } from "../../services/todo-service.js";

const HELP = `
Usage: mcp-todos delete <id>

Delete a todo.

Options:
  -h, --help    Show this help message

Examples:
  mcp-todos delete abc123
  mcp-todos rm abc123
`;

export async function deleteCommand(args: string[]): Promise<void> {
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

  const db = new TodosDatabase();
  const repo = new TodoRepository(db.client);

  try {
    await initializeDatabase(db.client);
    const todoService = new TodoService(repo);

    const deleted = await todoService.delete(todoId);
    if (!deleted) {
      console.error(`Error: Todo '${todoId}' not found`);
      process.exit(1);
    }

    console.log(`Deleted todo ${todoId}`);
  } finally {
    await repo.close();
  }
}
