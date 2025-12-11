export const SCHEMA = {
  projects: `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      git_remote TEXT,
      root_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,

  projectsGitRemoteIndex: `
    CREATE INDEX IF NOT EXISTS idx_projects_git_remote
    ON projects(git_remote)
  `,

  projectsRootPathIndex: `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_root_path
    ON projects(root_path)
  `,

  todos: `
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `,

  todosProjectStatusIndex: `
    CREATE INDEX IF NOT EXISTS idx_todos_project_status
    ON todos(project_id, status)
  `,

  todosStatusIndex: `
    CREATE INDEX IF NOT EXISTS idx_todos_status
    ON todos(status)
  `,
};
