/**
 * Configure command - set up MCP server in Claude Code / VSCode
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as readline from "node:readline";

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
  --help, -h  Show this help message

Configures the MCP server in:
  - Claude Code (~/.claude.json)
  - VSCode (~/Library/Application Support/Code/User/mcp.json) - macOS only

The server will be configured to run from the built dist/index.js.
Make sure to run 'mcp-docs build' first.

Required environment variables:
  - OPENAI_API_KEY: Required for embeddings and search queries
`;

/**
 * Prompt the user for input.
 */
async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Get the OpenAI API key from environment or prompt the user.
 */
async function getOpenAIApiKey(): Promise<string | null> {
  const existingKey = process.env.OPENAI_API_KEY;

  if (existingKey) {
    const masked = `${existingKey.slice(0, 7)}...${existingKey.slice(-4)}`;
    console.log(`  Found OPENAI_API_KEY in environment: ${masked}`);
    const useExisting = await prompt("  Use this key? [Y/n]: ");
    if (useExisting.toLowerCase() !== "n") {
      return existingKey;
    }
  }

  console.log("\n  OPENAI_API_KEY is required for embeddings and search.");
  console.log("  Get one at: https://platform.openai.com/api-keys\n");

  const key = await prompt(
    "  Enter your OpenAI API key (or press Enter to skip): ",
  );

  if (!key) {
    console.log(
      "  Skipping API key configuration. You'll need to set OPENAI_API_KEY manually.",
    );
    return null;
  }

  return key;
}

async function updateClaudeCodeConfig(openaiKey: string | null) {
  const distPath = join(PROJECT_DIR, "dist/index.js");
  const envFlags = openaiKey ? `-e OPENAI_API_KEY=${openaiKey}` : "";

  // First, try to remove existing config (ignore errors if it doesn't exist)
  try {
    console.log(`  Removing existing ${PROJECT_NAME} config if present...`);
    execSync(`claude mcp remove ${PROJECT_NAME} --scope user`, {
      stdio: "pipe",
    });
    console.log(`  Removed existing config`);
  } catch {
    // Ignore - server might not exist yet
    console.log(`  No existing config found`);
  }

  // Now add the config
  try {
    const command = `claude mcp add ${PROJECT_NAME} --scope user ${envFlags} -- bun run ${distPath}`;

    console.log(`  Adding ${PROJECT_NAME} to Claude Code...`);
    execSync(command, { stdio: "pipe" });
    console.log(`  Updated Claude Code config`);
  } catch (error: unknown) {
    const execError = error as {
      status?: number;
      message?: string;
      stderr?: Buffer;
    };
    if (execError.status === 127) {
      console.error(
        "  Claude Code CLI not found. Please install it first: https://claude.ai/code",
      );
    } else {
      // Don't print the full error message as it may contain the API key
      console.error("  Failed to add MCP server to Claude Code");
      console.error(
        "  Try running manually: claude mcp add mcp-docs --scope user -e OPENAI_API_KEY=<your-key> -- bun run dist/index.js",
      );
    }
    throw error;
  }
}

async function updateVSCodeMCPConfig(openaiKey: string | null) {
  // Only supported on macOS for now
  if (process.platform !== "darwin") {
    console.log("  VSCode configuration is only supported on macOS");
    return;
  }

  const vscodeDir = join(
    homedir(),
    "Library",
    "Application Support",
    "Code",
    "User",
  );
  const mcpConfigPath = join(vscodeDir, "mcp.json");

  if (!existsSync(vscodeDir)) {
    console.log("  VSCode user directory not found, skipping");
    return;
  }

  // If mcp.json doesn't exist, ask if they want to create it
  if (!existsSync(mcpConfigPath)) {
    const create = await prompt(
      "  VSCode mcp.json not found. Create it? [Y/n]: ",
    );
    if (create.toLowerCase() === "n") {
      console.log("  Skipping VSCode configuration");
      return;
    }
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
    ...(openaiKey && {
      env: {
        OPENAI_API_KEY: openaiKey,
      },
    }),
  };

  try {
    writeFileSync(mcpConfigPath, JSON.stringify(config, null, 4));
    console.log(`  Updated VSCode MCP config: ${mcpConfigPath}`);
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

  // Get OpenAI API key
  console.log("Checking for OpenAI API key...");
  const openaiKey = await getOpenAIApiKey();
  console.log();

  // Configure Claude Code
  console.log("Configuring Claude Code...");
  try {
    await updateClaudeCodeConfig(openaiKey);
  } catch {
    console.error("  Failed to update Claude Code config");
  }

  // Configure VSCode
  console.log("\nConfiguring VSCode...");
  try {
    await updateVSCodeMCPConfig(openaiKey);
  } catch {
    console.error("  Failed to update VSCode MCP config");
  }

  console.log(`
Configuration complete!

Next steps:
1. Build the server: bun run build
2. Run ingestion: mcp-docs ingest
3. Restart Claude Code or VSCode to load the server
`);
}
