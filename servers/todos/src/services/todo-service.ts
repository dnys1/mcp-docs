import { logger } from "@mcp/shared/logger";
import type { TodoRepository } from "../db/repository.js";
import type {
  CreateTodoInput,
  ListTodosOptions,
  Todo,
  UpdateTodoInput,
} from "../types/index.js";
import { generateId } from "../utils/id.js";

export class TodoService {
  private log = logger.child({ service: "TodoService" });

  constructor(private repo: TodoRepository) {}

  /**
   * Add a new todo to a project.
   */
  async add(projectId: string, input: CreateTodoInput): Promise<Todo> {
    const id = generateId();
    const todo = await this.repo.createTodo(id, projectId, input);
    this.log.info("Created todo", { id: todo.id, title: todo.title });
    return todo;
  }

  /**
   * Get a todo by ID (supports short IDs).
   */
  async get(idOrShortId: string): Promise<Todo | null> {
    const fullId = await this.repo.resolveTodoId(idOrShortId);
    if (!fullId) return null;
    return this.repo.getTodo(fullId);
  }

  /**
   * Update a todo.
   */
  async update(
    idOrShortId: string,
    input: UpdateTodoInput,
  ): Promise<Todo | null> {
    const fullId = await this.repo.resolveTodoId(idOrShortId);
    if (!fullId) return null;
    const updated = await this.repo.updateTodo(fullId, input);
    if (updated) {
      this.log.info("Updated todo", { id: updated.id });
    }
    return updated;
  }

  /**
   * Mark a todo as done.
   */
  async markDone(idOrShortId: string): Promise<Todo | null> {
    return this.update(idOrShortId, { status: "done" });
  }

  /**
   * Delete a todo.
   */
  async delete(idOrShortId: string): Promise<boolean> {
    const fullId = await this.repo.resolveTodoId(idOrShortId);
    if (!fullId) return false;
    const deleted = await this.repo.deleteTodo(fullId);
    if (deleted) {
      this.log.info("Deleted todo", { id: fullId });
    }
    return deleted;
  }

  /**
   * List todos for a project.
   */
  async list(projectId: string, options?: ListTodosOptions): Promise<Todo[]> {
    return this.repo.listTodos(projectId, options);
  }

  /**
   * List todos across all projects.
   */
  async listAll(options?: ListTodosOptions): Promise<Todo[]> {
    return this.repo.listAllTodos(options);
  }
}
