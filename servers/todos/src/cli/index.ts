#!/usr/bin/env bun

/**
 * todo CLI - Multi-project TODO management
 *
 * Usage:
 *   todo <command> [options]
 *   todo <title>              # Quick add a todo
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
import { startCommand } from "./commands/start.js";

const COMMANDS = new Set([
  "start",
  "add",
  "list",
  "ls",
  "show",
  "edit",
  "done",
  "delete",
  "rm",
  "project",
  "init",
  "build",
  "configure",
]);

const HELP_TEXT = `
todo - Multi-project TODO management

Usage:
  todo <title>        Quick add a todo
  todo <command>      Run a command

Commands:
  start             Start the MCP server
  add <title>       Add a new todo (with options)
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
  todo Buy milk, eggs, and butter
  todo add "Fix the login bug" -p high
  todo list --status open
  todo done abc123

Run 'todo <command> --help' for more information on a command.
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // If first arg is not a known command, treat entire input as a quick add
  if (!COMMANDS.has(command)) {
    const title = args.join(" ");
    await addCommand([title]);
    return;
  }

  switch (command) {
    case "start":
      await startCommand(args.slice(1));
      break;
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
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
