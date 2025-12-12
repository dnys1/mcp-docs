/**
 * Source management commands
 */

import { parseArgs } from "node:util";
import { docSourceSchema, SourcesService } from "../../config/user-sources.js";
import { DocsDatabase } from "../../db/client.js";
import { DocsMigrationService } from "../../db/migrations.js";
import { DocsRepository } from "../../db/repository.js";
import type { DocSource } from "../../types/index.js";

const HELP_TEXT = `
Usage: mcp-docs source <subcommand> [options]

Subcommands:
  add <name> <url>    Add a new documentation source (type auto-detected)
  remove <name>       Remove a source (use --all for groups)
  list                List all sources

Add Options:
  --type=<type>          Source type: llms_txt or firecrawl (default: auto-detect)
  --group=<name>         Add source to a group (creates group if needed)
  --crawl-limit=<n>      Max pages to crawl (firecrawl only, default: 100)
  --include-optional     Include optional entries (llms_txt only)
  --include-paths=<p>    Comma-separated paths to include (firecrawl only)
  --exclude-paths=<p>    Comma-separated paths to exclude (firecrawl only)

Remove Options:
  --all                  Required when removing a group (removes all sources in group)

Auto-Detection:
  1. URLs ending in llms.txt or llms-full.txt are used directly
  2. Probes {url}/llms.txt - if found, uses llms_txt
  3. Probes docs.{domain}/llms.txt - if found, uses llms_txt
  4. Probes docs.{domain} - if exists, crawls that subdomain
  5. Falls back to firecrawl on the original URL

Path Filtering:
  When a URL contains a path (e.g., example.com/docs/), only pages under
  that path are crawled by default. Use --include-paths or --exclude-paths
  to customize.

Examples:
  mcp-docs source add react react.dev
  mcp-docs source add azure-core learn.microsoft.com/azure --group=azure
  mcp-docs source add azure-sdk azure.github.io/azure-sdk --group=azure
  mcp-docs source add nextjs nextjs.org/docs --crawl-limit=200
  mcp-docs source list
  mcp-docs source remove react
  mcp-docs source remove azure --all
`;

export async function sourceCommand(args: string[]) {
  const subcommand = args[0];

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    console.log(HELP_TEXT);
    return;
  }

  const db = new DocsDatabase();
  const repo = new DocsRepository(db.client);
  const service = new SourcesService(repo);

  const migrationService = new DocsMigrationService(db.client);
  await migrationService.initialize();

  try {
    switch (subcommand) {
      case "add":
        await handleAdd(args.slice(1), service);
        break;
      case "remove":
        await handleRemove(args.slice(1), service);
        break;
      case "list":
      case "show": // Keep 'show' as an alias for backwards compatibility
        await handleList(service);
        break;
      default:
        // Legacy mode: treat args as add command
        if (args.length >= 2 && !args[0]?.startsWith("-")) {
          await handleAdd(args, service);
        } else {
          console.error(`Unknown subcommand: ${subcommand}`);
          console.log(HELP_TEXT);
          process.exit(1);
        }
    }
  } finally {
    await repo.close();
  }
}

/**
 * Normalize a URL input - add https:// if no protocol specified.
 */
function normalizeUrl(input: string): string {
  if (!input.includes("://")) {
    return `https://${input}`;
  }
  return input;
}

interface DetectedSource {
  type: "llms_txt" | "firecrawl";
  url: string;
  // For firecrawl: auto-detected include paths based on URL path
  includePaths?: string[];
}

/**
 * Check if a URL is reachable (returns 2xx or 3xx).
 */
async function urlExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok || (response.status >= 300 && response.status < 400);
  } catch {
    return false;
  }
}

/**
 * Try to find llms.txt at a given origin.
 */
async function findLlmsTxt(
  origin: string,
  label: string,
): Promise<string | null> {
  const llmsTxtUrl = `${origin}/llms.txt`;
  console.log(`Checking for llms.txt at ${llmsTxtUrl}...`);

  if (await urlExists(llmsTxtUrl)) {
    console.log(`  Found llms.txt at ${label}`);
    return llmsTxtUrl;
  }
  return null;
}

/**
 * Get the docs subdomain URL for a given hostname.
 * e.g., "example.com" -> "docs.example.com"
 *       "docs.example.com" -> null (already a docs subdomain)
 */
function getDocsSubdomain(hostname: string): string | null {
  // Don't add docs. if already on a docs subdomain
  if (hostname.startsWith("docs.")) {
    return null;
  }
  return `docs.${hostname}`;
}

/**
 * Auto-detect source type by probing for llms.txt.
 * Also checks docs.{domain} subdomain and extracts path prefixes.
 */
