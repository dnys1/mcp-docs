export type TodoStatus = "open" | "in_progress" | "done";
export type TodoPriority = "low" | "normal" | "high" | "urgent";

export type Project = {
  id: string;
  name: string;
  gitRemote: string | null;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

export type Todo = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type CreateTodoInput = {
  title: string;
  description?: string;
  priority?: TodoPriority;
};

export type UpdateTodoInput = {
  title?: string;
  description?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
};

export type ListTodosOptions = {
  status?: TodoStatus;
  limit?: number;
};
