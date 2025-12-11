import { logger } from "@mcp/shared/logger";
import Firecrawl, { type CrawlJob } from "@mendable/firecrawl-js";
import type { FetchedDocument } from "../types/index.js";

const log = logger.child({ module: "firecrawl" });

interface FirecrawlMetadata {
  title?: string;
  sourceURL?: string;
  ogUrl?: string;
  url?: string;
  [key: string]: unknown;
}

interface FirecrawlPage {
  url?: string;
  markdown?: string;
  metadata?: FirecrawlMetadata;
}

export interface CrawlOptions {
  crawlLimit?: number;
  includePaths?: string[];
  excludePaths?: string[];
  /** URLs already cached - will be converted to exclude paths */
  cachedUrls?: string[];
}

/**
 * Convert full URLs to path patterns for Firecrawl excludePaths.
 */
function urlsToExcludePaths(urls: string[], baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const paths: string[] = [];

  for (const url of urls) {
    try {
      const parsed = new URL(url);
      // Only exclude URLs from the same host
      if (parsed.hostname === base.hostname) {
        // Remove leading slash and add to exclude paths
        const path = parsed.pathname.replace(/^\//, "");
        if (path) {
          paths.push(path);
        }
      }
    } catch {
      // Skip invalid URLs
    }
  }

  return paths;
}

export async function crawlWebDocs(
  baseUrl: string,
  options?: CrawlOptions,
): Promise<FetchedDocument[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY environment variable is required");
  }

  const limit = options?.crawlLimit || 100;

  // Merge cached URLs into exclude paths
  const cachedExcludes = options?.cachedUrls?.length
    ? urlsToExcludePaths(options.cachedUrls, baseUrl)
    : [];
  const excludePaths = [...(options?.excludePaths || []), ...cachedExcludes];

  log.info("Starting crawl", {
    url: baseUrl,
    limit,
    ...(options?.includePaths?.length && {
      includePaths: options.includePaths,
    }),
    ...(options?.excludePaths?.length && {
      excludePaths: options.excludePaths.length,
    }),
    ...(cachedExcludes.length && {
      cached: cachedExcludes.length,
    }),
  });

  const firecrawl = new Firecrawl({ apiKey });

  try {
    // Use async crawl with polling to get progress updates
    const crawlResponse = await firecrawl.startCrawl(baseUrl, {
      limit,
      ...(options?.includePaths?.length && {
        includePaths: options.includePaths,
      }),
      ...(excludePaths.length && {
        excludePaths,
      }),
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
      },
    });

    const crawlId = crawlResponse.id;
    log.debug("Crawl started", { crawlId });

    // Poll for completion with progress updates
    let lastProgress = 0;
    let result: CrawlJob;

    while (true) {
      result = await firecrawl.getCrawlStatus(crawlId);

      if (result.status === "completed") {
        log.info("Crawl completed", {
          pages: result.data?.length || 0,
        });
        break;
      }

      if (result.status === "failed" || result.status === "cancelled") {
        throw new Error(`Crawl ${result.status}`);
      }

      // Log progress updates
      const current = result.completed || 0;
      const total = result.total || limit;
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;

      if (current > lastProgress) {
        log.info("Crawling", {
          progress: `${current}/${total} pages (${pct}%)`,
          status: result.status,
        });
        lastProgress = current;
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const pages = result.data || [];
    log.info("Processing crawled pages", { count: pages.length });

    const documents: FetchedDocument[] = pages.map((page: FirecrawlPage) => {
      // URL can be in different places depending on Firecrawl version
      const pageUrl =
        page.url ||
        page.metadata?.sourceURL ||
        page.metadata?.ogUrl ||
        page.metadata?.url ||
        baseUrl;

      // Use metadata title if available, otherwise extract from markdown
      const title =
        page.metadata?.title || extractTitle(page.markdown || "") || "Untitled";

      // Clean markdown content (remove cookie banners, etc.)
      const content = cleanMarkdown(page.markdown || "");

      return {
        url: pageUrl,
        title: cleanTitle(title),
        content,
        path: extractPath(pageUrl, baseUrl),
        metadata: {
          sourceUrl: page.metadata?.sourceURL,
        },
      };
    });

    return documents;
  } catch (error) {
    log.error("Crawl failed", {
      url: baseUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function extractTitle(markdown: string): string {
  const lines = markdown.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      const title = trimmed.substring(2).trim();
      // Skip cookie/consent headers
      if (!isCookieContent(title)) {
        return title;
      }
    }
  }
  return "Untitled";
}

function cleanTitle(title: string): string {
  // Remove common suffixes
  return title.replace(/\s*[-|–]\s*(Documentation|Docs).*$/i, "").trim();
}

function cleanMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const cleaned: string[] = [];
  let skipUntilNextHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this is a cookie/consent header
    if (trimmed.startsWith("# ") && isCookieContent(trimmed)) {
      skipUntilNextHeader = true;
      continue;
    }

    // Stop skipping when we hit the next real header
    if (
      skipUntilNextHeader &&
      trimmed.match(/^#{1,6}\s/) &&
      !isCookieContent(trimmed)
    ) {
      skipUntilNextHeader = false;
    }

    if (!skipUntilNextHeader) {
      cleaned.push(line);
    }
  }

  return cleaned.join("\n").trim();
}

function isCookieContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return (
    lowerText.includes("cookie") ||
    lowerText.includes("consent") ||
    lowerText.includes("privacy policy") ||
    lowerText.includes("gdpr")
  );
}

function extractPath(pageUrl: string, baseUrl: string): string {
  try {
    const base = new URL(baseUrl);
    const page = new URL(pageUrl);

    if (page.hostname !== base.hostname) {
      return page.pathname.substring(1) || "index";
    }

    let path = page.pathname.substring(base.pathname.length);

    if (path.startsWith("/")) {
      path = path.substring(1);
    }

    if (path === "" || path === "/") {
      return "index";
    }

    if (path.endsWith("/")) {
      path = path.substring(0, path.length - 1);
    }

    return path || "index";
  } catch {
    return "unknown";
  }
}
