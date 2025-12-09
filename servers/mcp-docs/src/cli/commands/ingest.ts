/**
 * Ingest command - fetch and process documentation
 */

import { SourcesService } from "../../config/user-sources.js";
import { createDbClient } from "../../db/client.js";
import { initializeDatabase } from "../../db/migrations.js";
import { DocsRepository } from "../../db/repository.js";
import {
  type DryRunResult,
  IngestionService,
} from "../../services/ingestion-service.js";
import { logger } from "../../utils/logger.js";

const HELP_TEXT = `
Usage: mcp-docs ingest [options]

Options:
  --source=<name>   Ingest only the specified source
  --resume          Resume from last incomplete ingestion
  --dry-run         Preview what would be ingested without writing to DB
  --help, -h        Show this help message

Examples:
  mcp-docs ingest                      # Ingest all sources
  mcp-docs ingest --source=bun         # Ingest only 'bun' source
  mcp-docs ingest --dry-run            # Preview all sources
  mcp-docs ingest --source=bun --dry-run
`;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function printDryRunResult(result: DryRunResult): void {
  console.log(`\n📋 Dry Run Results for "${result.source}"\n`);
  console.log("─".repeat(70));
  console.log(`  Documents: ${result.documentCount}`);
  console.log(`  Total content size: ${formatBytes(result.totalContentSize)}`);
  console.log(`  Estimated chunks: ~${result.estimatedTotalChunks}`);
  console.log("─".repeat(70));

  if (result.documents.length > 0) {
    console.log("\n  Documents to ingest:\n");

    const titleWidth = Math.min(
      40,
      Math.max(...result.documents.map((d) => d.title.length)),
    );

    for (const doc of result.documents) {
      const title =
        doc.title.length > titleWidth
          ? `${doc.title.slice(0, titleWidth - 3)}...`
          : doc.title.padEnd(titleWidth);
      const size = formatBytes(doc.contentLength).padStart(10);
      const chunks = `~${doc.estimatedChunks} chunks`.padStart(12);
      console.log(`    ${title}  ${size}  ${chunks}`);
    }
  }

  console.log("\n─".repeat(70));
  console.log("  Run without --dry-run to actually ingest these documents\n");
}

export async function ingestCommand(args: string[]) {
  // Parse flags
  const sourceFlag = args.find((arg) => arg.startsWith("--source="));
  const targetSource = sourceFlag?.split("=")[1];
  const resume = args.includes("--resume");
  const dryRun = args.includes("--dry-run");

  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    return;
  }

  if (dryRun) {
    console.log(
      "\n🔍 DRY RUN MODE - No changes will be made to the database\n",
    );
  } else {
    logger.info("Starting documentation ingestion...");
  }

  const db = createDbClient();
  const repo = new DocsRepository(db);
  const ingestionService = new IngestionService(repo);
  const sourcesService = new SourcesService(repo);

  await initializeDatabase(db);

  // Load all sources from database
  const allSources = await sourcesService.getAllSources();

  const sourcesToIngest = targetSource
    ? allSources.filter((s) => s.name === targetSource)
    : allSources;

  if (sourcesToIngest.length === 0) {
    logger.error(`Source "${targetSource}" not found`);
    process.exit(1);
  }

  if (!dryRun) {
    logger.info(`Ingesting ${sourcesToIngest.length} source(s)`, {
      resume,
      sources: sourcesToIngest.map((s) => s.name),
    });
  }

  for (const source of sourcesToIngest) {
    try {
      const result = await ingestionService.ingestSource(source, {
        resume,
        dryRun,
      });

      if (dryRun && result) {
        printDryRunResult(result);
      }
    } catch (error) {
      logger.error(`Failed to ingest ${source.name}`, {
        source: source.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await repo.close();

  if (!dryRun) {
    logger.info("Ingestion complete!");
  }
}
