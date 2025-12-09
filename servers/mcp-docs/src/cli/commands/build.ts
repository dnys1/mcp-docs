/**
 * Build command - compile the server to dist/
 */

import { join } from "node:path";

const PROJECT_DIR = join(import.meta.dir, "..", "..", "..");

const HELP_TEXT = `
Usage: mcp-docs build

Compiles the MCP server to dist/index.js using Bun's bundler.
The built output is a single file with all dependencies bundled.
`;

export async function buildCommand(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    return;
  }

  console.log("Building mcp-docs server...\n");

  const result = await Bun.build({
    entrypoints: [join(PROJECT_DIR, "src/index.ts")],
    outdir: join(PROJECT_DIR, "dist"),
    target: "bun",
    minify: false,
    sourcemap: "external",
    bytecode: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  });

  if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log("Built successfully:");
  for (const output of result.outputs) {
    const relativePath = output.path.replace(PROJECT_DIR, ".");
    const size = (output.size / 1024).toFixed(1);
    console.log(`  ${relativePath} (${size} KB)`);
  }

  console.log("\nRun with: mcp-docs start");
}
