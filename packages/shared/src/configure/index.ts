/**
 * Configure command for MCP servers.
 * Registers the server with Claude Code and VSCode.
 *
 * @example
 * ```ts
 * import { runConfigureCommand } from "@mcp/shared/configure";
 *
 * // Simple server with no env vars
 * await runConfigureCommand({
 *   name: "mcp-todos",
 *   projectDir: "/path/to/mcp-todos",
 * }, args);
 *
 * // Server with required env var
 * await runConfigureCommand({
 *   name: "mcp-docs",
 *   projectDir: "/path/to/mcp-docs",
 *   envVars: [{
 *     name: "OPENAI_API_KEY",
 *     description: "Required for embeddings and search",
 *     required: true,
 *     helpUrl: "https://platform.openai.com/api-keys",
 *   }],
 * }, args);
 * ```
 */

import { prompt } from "../cli/prompt.ts";
import { updateClaudeCodeConfig } from "./claude-code.ts";
import type {
  EnvVarConfig,
  McpServerConfig,
  ResolvedEnvVars,
} from "./types.ts";
import { updateVSCodeMCPConfig } from "./vscode.ts";

export type { EnvVarConfig, McpServerConfig } from "./types.ts";

function getDefaultHelpText(config: McpServerConfig): string {
  const envSection = config.envVars?.length
    ? `\nRequired environment variables:\n${config.envVars.map((e) => `  - ${e.name}: ${e.description}`).join("\n")}\n`
    : "";

  return `
Usage: ${config.name} configure [options]

Options:
  --help, -h  Show this help message

Configures the MCP server in:
  - Claude Code (~/.claude.json)
  - VSCode (~/Library/Application Support/Code/User/mcp.json) - macOS only

The server will be configured to run from the built dist/index.js.
Make sure to run '${config.name} build' first.
${envSection}`;
}

async function getEnvVarValue(envConfig: EnvVarConfig): Promise<string | null> {
  const existingValue = process.env[envConfig.name];

  if (existingValue) {
    const masked = `${existingValue.slice(0, 7)}...${existingValue.slice(-4)}`;
    console.log(`  Found ${envConfig.name} in environment: ${masked}`);
    const useExisting = await prompt("  Use this value? [Y/n]: ");
    if (useExisting.toLowerCase() !== "n") {
      return existingValue;
    }
  }

  console.log(`\n  ${envConfig.name}: ${envConfig.description}`);
  if (envConfig.helpUrl) {
    console.log(`  Get one at: ${envConfig.helpUrl}\n`);
  }

  const value = await prompt(
    `  Enter your ${envConfig.name} (or press Enter to skip): `,
  );

  if (!value) {
    if (envConfig.required) {
      console.log(
        `  Skipping ${envConfig.name}. You'll need to set it manually.`,
      );
    }
    return null;
  }

  return value;
}

async function resolveEnvVars(
  envVars?: EnvVarConfig[],
): Promise<ResolvedEnvVars> {
  if (!envVars?.length) {
    return {};
  }

  const resolved: ResolvedEnvVars = {};

  console.log("Checking for environment variables...");
  for (const envConfig of envVars) {
    const value = await getEnvVarValue(envConfig);
    if (value) {
      resolved[envConfig.name] = value;
    }
  }
  console.log();

  return resolved;
}

export async function runConfigureCommand(
  config: McpServerConfig,
  args: string[],
): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(config.helpText || getDefaultHelpText(config));
    return;
  }

  console.log(`\nConfiguring ${config.name} MCP server...\n`);

  // Resolve environment variables
  const envVars = await resolveEnvVars(config.envVars);

  // Configure Claude Code
  console.log("Configuring Claude Code...");
  try {
    await updateClaudeCodeConfig(config, envVars);
  } catch {
    console.error("  Failed to update Claude Code config");
  }

  // Configure VSCode
  console.log("\nConfiguring VSCode...");
  try {
    await updateVSCodeMCPConfig(config, envVars);
  } catch {
    console.error("  Failed to update VSCode MCP config");
  }

  console.log(`
Configuration complete!

Next steps:
1. Build the server: bun run build
2. Restart Claude Code or VSCode to load the server
`);
}
