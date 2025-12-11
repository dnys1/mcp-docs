#!/usr/bin/env bun

/**
 * mcp-todos CLI - Multi-project TODO management
 *
 * Usage:
 *   mcp-todos <command> [options]
 */

import { addCommand } from "./commands/add.js";
import { buildCommand } from "./commands/build.js";
import { configureCommand } from "./commands/configure.js";
import { deleteCommand } from "./commands/delete.js";
import { doneCommand } from "./commands/done.js";
import { editCommand } from "./commands/edit.js";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { projectCommand } from "./commands/project.js";
import { showCommand } from "./commands/show.js";

const HELP_TEXT = `
mcp-todos - Multi-project TODO management

Usage:
  mcp-todos <command> [options]

Commands:
  add <title>       Add a new todo
  list              List todos for current project
  show <id>         Show todo details
  edit <id>         Edit a todo
  done <id>         Mark todo as done
  delete <id>       Delete a todo
  project           Manage projects
  init              Initialize current directory as a project
  build             Build the MCP server to dist/
  configure         Configure MCP server in Claude Code / VSCode

Examples:
  mcp-todos add "Fix the login bug" -p high
  mcp-todos list --status open
  mcp-todos done abc123
  mcp-todos project list

Run 'mcp-todos <command> --help' for more information on a command.
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  switch (command) {
    case "add":
      await addCommand(args.slice(1));
      break;
    case "list":
    case "ls":
      await listCommand(args.slice(1));
      break;
    case "show":
      await showCommand(args.slice(1));
      break;
    case "edit":
      await editCommand(args.slice(1));
      break;
    case "done":
      await doneCommand(args.slice(1));
      break;
    case "delete":
    case "rm":
      await deleteCommand(args.slice(1));
      break;
    case "project":
      await projectCommand(args.slice(1));
      break;
    case "init":
      await initCommand(args.slice(1));
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
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
