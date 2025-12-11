/**
 * Search command - test search modes from CLI
 *
 * Usage:
 *   mcp-docs search <source> <query> [options]
 *
 * Modes:
 *   chunks     - Return raw chunk results (current default)
 *   docs       - Return full cleaned documents
 *   synthesis  - AI-synthesized answer
 */

import { createDbClient } from "../../db/client.js";
import { DocsRepository } from "../../db/repository.js";
import {
  type SynthesisModel,
  synthesizeAnswer,
} from "../../services/synthesis-service.js";
import { ToolService } from "../../services/tool-service.js";

const HELP_TEXT = `
Usage: mcp-docs search <source> <query> [options]

Arguments:
  <source>    Source name to search (e.g., 'playwright')
  <query>     Search query

Options:
  --mode=<mode>       Search mode: chunks, docs, synthesis (default: chunks)
  --model=<model>     Model for synthesis: gpt-4.1-mini, o4-mini, gpt-5 (default: gpt-4.1-mini)
  --limit=<n>         Number of results/documents (default: 5)
  --help, -h          Show this help message

Examples:
  mcp-docs search playwright "how to take screenshot"
  mcp-docs search playwright "authentication" --mode=docs
  mcp-docs search playwright "best practices" --mode=synthesis --model=o4-mini
`;

type SearchMode = "chunks" | "docs" | "synthesis";

function parseArgs(args: string[]): {
  source: string | null;
  query: string | null;
  mode: SearchMode;
  model: SynthesisModel;
  limit: number;
} {
  let source: string | null = null;
  let query: string | null = null;
  let mode: SearchMode = "chunks";
  let model: SynthesisModel = "gpt-4.1-mini";
  let limit = 5;

  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      const m = arg.slice(7);
      if (m === "chunks" || m === "docs" || m === "synthesis") {
        mode = m;
      }
    } else if (arg.startsWith("--model=")) {
      const m = arg.slice(8);
      if (m === "gpt-4.1-mini" || m === "o4-mini" || m === "gpt-5") {
        model = m;
      }
    } else if (arg.startsWith("--limit=")) {
      const l = parseInt(arg.slice(8), 10);
      if (!Number.isNaN(l) && l > 0) {
        limit = l;
      }
    } else if (!arg.startsWith("-")) {
      if (!source) {
        source = arg;
      } else if (!query) {
        query = arg;
      } else {
        // Append to query if multiple words without quotes
        query += ` ${arg}`;
      }
    }
  }

  return { source, query, mode, model, limit };
}

export async function searchCommand(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    return;
  }

  const { source, query, mode, model, limit } = parseArgs(args);

  if (!source || !query) {
    console.error("Error: Both <source> and <query> are required.");
    console.log(HELP_TEXT);
    process.exit(1);
  }

  const db = createDbClient();
  const repo = new DocsRepository(db);
  const toolService = new ToolService(repo);

  // Verify source exists
  const sources = await repo.listSources();
  const sourceExists = sources.some((s) => s.name === source);

  if (!sourceExists) {
    console.error(`Error: Source "${source}" not found.`);
    console.log("\nAvailable sources:");
    for (const s of sources) {
      console.log(`  - ${s.name}`);
    }
    await repo.close();
    process.exit(1);
  }

  console.log(`\n🔍 Searching "${source}" for: ${query}`);
  console.log(`   Mode: ${mode}, Limit: ${limit}`);
  if (mode === "synthesis") {
    console.log(`   Model: ${model}`);
  }
  console.log();

  const startTime = performance.now();

  switch (mode) {
    case "chunks": {
      const result = await toolService.searchSourceDocs(source, {
        query,
        limit,
      });
      const text = result.content[0]?.text || "";
      const totalMs = Math.round(performance.now() - startTime);

      console.log("─".repeat(60));
      console.log(text);
      console.log("─".repeat(60));
      console.log(`\n📊 Stats: ${text.length} chars, ${totalMs}ms`);
      break;
    }

    case "docs": {
      const result = await toolService.searchSourceDocsFullContent(
        source,
        { query, limit },
        { maxTotalChars: 50000 },
      );
      const totalMs = Math.round(performance.now() - startTime);

      console.log("─".repeat(60));
      for (const doc of result.documents) {
        console.log(`## ${doc.title}`);
        console.log(`${doc.url}\n`);
        console.log(doc.content);
        console.log(`\n${"─".repeat(60)}`);
      }
      console.log(
        `\n📊 Stats: ${result.documents.length} docs, ${result.totalChars} chars, ${totalMs}ms${result.truncated ? " (truncated)" : ""}`,
      );
      break;
    }

    case "synthesis": {
      // First get full documents
      const docsResult = await toolService.searchSourceDocsFullContent(
        source,
        { query, limit },
        { maxTotalChars: 50000 },
      );

      if (docsResult.documents.length === 0) {
        console.log("No documents found for synthesis.");
        break;
      }

      // Then synthesize
      const synthResult = await synthesizeAnswer(
        query,
        docsResult.documents,
        model,
      );
      const totalMs = Math.round(performance.now() - startTime);

      console.log("─".repeat(60));
      console.log(synthResult.answer);
      console.log("─".repeat(60));
      console.log(
        `\n📊 Stats: ${docsResult.documents.length} source docs, ${docsResult.totalChars} input chars`,
      );
      console.log(
        `   Model: ${model}, Tokens: ${synthResult.inputTokens} in / ${synthResult.outputTokens} out`,
      );
      console.log(`   Duration: ${totalMs}ms total`);
      break;
    }
  }

  await repo.close();
}
