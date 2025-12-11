/**
 * Claude Code configuration for MCP servers.
 * Uses the `claude mcp add/remove` CLI commands.
 */

import { execSync } from "node:child_process";
import { join } from "node:path";
import type { McpServerConfig, ResolvedEnvVars } from "./types.ts";

export async function updateClaudeCodeConfig(
  config: McpServerConfig,
  envVars: ResolvedEnvVars,
): Promise<void> {
  const distPath = join(config.projectDir, "dist/index.js");

  // Build env flags for the claude mcp add command
  const envFlags = Object.entries(envVars)
    .map(([key, value]) => `-e ${key}=${value}`)
    .join(" ");

  // First, try to remove existing config (ignore errors if it doesn't exist)
  try {
    console.log(`  Removing existing ${config.name} config if present...`);
    execSync(`claude mcp remove ${config.name} --scope user`, {
      stdio: "pipe",
    });
    console.log("  Removed existing config");
  } catch {
    // Ignore - server might not exist yet
    console.log("  No existing config found");
  }

  // Now add the config
  try {
    const command =
      `claude mcp add ${config.name} --scope user ${envFlags} -- bun run ${distPath}`.trim();

    console.log(`  Adding ${config.name} to Claude Code...`);
    execSync(command, { stdio: "pipe" });
    console.log("  Updated Claude Code config");
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
      // Don't print the full error message as it may contain API keys
      console.error("  Failed to add MCP server to Claude Code");
      const firstEnvVar = config.envVars?.[0];
      const envExample = firstEnvVar
        ? ` -e ${firstEnvVar.name}=<your-key>`
        : "";
      console.error(
        `  Try running manually: claude mcp add ${config.name} --scope user${envExample} -- bun run dist/index.js`,
      );
    }
    throw error;
  }
}
