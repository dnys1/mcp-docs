# MCP Servers

A collection of [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) servers for AI assistants.

## Servers

### [mcp-docs](./servers/docs)

A documentation search server that provides semantic search over multiple documentation sources. Supports ingesting docs from `llms.txt` files or via Firecrawl web scraping.

### [mcp-todos](./servers/todos)

A multi-project TODO management server. Includes both an MCP server for AI assistants and a CLI (`todo`) for human use.

```bash
# Quick add a todo
todo Buy milk, eggs, and butter

# List todos
todo list

# Mark as done
todo done abc123
```

## Development

This is a Bun monorepo. To get started:

```bash
# Install dependencies
bun install

# Run a server in development
cd servers/todos
bun dev

# Build for production
bun run build
```

## License

[MIT](./LICENSE)
