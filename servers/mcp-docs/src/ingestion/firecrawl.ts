import Firecrawl from "@mendable/firecrawl-js";
import type { FetchedDocument } from "../types/index.js";

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
}

export async function crawlWebDocs(
  baseUrl: string,
  options?: CrawlOptions,
): Promise<FetchedDocument[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY environment variable is required");
  }

  console.log(`Crawling ${baseUrl} with Firecrawl...`);
  if (options?.includePaths?.length) {
    console.log(`  Include paths: ${options.includePaths.join(", ")}`);
  }
  if (options?.excludePaths?.length) {
    console.log(`  Exclude paths: ${options.excludePaths.join(", ")}`);
  }

  const firecrawl = new Firecrawl({ apiKey });

  try {
    const result = await firecrawl.crawl(baseUrl, {
      limit: options?.crawlLimit || 100,
      ...(options?.includePaths?.length && { includePaths: options.includePaths }),
      ...(options?.excludePaths?.length && { excludePaths: options.excludePaths }),
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
      },
    });

    console.log(`  Crawled ${result.data?.length || 0} pages`);

    const documents: FetchedDocument[] = (result.data || []).map(
      (page: FirecrawlPage) => {
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
      },
    );

    return documents;
  } catch (error) {
    console.error("Firecrawl error:", error);
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
  return title
    .replace(/\s*[-|–]\s*(Documentation|Docs).*$/i, "")
    .trim();
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
    if (skipUntilNextHeader && trimmed.match(/^#{1,6}\s/) && !isCookieContent(trimmed)) {
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
