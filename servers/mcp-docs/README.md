# MCP Docs Server

A Model Context Protocol (MCP) server that aggregates documentation from multiple sources and provides semantic search capabilities using vector embeddings.

## Features

- **Multiple source types**: Support for llms.txt format and web scraping via Firecrawl
- **Semantic search**: Hybrid search combining vector embeddings and FTS5 keyword search
- **Per-source tools**: Each documentation source gets its own `search_<name>_docs` tool for easy discovery
- **Simple CLI**: Add, remove, and manage documentation sources

## Tech Stack

- **Runtime**: Bun
- **MCP SDK**: `@modelcontextprotocol/sdk` (stdio transport)
- **Database**: LibSQL with vector embeddings and FTS5
- **Embeddings**: Vercel AI SDK (configurable providers)
- **Web Scraping**: Firecrawl

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```bash
# Database (optional - defaults to ~/.local/share/mcp-docs/docs.db)
# DATABASE_URL=file:./data/docs.db

# Embeddings (OpenAI)
OPENAI_API_KEY=sk-...

# Firecrawl (for web scraping)
FIRECRAWL_API_KEY=fc-...
```

### 3. Add Documentation Sources

```bash
# Add a source
bun run cli source add bun bun.sh
bun run cli source add react react.dev
bun run cli source add mylib example.com/docs
```

The CLI will automatically detect whether to use llms.txt or Firecrawl based on what's available at the URL.

### 4. Run Ingestion

```bash
# Ingest all sources
bun run cli ingest

# Or ingest a specific source
bun run cli ingest --source=bun
```

### 5. Configure MCP Client

```bash
bun run cli configure
```

This configures the MCP server in Claude Code. To also configure VSCode:

```bash
bun run cli configure --vscode
```

## Usage

### MCP Tools

Each documentation source you add creates a dedicated search tool:

- `search_bun_docs` - Search Bun documentation
- `search_react_docs` - Search React documentation
- `search_mylib_docs` - Search your custom docs

Each tool accepts:
- `query` (required): Search query
- `limit` (optional): Number of results (default: 5)

Results are returned as markdown with title, path, URL, and relevant content.

### CLI Commands

```bash
# Source management
bun run cli source add <name> <url>    # Add a new source
bun run cli source remove <name>        # Remove a source
bun run cli source list                 # List all sources

# Ingestion
bun run cli ingest                      # Ingest all sources
bun run cli ingest --source=<name>      # Ingest specific source
bun run cli ingest --dry-run            # Preview without writing

# Status
bun run cli status                      # Show database stats

# Configuration
bun run cli configure                   # Configure Claude Code / VSCode
```

### Source Auto-Detection

When adding a source, the CLI automatically detects the best method:

1. URLs ending in `llms.txt` or `llms-full.txt` are used directly
2. Probes `{url}/llms.txt` - if found, uses llms.txt
3. Probes `docs.{domain}/llms.txt` - if found, uses llms.txt
4. Falls back to Firecrawl web scraping

### Source Options

```bash
# Firecrawl options
bun run cli source add mysite example.com --crawl-limit=200
bun run cli source add docs example.com/docs --exclude-paths=blog/*,changelog/*

# llms.txt options
bun run cli source add bun bun.sh --include-optional
```

## How It Works

1. **Source Management**: Add documentation sources via CLI - stored in SQLite
2. **Ingestion**: Fetches documentation from sources (llms.txt or Firecrawl)
3. **Chunking**: Splits documents into ~512 token chunks with overlap
4. **Embedding**: Generates vector embeddings for each chunk
5. **Indexing**: Stores in LibSQL with vector index and FTS5 for hybrid search
6. **Tool Registration**: Each source becomes a `search_<name>_docs` MCP tool
7. **Search**: Combines vector similarity and keyword matching via Reciprocal Rank Fusion

## Database

The database is stored at `~/.local/share/mcp-docs/docs.db` by default (following XDG conventions). Override with `DATABASE_URL` in `.env`.

**Schema:**
- **sources**: Documentation sources (name, type, URL, options)
- **documents**: Full documents with content hash for deduplication
- **chunks**: Document chunks with vector embeddings (1536 dimensions)
- **chunks_fts**: FTS5 index for keyword search

## Development

```bash
# Type check
bun run build

# Run tests
bun test

# Run server directly
bun run src/index.ts
```

## License

MIT
