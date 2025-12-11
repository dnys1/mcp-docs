import type {
  CreateTodoInput,
  Project,
  Todo,
  TodoStatus,
  UpdateTodoInput,
} from "../types/index.js";
import { shortId } from "../utils/id.js";
import type { ProjectService } from "./project-service.js";
import type { TodoService } from "./todo-service.js";

export type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function formatTodo(todo: Todo): string {
  const statusIcon =
    todo.status === "done"
      ? "[x]"
      : todo.status === "in_progress"
        ? "[~]"
        : "[ ]";
  const priorityLabel = todo.priority !== "normal" ? ` (${todo.priority})` : "";

  let text = `${statusIcon} ${shortId(todo.id)} - ${todo.title}${priorityLabel}`;
  if (todo.description) {
    text += `\n    ${todo.description}`;
  }
  return text;
}

function formatTodoDetailed(todo: Todo): string {
  const lines = [
    `ID: ${shortId(todo.id)}`,
    `Title: ${todo.title}`,
    `Status: ${todo.status}`,
    `Priority: ${todo.priority}`,
  ];

  if (todo.description) {
    lines.push(`Description: ${todo.description}`);
  }

  lines.push(`Created: ${todo.createdAt}`);

  if (todo.completedAt) {
    lines.push(`Completed: ${todo.completedAt}`);
  }

  return lines.join("\n");
}

function formatProject(
  project: Project,
  stats?: { open: number; inProgress: number; done: number },
): string {
  let text = `${project.name} (${project.rootPath})`;
  if (stats) {
    text += `\n  Open: ${stats.open}, In Progress: ${stats.inProgress}, Done: ${stats.done}`;
  }
  return text;
}

export class ToolService {
  constructor(
    private projectService: ProjectService,
    private todoService: TodoService,
  ) {}

  private response(text: string, isError = false): ToolResponse {
    return {
      content: [{ type: "text", text }],
      ...(isError ? { isError: true } : {}),
    };
  }

  // === Todo Tools ===

  async todoAdd(cwd: string, input: CreateTodoInput): Promise<ToolResponse> {
    const project = await this.projectService.getOrCreateProject(cwd);
    const todo = await this.todoService.add(project.id, input);
    return this.response(`Created todo ${shortId(todo.id)}: ${todo.title}`);
  }

  async todoList(
    cwd: string,
    options: {
      project?: string;
      status?: TodoStatus;
      all?: boolean;
      limit?: number;
    },
  ): Promise<ToolResponse> {
    let todos: Todo[];

    if (options.all) {
      todos = await this.todoService.listAll({
        status: options.status,
        limit: options.limit,
      });
    } else if (options.project) {
      const project = await this.projectService.getProjectByName(
        options.project,
      );
      if (!project) {
        return this.response(`Project '${options.project}' not found`, true);
      }
      todos = await this.todoService.list(project.id, {
        status: options.status,
        limit: options.limit,
      });
    } else {
      const project = await this.projectService.getOrCreateProject(cwd);
      todos = await this.todoService.list(project.id, {
        status: options.status,
        limit: options.limit,
      });
    }

    if (todos.length === 0) {
      return this.response("No todos found.");
    }

    const formatted = todos.map(formatTodo).join("\n");
    return this.response(formatted);
  }

  async todoGet(idOrShortId: string): Promise<ToolResponse> {
    const todo = await this.todoService.get(idOrShortId);
    if (!todo) {
      return this.response(`Todo '${idOrShortId}' not found`, true);
    }
    return this.response(formatTodoDetailed(todo));
  }

  async todoUpdate(
    idOrShortId: string,
    input: UpdateTodoInput,
  ): Promise<ToolResponse> {
    const todo = await this.todoService.update(idOrShortId, input);
    if (!todo) {
      return this.response(`Todo '${idOrShortId}' not found`, true);
    }
    return this.response(`Updated todo ${shortId(todo.id)}`);
  }

  async todoDone(idOrShortId: string): Promise<ToolResponse> {
    const todo = await this.todoService.markDone(idOrShortId);
    if (!todo) {
      return this.response(`Todo '${idOrShortId}' not found`, true);
    }
    return this.response(`Marked ${shortId(todo.id)} as done: ${todo.title}`);
  }

  async todoDelete(idOrShortId: string): Promise<ToolResponse> {
    const deleted = await this.todoService.delete(idOrShortId);
    if (!deleted) {
      return this.response(`Todo '${idOrShortId}' not found`, true);
    }
    return this.response(`Deleted todo ${idOrShortId}`);
  }

  // === Project Tools ===

  async projectList(): Promise<ToolResponse> {
    const projects = await this.projectService.listProjects();
    if (projects.length === 0) {
      return this.response("No projects found.");
    }

    const formatted: string[] = [];
    for (const project of projects) {
      const stats = await this.projectService.getProjectStats(project.id);
      formatted.push(formatProject(project, stats));
    }

    return this.response(formatted.join("\n\n"));
  }

  async projectCurrent(cwd: string): Promise<ToolResponse> {
    const project = await this.projectService.getOrCreateProject(cwd);
    const stats = await this.projectService.getProjectStats(project.id);
    return this.response(formatProject(project, stats));
  }
}