async function detectSourceType(input: string): Promise<DetectedSource> {
  const baseUrl = normalizeUrl(input);
  const parsed = new URL(baseUrl);

  // If URL already points to llms.txt, use it directly
  if (
    parsed.pathname.endsWith("llms.txt") ||
    parsed.pathname.endsWith("llms-full.txt")
  ) {
    return { type: "llms_txt", url: baseUrl };
  }

  // 1. Try llms.txt at the provided URL's origin
  const llmsTxt = await findLlmsTxt(parsed.origin, parsed.hostname);
  if (llmsTxt) {
    return { type: "llms_txt", url: llmsTxt };
  }

  // 2. Try docs.{domain} subdomain if not already on one
  const docsSubdomain = getDocsSubdomain(parsed.hostname);
  if (docsSubdomain) {
    const docsOrigin = `${parsed.protocol}//${docsSubdomain}`;

    // Check for llms.txt at docs subdomain
    const docsLlmsTxt = await findLlmsTxt(docsOrigin, docsSubdomain);
    if (docsLlmsTxt) {
      return { type: "llms_txt", url: docsLlmsTxt };
    }

    // Check if docs subdomain exists at all
    console.log(`Checking if ${docsSubdomain} exists...`);
    if (await urlExists(docsOrigin)) {
      console.log(`  Found docs subdomain: ${docsSubdomain}`);
      return { type: "firecrawl", url: docsOrigin };
    }
    console.log(`  No docs subdomain found`);
  }

  console.log(`  Will use firecrawl for ${parsed.origin}`);

  // For firecrawl, check if URL has a path prefix to filter by
  const pathPrefix = extractPathPrefix(parsed.pathname);
  if (pathPrefix) {
    console.log(`  Detected path prefix: /${pathPrefix}/`);
    return {
      type: "firecrawl",
      url: baseUrl,
      includePaths: [`${pathPrefix}/*`],
    };
  }

  return { type: "firecrawl", url: baseUrl };
}

/**
 * Extract the full path prefix from a URL pathname.
 * e.g., "/docs/" -> "docs", "/en-us/azure/ai-foundry/" -> "en-us/azure/ai-foundry"
 */
function extractPathPrefix(pathname: string): string | null {
  // Remove leading/trailing slashes
  const cleaned = pathname.replace(/^\/|\/$/g, "");

  // If there's a meaningful path, return the full path
  if (cleaned && cleaned !== "") {
    return cleaned;
  }

  return null;
}

async function handleAdd(args: string[], service: SourcesService) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: mcp-docs source add <name> <url> [options]

Options:
  --type=<type>          Source type: llms_txt or firecrawl (default: auto-detect)
  --group=<name>         Add source to a group (creates group if needed)
  --crawl-limit=<n>      Max pages to crawl (firecrawl only, default: 100)
  --include-optional     Include optional entries (llms_txt only)
  --include-paths=<p>    Comma-separated paths to include (firecrawl only)
  --exclude-paths=<p>    Comma-separated paths to exclude (firecrawl only)

Examples:
  mcp-docs source add react react.dev
  mcp-docs source add openai platform.openai.com/docs --type=firecrawl
  mcp-docs source add azure-core learn.microsoft.com/azure --group=azure
  mcp-docs source add nextjs nextjs.org/docs --crawl-limit=200
