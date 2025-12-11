import type { Client } from "@libsql/client";
import type {
  CreateTodoInput,
  ListTodosOptions,
  Project,
  Todo,
  TodoPriority,
  TodoStatus,
  UpdateTodoInput,
} from "../types/index.js";

type ProjectRow = {
  id: string;
  name: string;
  git_remote: string | null;
  root_path: string;
  created_at: string;
  updated_at: string;
};

type TodoRow = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    gitRemote: row.git_remote,
    rootPath: row.root_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status as TodoStatus,
    priority: row.priority as TodoPriority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export class TodoRepository {
  constructor(private db: Client) {}

  // === Projects ===

  async createProject(
    id: string,
    name: string,
    rootPath: string,
    gitRemote: string | null,
  ): Promise<Project> {
    const now = new Date().toISOString();

    await this.db.execute({
      sql: `INSERT INTO projects (id, name, root_path, git_remote, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, name, rootPath, gitRemote, now, now],
    });

    return {
      id,
      name,
      gitRemote,
      rootPath,
      createdAt: now,
      updatedAt: now,
    };
  }

  async findProjectByPath(rootPath: string): Promise<Project | null> {
    const result = await this.db.execute({
      sql: "SELECT * FROM projects WHERE root_path = ?",
      args: [rootPath],
    });

    if (result.rows.length === 0) return null;
    return rowToProject(result.rows[0] as unknown as ProjectRow);
  }

  async findProjectByRemote(gitRemote: string): Promise<Project | null> {
    const result = await this.db.execute({
      sql: "SELECT * FROM projects WHERE git_remote = ?",
      args: [gitRemote],
    });

    if (result.rows.length === 0) return null;
    return rowToProject(result.rows[0] as unknown as ProjectRow);
  }

  async findProjectById(id: string): Promise<Project | null> {
    const result = await this.db.execute({
      sql: "SELECT * FROM projects WHERE id = ?",
      args: [id],
    });

    if (result.rows.length === 0) return null;
    return rowToProject(result.rows[0] as unknown as ProjectRow);
  }

  async findProjectByName(name: string): Promise<Project | null> {
    const result = await this.db.execute({
      sql: "SELECT * FROM projects WHERE name = ?",
      args: [name],
    });

    if (result.rows.length === 0) return null;
    return rowToProject(result.rows[0] as unknown as ProjectRow);
  }

  async listProjects(): Promise<Project[]> {
    const result = await this.db.execute(
      "SELECT * FROM projects ORDER BY name ASC",
    );
    return result.rows.map((row) => rowToProject(row as unknown as ProjectRow));
  }

  async updateProjectName(id: string, name: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute({
      sql: "UPDATE projects SET name = ?, updated_at = ? WHERE id = ?",
      args: [name, now, id],
    });
  }

  // === Todos ===

  async createTodo(
    id: string,
    projectId: string,
    input: CreateTodoInput,
  ): Promise<Todo> {
    const now = new Date().toISOString();
    const priority = input.priority ?? "normal";

    await this.db.execute({
      sql: `INSERT INTO todos (id, project_id, title, description, status, priority, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
      args: [
        id,
        projectId,
        input.title,
        input.description ?? null,
        priority,
        now,
        now,
      ],
    });

    return {
      id,
      projectId,
      title: input.title,
      description: input.description ?? null,
      status: "open",
      priority,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
  }

  async getTodo(id: string): Promise<Todo | null> {
    const result = await this.db.execute({
      sql: "SELECT * FROM todos WHERE id = ?",
      args: [id],
    });

    if (result.rows.length === 0) return null;
    return rowToTodo(result.rows[0] as unknown as TodoRow);
  }

  async resolveTodoId(shortId: string): Promise<string | null> {
    // Try exact match first
    const exact = await this.db.execute({
      sql: "SELECT id FROM todos WHERE id = ?",
      args: [shortId],
    });
    const exactRow = exact.rows[0];
    if (exact.rows.length === 1 && exactRow) {
      return exactRow.id as string;
    }

    // Try prefix match
    const prefix = await this.db.execute({
      sql: "SELECT id FROM todos WHERE id LIKE ?",
      args: [`${shortId}%`],
    });

    const prefixRow = prefix.rows[0];
    if (prefix.rows.length === 1 && prefixRow) {
      return prefixRow.id as string;
    }

    if (prefix.rows.length > 1) {
      throw new Error(
        `Ambiguous ID '${shortId}' matches ${prefix.rows.length} todos. Use more characters.`,
      );
    }

    return null;
  }

  async updateTodo(id: string, input: UpdateTodoInput): Promise<Todo | null> {
    const existing = await this.getTodo(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates: string[] = ["updated_at = ?"];
    const args: (string | null)[] = [now];

    if (input.title !== undefined) {
      updates.push("title = ?");
      args.push(input.title);
    }
    if (input.description !== undefined) {
      updates.push("description = ?");
      args.push(input.description);
    }
    if (input.status !== undefined) {
      updates.push("status = ?");
      args.push(input.status);
      if (input.status === "done") {
        updates.push("completed_at = ?");
        args.push(now);
      } else if (existing.status === "done") {
        // Re-opening a completed todo
        updates.push("completed_at = ?");
        args.push(null);
      }
    }
    if (input.priority !== undefined) {
      updates.push("priority = ?");
      args.push(input.priority);
    }

    args.push(id);

    await this.db.execute({
      sql: `UPDATE todos SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });

    return this.getTodo(id);
  }

  async deleteTodo(id: string): Promise<boolean> {
    const result = await this.db.execute({
      sql: "DELETE FROM todos WHERE id = ?",
      args: [id],
    });
    return result.rowsAffected > 0;
  }

  async listTodos(
    projectId: string,
    options?: ListTodosOptions,
  ): Promise<Todo[]> {
    let sql = "SELECT * FROM todos WHERE project_id = ?";
    const args: (string | number)[] = [projectId];

    if (options?.status) {
      sql += " AND status = ?";
      args.push(options.status);
    }

    sql += " ORDER BY created_at DESC";

    if (options?.limit) {
      sql += " LIMIT ?";
      args.push(options.limit);
    }

    const result = await this.db.execute({ sql, args });
    return result.rows.map((row) => rowToTodo(row as unknown as TodoRow));
  }

  async listAllTodos(options?: ListTodosOptions): Promise<Todo[]> {
    let sql = "SELECT * FROM todos";
    const args: (string | number)[] = [];

    if (options?.status) {
      sql += " WHERE status = ?";
      args.push(options.status);
    }

    sql += " ORDER BY created_at DESC";

    if (options?.limit) {
      sql += " LIMIT ?";
      args.push(options.limit);
    }

    const result = await this.db.execute({ sql, args });
    return result.rows.map((row) => rowToTodo(row as unknown as TodoRow));
  }

  async getProjectTodoStats(
    projectId: string,
  ): Promise<{ open: number; inProgress: number; done: number }> {
    const result = await this.db.execute({
      sql: `SELECT status, COUNT(*) as count FROM todos WHERE project_id = ? GROUP BY status`,
      args: [projectId],
    });

    const stats = { open: 0, inProgress: 0, done: 0 };
    for (const row of result.rows) {
      const status = row.status as string;
      const count = Number(row.count);
      if (status === "open") stats.open = count;
      else if (status === "in_progress") stats.inProgress = count;
      else if (status === "done") stats.done = count;
    }
    return stats;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
