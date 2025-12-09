/**
 * Status command - show server and source statistics
 */

import { createDbClient } from "../../db/client.js";
import { DocsRepository } from "../../db/repository.js";

const HELP_TEXT = `
Usage: mcp-docs status

Shows:
  - Total counts (sources, documents, chunks)
  - Per-source statistics
  - Last ingestion times
`;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return diffMins > 0 ? `${diffMins}m ago` : "just now";
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

export async function statusCommand(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    return;
  }

  const db = createDbClient();
  const repo = new DocsRepository(db);

  console.log("\n📊 MCP Docs Server Status\n");
  console.log("─".repeat(60));

  // Get total stats
  const totals = await repo.getTotalStats();
  console.log(
    `\n📈 Total: ${totals.sources} sources, ${formatNumber(totals.documents)} documents, ${formatNumber(totals.chunks)} chunks\n`,
  );

  // Get source statuses
  const sources = await repo.getSourceStats();

  if (sources.length === 0) {
    console.log(
      "No sources configured yet. Run 'mcp-docs ingest' to get started.\n",
    );
  } else {
    console.log("📚 Sources:\n");

    // Calculate column widths
    const nameWidth = Math.max(6, ...sources.map((s) => s.name.length));
    const typeWidth = Math.max(4, ...sources.map((s) => s.type.length));

    // Header
    console.log(
      `  ${"Name".padEnd(nameWidth)}  ${"Type".padEnd(typeWidth)}  ${"Docs".padStart(6)}  ${"Chunks".padStart(8)}  Last Ingested`,
    );
    console.log(
      `  ${"─".repeat(nameWidth)}  ${"─".repeat(typeWidth)}  ${"─".repeat(6)}  ${"─".repeat(8)}  ${"─".repeat(13)}`,
    );

    // Rows
    for (const source of sources) {
      const lastIngested = formatDate(source.last_ingested_at);
      console.log(
        `  ${source.name.padEnd(nameWidth)}  ${source.type.padEnd(typeWidth)}  ${formatNumber(source.document_count).padStart(6)}  ${formatNumber(source.chunk_count).padStart(8)}  ${lastIngested}`,
      );
    }
    console.log();
  }

  console.log("─".repeat(60));

  await repo.close();
}
