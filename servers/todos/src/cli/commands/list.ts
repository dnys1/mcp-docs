import { parseArgs } from "node:util";
import { TodosDatabase } from "../../db/client.js";
import { initializeDatabase } from "../../db/migrations.js";
import { TodoRepository } from "../../db/repository.js";
import { ProjectService } from "../../services/project-service.js";
import { TodoService } from "../../services/todo-service.js";
import type { Todo, TodoStatus } from "../../types/index.js";
import { shortId } from "../../utils/id.js";

const HELP = `
Usage: mcp-todos list [options]

List todos for the current project.

Options:
  -a, --all                  Show todos from all projects
  -s, --status <status>      Filter by status: open, in_progress, done
  -p, --project <name>       Show todos for a specific project
  -l, --limit <n>            Limit number of results
  -h, --help                 Show this help message

Examples:
  mcp-todos list
  mcp-todos list --status open
  mcp-todos list --all
  mcp-todos list -p my-project
`;

function formatTodo(todo: Todo): string {
  const statusIcon =
    todo.status === "done"
      ? "[x]"
      : todo.status === "in_progress"
        ? "[~]"
        : "[ ]";
  const priorityLabel = todo.priority !== "normal" ? ` (${todo.priority})` : "";
  return `${statusIcon} ${shortId(todo.id)}  ${todo.title}${priorityLabel}`;
}

export async function listCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      all: { type: "boolean", short: "a" },
      status: { type: "string", short: "s" },
      project: { type: "string", short: "p" },
      limit: { type: "string", short: "l" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const status = values.status as TodoStatus | undefined;
  if (status && !["open", "in_progress", "done"].includes(status)) {
    console.error(
      `Error: Invalid status '${status}'. Use: open, in_progress, done`,
    );
    process.exit(1);
  }

  const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined;

  const db = new TodosDatabase();
  const repo = new TodoRepository(db.client);

  try {
    await initializeDatabase(db.client);

    const projectService = new ProjectService(repo);
    const todoService = new TodoService(repo);

    let todos: Todo[];
    let projectName: string | undefined;

    if (values.all) {
      todos = await todoService.listAll({ status, limit });
    } else if (values.project) {
      const project = await projectService.getProjectByName(values.project);
      if (!project) {
        console.error(`Error: Project '${values.project}' not found`);
        process.exit(1);
      }
      todos = await todoService.list(project.id, { status, limit });
      projectName = project.name;
    } else {
      const project = await projectService.getOrCreateProject(process.cwd());
      todos = await todoService.list(project.id, { status, limit });
      projectName = project.name;
    }

    if (todos.length === 0) {
      const scope = values.all
        ? "all projects"
        : projectName || "current project";
      console.log(`No todos found in ${scope}.`);
      return;
    }

    if (!values.all && projectName) {
      console.log(`Todos for ${projectName}:\n`);
    }

    for (const todo of todos) {
      console.log(formatTodo(todo));
    }
  } finally {
    await repo.close();
  }
}
