# mcp-todos

A multi-project TODO management system with CLI and MCP server for AI-assisted task tracking.

## Features

- **Multi-project support** - Automatically detects projects from git repositories
- **Worktree-aware** - Multiple git worktrees of the same repo share todos
- **Short IDs** - Reference todos with 6-character IDs (like git commits)
- **CLI + MCP** - Use from terminal or let AI assistants manage your todos
- **Local-first** - SQLite database with no sync complexity

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-todos.git
cd mcp-todos

# Install dependencies
bun install

# Run the CLI
bun run cli --help
```

## CLI Usage

```bash
# Add a todo
mcp-todos add "Fix the login bug" -p high
mcp-todos add "Update docs" -d "Add API reference section"

# List todos
mcp-todos list                    # Current project
mcp-todos list --all              # All projects
mcp-todos list --status open      # Filter by status

# Manage todos
mcp-todos show abc123             # Show details
mcp-todos edit abc123 -s in_progress
mcp-todos done abc123             # Mark complete
mcp-todos delete abc123

# Project commands
mcp-todos project list            # List all projects
mcp-todos project show            # Current project info
mcp-todos init                    # Initialize project
```

### Options

**Priorities:** `low`, `normal` (default), `high`, `urgent`

**Statuses:** `open`, `in_progress`, `done`

## MCP Server

### Configuration

Add to your Claude Code MCP settings (`~/.claude/settings.json` or VS Code settings):

```json
{
  "mcpServers": {
    "mcp-todos": {
      "command": "bun",
      "args": ["run", "/path/to/mcp-todos/src/index.ts"],
      "env": {
        "MCP_WORKING_DIR": "${workspaceFolder}"
      }
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `todo_add` | Add a new todo to the current project |
| `todo_list` | List todos with optional filters |
| `todo_get` | Get details of a specific todo |
| `todo_update` | Update a todo's title, description, status, or priority |
| `todo_done` | Mark a todo as done |
| `todo_delete` | Delete a todo |
| `project_list` | List all known projects |
| `project_current` | Get current project info |

## How It Works

### Project Detection

When you run a command, mcp-todos automatically detects your project:

1. Finds the git repository root (`git rev-parse --show-toplevel`)
2. Gets the remote URL (`git config --get remote.origin.url`)
3. If another project has the same remote URL, uses that (worktree support)
4. Otherwise creates a new project named after the directory

Non-git directories are also supported - they're tracked by their absolute path.

### Database

Todos are stored in `~/.local/share/mcp-todos/todos.db` (SQLite via libsql).

### Short IDs

Full UUIDs are stored internally, but you can reference todos with their first 6 characters. If ambiguous, you'll be prompted to use more characters.

## Development

```bash
# Run CLI in development
bun run cli <command>

# Run MCP server (development)
bun run start:dev

# Build for production
bun run build

# Run production build
bun run start

# Lint and format
bun run lint:fix

# Type check
bun run typecheck
```

## Comparison to Beads

[Beads](https://github.com/steveyegge/beads) is a similar tool that uses git for syncing. mcp-todos takes a simpler approach:

| Feature | mcp-todos | Beads |
|---------|-----------|-------|
| Storage | Local SQLite | Git-synced JSONL |
| Sync | None (local-first) | Git push/pull |
| Merge conflicts | None | Possible |
| Dependencies | Not yet | Yes (blocks/blocked-by) |
| Setup | Zero config | Zero config |

mcp-todos is designed to be simpler and faster for single-machine use. Multi-machine sync via Turso is planned for the future.

## License

MIT
