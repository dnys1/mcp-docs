#!/usr/bin/env bun

/**
 * MCP Docs CLI - Main entrypoint
 *
 * Usage:
 *   mcp-docs <command> [options]
 *
 * Commands:
 *   source      Manage documentation sources
 *   ingest      Ingest documentation into the database
 *   status      Show server status
 *   configure   Configure MCP server in Claude Code / VSCode
 */

import { buildCommand } from "./commands/build.js";
import { configureCommand } from "./commands/configure.js";
import { ingestCommand } from "./commands/ingest.js";
import { sourceCommand } from "./commands/source.js";
import { statusCommand } from "./commands/status.js";

const HELP_TEXT = `
mcp-docs - Documentation search MCP server

Usage:
  mcp-docs <command> [options]

Commands:
  source      Manage documentation sources
  ingest      Ingest documentation into the database
  status      Show server status
  build       Build the server to dist/
  configure   Configure MCP server in Claude Code / VSCode

Examples:
  mcp-docs source add react react.dev
  mcp-docs ingest --source=react
  mcp-docs status

Run 'mcp-docs <command> --help' for more information on a command.
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  switch (command) {
    case "source":
      await sourceCommand(args.slice(1));
      break;
    case "ingest":
      await ingestCommand(args.slice(1));
      break;
    case "status":
      await statusCommand(args.slice(1));
      break;
    case "build":
      await buildCommand(args.slice(1));
      break;
    case "configure":
      await configureCommand(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
