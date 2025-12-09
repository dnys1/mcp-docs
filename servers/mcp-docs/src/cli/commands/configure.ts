/**
 * Configure command - set up MCP server in Claude Code / VSCode
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT_DIR = join(import.meta.dir, "..", "..", "..");
const PROJECT_NAME = "mcp-docs";

interface VSCodeMCPConfig {
  servers: Record<
    string,
    {
      type: "stdio" | "http";
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
    }
  >;
  inputs: unknown[];
}

const HELP_TEXT = `
Usage: mcp-docs configure [options]

Options:
  --vscode    Also configure VSCode (macOS only)
  --help, -h  Show this help message

Configures the MCP server in:
  - Claude Code (~/.claude.json)
  - VSCode (~/Library/Application Support/Code/User/mcp.json) if --vscode

The server will be configured to run from the built dist/index.js.
Make sure to run 'mcp-docs build' first.
`;

async function updateClaudeCodeConfig() {
  try {
    const command = `claude mcp add ${PROJECT_NAME} --scope user -- bun run ${join(
      PROJECT_DIR,
      "dist/index.js",
    )}`;

    console.log(`  Running: ${command}`);
    execSync(command, { stdio: "inherit" });
    console.log(`Updated Claude Code config`);
  } catch (error: unknown) {
    const execError = error as { status?: number; message?: string };
    if (execError.status === 127) {
      console.error(
        "Claude Code CLI not found. Please install it first: https://claude.ai/code",
      );
    } else {
      console.error("Failed to update Claude Code config:", execError.message);
    }
    throw error;
  }
}

function updateVSCodeMCPConfig() {
  const vscodeDir = join(
    homedir(),
    "Library",
    "Application Support",
    "Code",
    "User",
  );
  const mcpConfigPath = join(vscodeDir, "mcp.json");

  if (!existsSync(vscodeDir)) {
    console.log("VSCode not found, skipping");
    return;
  }

  // Backup the original file if it exists
  if (existsSync(mcpConfigPath)) {
    const backupPath = `${mcpConfigPath}.backup`;
    try {
      const originalContent = readFileSync(mcpConfigPath, "utf-8");
      writeFileSync(backupPath, originalContent);
      console.log(`  Created backup: ${backupPath}`);
    } catch (error) {
      console.error("Failed to backup VSCode MCP config:", error);
      return;
    }
  }

  let config: VSCodeMCPConfig = { servers: {}, inputs: [] };
  if (existsSync(mcpConfigPath)) {
    try {
      const content = readFileSync(mcpConfigPath, "utf-8");
      config = JSON.parse(content);
    } catch {
      console.error("Failed to parse VSCode MCP config");
      return;
    }
  }

  if (!config.servers) {
    config.servers = {};
  }

  config.servers[PROJECT_NAME] = {
    type: "stdio",
    command: "bun",
    args: ["run", join(PROJECT_DIR, "dist/index.js")],
  };

  try {
    writeFileSync(mcpConfigPath, JSON.stringify(config, null, 4));
    console.log(`Updated VSCode MCP config: ${mcpConfigPath}`);
  } catch (error) {
    console.error("Failed to write VSCode MCP config:", error);
    // Restore backup if it exists
    const backupPath = `${mcpConfigPath}.backup`;
    if (existsSync(backupPath)) {
      writeFileSync(mcpConfigPath, readFileSync(backupPath, "utf-8"));
      console.log("  Restored from backup");
    }
    throw error;
  }
}

export async function configureCommand(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    return;
  }

  console.log(`\n📦 Configuring ${PROJECT_NAME} MCP server...\n`);

  try {
    await updateClaudeCodeConfig();
  } catch {
    console.error("Failed to update Claude Code config");
  }

  try {
    updateVSCodeMCPConfig();
  } catch {
    console.error("Failed to update VSCode MCP config");
  }

  console.log(`
Configuration complete!

Next steps:
1. Build the server: bun run build
2. Run ingestion: mcp-docs ingest
3. Restart Claude Code or VSCode to load the server
`);
}
