/**
 * Configure command - set up MCP server in Claude Code / VSCode
 */

import { join } from "node:path";
import { runConfigureCommand } from "@mcp/shared/configure";

const PROJECT_DIR = join(import.meta.dir, "..", "..", "..");

export async function configureCommand(args: string[]) {
  await runConfigureCommand(
    {
      name: "mcp-todos",
      projectDir: PROJECT_DIR,
      // No env vars required for mcp-todos
    },
    args,
  );
}