`);
    return;
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      type: { type: "string" },
      group: { type: "string" },
      "crawl-limit": { type: "string" },
      "include-optional": { type: "boolean", default: false },
      "include-paths": { type: "string" },
      "exclude-paths": { type: "string" },
    },
    allowPositionals: true,
  });

  if (positionals.length < 2) {
    console.error("Error: add requires <name> <url>");
    console.log("\nUsage: mcp-docs source add <name> <url> [options]");
    console.log("Run 'mcp-docs source add --help' for more options.");
    process.exit(1);
  }

  const [name, urlInput] = positionals;

  if (!name || !urlInput) {
    console.error("Error: name and url are required");
    process.exit(1);
  }

  // Validate explicit type if provided
  if (
    values.type &&
    values.type !== "llms_txt" &&
    values.type !== "firecrawl"
  ) {
    console.error(
      `Error: invalid type '${values.type}'. Must be 'llms_txt' or 'firecrawl'.`,
    );
    process.exit(1);
  }

  // Use explicit type or auto-detect
  let detected: DetectedSource;

  if (values.type) {
    // Explicit type - skip auto-detection
    detected = {
      type: values.type as "llms_txt" | "firecrawl",
      url: normalizeUrl(urlInput),
    };
    console.log(`Using explicit type: ${detected.type}`);
  } else {
    // Auto-detect type by probing for llms.txt
    detected = await detectSourceType(urlInput);
  }

  // Build source object
  const source: DocSource = {
    name,
    type: detected.type,
    url: detected.url,
  };

  // Add to group if specified
  if (values.group) {
    source.groupName = values.group;
  }

  // Build options
  const hasOptions =
    values["crawl-limit"] ||
    values["include-optional"] ||
    values["include-paths"] ||
    values["exclude-paths"] ||
    detected.includePaths;

  if (hasOptions) {
    source.options = {};

    if (values["crawl-limit"]) {
      const limit = parseInt(values["crawl-limit"], 10);
      if (Number.isNaN(limit) || limit <= 0) {
        console.error("Error: --crawl-limit must be a positive number");
        process.exit(1);
      }
      source.options.crawlLimit = limit;
    }

    if (values["include-optional"]) {
      source.options.includeOptional = true;
    }

    // Include paths: CLI flag takes precedence over auto-detected
    if (values["include-paths"]) {
      source.options.includePaths = values["include-paths"]
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    } else if (detected.includePaths) {
      source.options.includePaths = detected.includePaths;
    }

    // Exclude paths
    if (values["exclude-paths"]) {
      source.options.excludePaths = values["exclude-paths"]
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    }
  }

  // Validate with schema
  try {
    docSourceSchema.parse(source);
  } catch (error) {
    console.error("Error: Invalid source configuration");
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }

  // Save the source
  await service.saveSource(source);
  console.log(`\nAdded source '${name}'`);
  console.log(`  Type: ${detected.type}`);
  console.log(`  URL: ${detected.url}`);
  if (source.groupName) {
    console.log(`  Group: ${source.groupName}`);
  }
  if (source.options) {
    if (source.options.crawlLimit) {
      console.log(`  Crawl limit: ${source.options.crawlLimit}`);
    }
    if (source.options.includePaths?.length) {
      console.log(`  Include paths: ${source.options.includePaths.join(", ")}`);
    }
    if (source.options.excludePaths?.length) {
      console.log(`  Exclude paths: ${source.options.excludePaths.join(", ")}`);
    }
  }
  console.log(`\nTo ingest: mcp-docs ingest --source=${name}`);
}

async function handleRemove(args: string[], service: SourcesService) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: mcp-docs source remove <name> [options]

Options:
  --all    Required when removing a group (removes all sources in group)

Examples:
  mcp-docs source remove react
  mcp-docs source remove azure --all
`);
    return;
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      all: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  if (positionals.length < 1) {
    console.error("Error: remove requires <name>");
    console.log("Run 'mcp-docs source remove --help' for usage.");
    process.exit(1);
  }

  const name = positionals[0];
  if (!name) {
    console.error("Error: source name is required");
    process.exit(1);
  }

  // Check if this is a group name
  const isGroup = await service.isGroup(name);

  if (isGroup) {
    if (!values.all) {
      const sources = await service.getSourcesInGroup(name);
      console.error(
        `Error: '${name}' is a group with ${sources.length} sources.`,
      );
      console.error(`Use --all to remove the entire group.`);
      console.error(`\nSources in group:`);
      for (const source of sources) {
        console.error(`  - ${source.name}`);
      }
      process.exit(1);
    }

    // Remove the entire group
    const removedNames = await service.removeGroup(name);
    console.log(`Removed group '${name}' and ${removedNames.length} sources:`);
    for (const sourceName of removedNames) {
      console.log(`  - ${sourceName}`);
    }
    return;
  }

  // It's a regular source
  const removed = await service.removeSource(name);

  if (removed) {
    console.log(`Removed source '${name}' and all associated data`);
  } else {
    console.error(`Error: Source '${name}' not found`);
    process.exit(1);
  }
}

async function handleList(service: SourcesService) {
  const sources = await service.listSources();

  if (sources.length === 0) {
    console.log("No sources found.");
    console.log("\nTo add a source: mcp-docs source add <name> <url>");
    return;
  }

  // Organize sources by group
  const groups = new Map<string, DocSource[]>();
  const standalone: DocSource[] = [];

  for (const source of sources) {
    if (source.groupName) {
      const group = groups.get(source.groupName) || [];
      group.push(source);
      groups.set(source.groupName, group);
    } else {
      standalone.push(source);
    }
  }

  console.log("Sources:\n");

  // Print groups first
  const groupNames = Array.from(groups.keys()).sort();
  for (const groupName of groupNames) {
    const groupSources = groups.get(groupName) || [];
    console.log(`├─ ${groupName} (group, ${groupSources.length} sources)`);

    for (let i = 0; i < groupSources.length; i++) {
      const source = groupSources[i];
      if (!source) continue;
      const isLast = i === groupSources.length - 1;
      const prefix = isLast ? "└─" : "├─";
      const padUrl =
        source.url.length > 40 ? `${source.url.slice(0, 37)}...` : source.url;
      console.log(
        `│  ${prefix} ${source.name.padEnd(16)} ${padUrl.padEnd(42)} ${source.type}`,
      );
    }
  }

  // Print standalone sources
  for (let i = 0; i < standalone.length; i++) {
    const source = standalone[i];
    if (!source) continue;
    const isLast = i === standalone.length - 1 && groups.size === 0;
    const prefix = isLast ? "└─" : "├─";
    const padUrl =
      source.url.length > 40 ? `${source.url.slice(0, 37)}...` : source.url;
    console.log(
      `${prefix} ${source.name.padEnd(16)} ${padUrl.padEnd(42)} ${source.type}`,
    );
  }

  // Summary
  const groupCount = groups.size;
  const sourceCount = sources.length;
  if (groupCount > 0) {
    console.log(`\n${sourceCount} sources (${groupCount} groups)`);
  } else {
    console.log(`\n${sourceCount} sources`);
  }
}
