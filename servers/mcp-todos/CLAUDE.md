# mcp-todos Architecture

This document explains the architecture and design decisions for AI assistants working with this codebase.

## Overview

mcp-todos is a TODO management system with two interfaces:
1. **CLI** (`src/cli/`) - For human users in the terminal
2. **MCP Server** (`src/server.ts`) - For AI assistants via Model Context Protocol

Both interfaces share the same service layer, ensuring consistent behavior.

## Directory Structure

```
src/
├── index.ts              # MCP server entrypoint
├── server.ts             # MCP server implementation
├── cli/
│   ├── index.ts          # CLI entrypoint
│   └── commands/         # One file per command
├── db/
│   ├── client.ts         # Database connection factory
│   ├── migrations.ts     # Schema initialization
│   ├── repository.ts     # All SQL operations
│   └── schema.ts         # SQL schema definitions
├── services/
│   ├── project-service.ts    # Project detection & management
│   ├── todo-service.ts       # Todo CRUD operations
│   └── tool-service.ts       # MCP response formatting
├── types/
│   └── index.ts          # TypeScript type definitions
└── utils/
    ├── logger.ts         # Structured logging (stderr)
    └── id.ts             # UUID generation & short IDs
```

## Architecture Patterns

### Composition Root

Each entrypoint (CLI command or MCP server) acts as its own composition root:

```typescript
// Example from a CLI command
const db = createDbClient();
const repo = new TodoRepository(db);
const projectService = new ProjectService(repo);
const todoService = new TodoService(repo);

try {
  // Use services...
} finally {
  await repo.close();
}
```

Dependencies flow downward:
- **Entrypoint** creates DB client
- **Repository** receives DB client via constructor
- **Services** receive Repository via constructor
- **No global singletons** or service locators

### Repository Pattern

All SQL operations are encapsulated in `TodoRepository`:

```typescript
class TodoRepository {
  constructor(private db: Client) {}

  // Project operations
  async createProject(...): Promise<Project>
  async findProjectByPath(...): Promise<Project | null>
  async findProjectByRemote(...): Promise<Project | null>

  // Todo operations
  async createTodo(...): Promise<Todo>
  async getTodo(...): Promise<Todo | null>
  async updateTodo(...): Promise<Todo | null>
  async deleteTodo(...): Promise<boolean>
  async listTodos(...): Promise<Todo[]>

  // Utilities
  async resolveTodoId(shortId: string): Promise<string | null>
}
```

Benefits:
- SQL is centralized and testable
- Service layer stays SQL-free
- Easy to swap database implementations

### Service Layer

Services contain business logic and orchestrate repository calls:

**ProjectService** - Project detection and management
- `getOrCreateProject(cwd)` - Main entry point, handles git detection
- `detectProject()` - Git root and remote URL detection
- Worktree matching via remote URL

**TodoService** - Todo CRUD with short ID resolution
- All methods accept short IDs (6+ chars)
- Delegates to repository after ID resolution

**ToolService** - MCP response formatting
- Wraps service calls with MCP response format
- Handles errors gracefully for AI consumption

## Key Design Decisions

### 1. Local Database over Git Sync

**Problem:** Beads uses git for syncing which causes:
- Merge conflicts with concurrent agents
- 5-second sync debounce latency
- Sequential ID collisions across branches
- Complex protected branch workflows

**Solution:** Single local SQLite database
- Instant reads/writes
- No merge conflicts
- UUIDs for collision-free IDs
- Future: Optional Turso cloud sync

### 2. Automatic Project Detection

**Problem:** Users shouldn't need to manually configure project associations.

**Solution:** Git-based detection with worktree support
1. Find git root: `git rev-parse --show-toplevel`
2. Get remote URL: `git config --get remote.origin.url`
3. Match by remote URL first (worktree support)
4. Fall back to path matching
5. Auto-create project if not found

```typescript
// Worktree example:
// /code/project (main branch)
// /code/project-feature (worktree)
// Both share todos because they have the same remote URL
```

### 3. Short IDs

**Problem:** UUIDs are unwieldy for human use.

**Solution:** Git-style short IDs
- Store full UUID internally
- Display first 6 characters
- Accept any unique prefix as input
- Error on ambiguous prefixes

```typescript
async resolveTodoId(shortId: string): Promise<string | null> {
  // Try exact match first
  // Then try prefix match
  // Throw if ambiguous
}
```

### 4. Shared Service Layer

**Problem:** CLI and MCP server need identical behavior.

**Solution:** Both interfaces use the same services
- CLI commands call services directly
- MCP tools call ToolService which wraps services
- ToolService adds MCP response formatting

### 5. XDG-Compliant Storage

**Location:** `~/.local/share/mcp-todos/todos.db`

Following XDG Base Directory spec for user data. Created automatically on first use.

## Database Schema

```sql
-- Projects table
CREATE TABLE projects (
  id TEXT PRIMARY KEY,           -- UUID
  name TEXT NOT NULL,            -- Display name (directory name)
  git_remote TEXT,               -- Origin URL for worktree matching
  root_path TEXT NOT NULL,       -- Canonical path
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Index for worktree matching
CREATE INDEX idx_projects_git_remote ON projects(git_remote);

-- Todos table
CREATE TABLE todos (
  id TEXT PRIMARY KEY,           -- UUID
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',    -- open, in_progress, done
  priority TEXT NOT NULL DEFAULT 'normal', -- low, normal, high, urgent
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT              -- Set when status becomes 'done'
);

-- Indexes for common queries
CREATE INDEX idx_todos_project_status ON todos(project_id, status);
CREATE INDEX idx_todos_status ON todos(status);
```

## MCP Server Details

### Working Directory

The MCP server gets the working directory from:
1. `MCP_WORKING_DIR` environment variable (set by IDE integration)
2. `process.cwd()` fallback

This is critical for project detection to work correctly.

### Tool Response Format

All tools return the MCP standard format:

```typescript
type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};
```

### Graceful Shutdown

The server handles SIGINT/SIGTERM to close the database connection cleanly.

## Logging

Logs go to **stderr** to avoid interfering with MCP stdio transport:

```typescript
// Always use logger, never console.log in services
logger.info("Created todo", { id: todo.id, title: todo.title });
```

Configuration via environment:
- `LOG_LEVEL`: debug, info, warn, error (default: info)
- `LOG_FORMAT`: text, json (default: text)

## Testing Strategy

For testing, use in-memory SQLite:

```typescript
const db = createDbClient("file::memory:");
```

Services are designed for easy testing via constructor injection.

## Future Considerations

### Planned Features
- **Labels/tags** - Many-to-many relationship with todos
- **Due dates** - With optional reminders
- **Dependencies** - Blocks/blocked-by relationships
- **FTS search** - Full-text search on title/description
- **Turso sync** - Multi-machine cloud sync

### Extension Points
- New CLI commands: Add to `src/cli/commands/`
- New MCP tools: Register in `src/server.ts`
- Schema changes: Update `src/db/schema.ts` and add migration logic
