import { parseArgs } from "node:util";
import { TodosDatabase } from "../../db/client.js";
import { initializeDatabase } from "../../db/migrations.js";
import { TodoRepository } from "../../db/repository.js";
import { TodoService } from "../../services/todo-service.js";
import { shortId } from "../../utils/id.js";

const HELP = `
Usage: mcp-todos done <id>

Mark a todo as done.

Options:
  -h, --help    Show this help message

Examples:
  mcp-todos done abc123
`;

export async function doneCommand(args: string[]): Promise<void> {
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

    const todo = await todoService.markDone(todoId);
    if (!todo) {
      console.error(`Error: Todo '${todoId}' not found`);
      process.exit(1);
    }

    console.log(`Marked ${shortId(todo.id)} as done: ${todo.title}`);
  } finally {
    await repo.close();
  }
}
