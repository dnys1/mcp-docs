/**
 * Configure command - set up MCP server in Claude Code / VSCode
 */

import { join } from "node:path";
import { runConfigureCommand } from "@mcp/shared/configure";

const PROJECT_DIR = join(import.meta.dir, "..", "..", "..");

export async function configureCommand(args: string[]) {
  await runConfigureCommand(
    {
      name: "mcp-docs",
      projectDir: PROJECT_DIR,
      envVars: [
        {
          name: "OPENAI_API_KEY",
          description: "Required for embeddings and search queries",
          required: true,
          helpUrl: "https://platform.openai.com/api-keys",
        },
      ],
    },
    args,
  );
}
