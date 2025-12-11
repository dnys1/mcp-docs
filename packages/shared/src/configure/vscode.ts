/**
 * VSCode MCP configuration.
 * Updates ~/Library/Application Support/Code/User/mcp.json on macOS.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { prompt } from "../cli/prompt.ts";
import type {
  McpServerConfig,
  ResolvedEnvVars,
  VSCodeMCPConfig,
} from "./types.ts";

export async function updateVSCodeMCPConfig(
  config: McpServerConfig,
  envVars: ResolvedEnvVars,
): Promise<void> {
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

  let vscodeConfig: VSCodeMCPConfig = { servers: {}, inputs: [] };
  if (existsSync(mcpConfigPath)) {
    try {
      const content = readFileSync(mcpConfigPath, "utf-8");
      vscodeConfig = JSON.parse(content);
    } catch {
      console.error("Failed to parse VSCode MCP config");
      return;
    }
  }

  if (!vscodeConfig.servers) {
    vscodeConfig.servers = {};
  }

  const hasEnvVars = Object.keys(envVars).length > 0;

  vscodeConfig.servers[config.name] = {
    type: "stdio",
    command: "bun",
    args: ["run", join(config.projectDir, "dist/index.js")],
    ...(hasEnvVars && { env: envVars }),
  };

  try {
    writeFileSync(mcpConfigPath, JSON.stringify(vscodeConfig, null, 4));
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
