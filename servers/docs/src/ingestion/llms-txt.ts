import type { FetchedDocument, LlmsTxtEntry } from "../types/index.js";

export type LlmsTxtOptions = {
  includeOptional?: boolean;
};

export class LlmsTxtService {
  /**
   * Parse an llms.txt file and extract entries.
   */
  async parse(url: string): Promise<LlmsTxtEntry[]> {
    console.log(`Fetching llms.txt from ${url}...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch llms.txt: ${response.statusText}`);
    }

    const text = await response.text();
    const entries: LlmsTxtEntry[] = [];

    // Get base URL for resolving relative URLs
    const baseUrl = new URL(url);
    const origin = baseUrl.origin;

    const lines = text.split("\n");
    let currentSection = "";
    let isOptionalSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const trimmedLine = line.trim();

      // Handle section headers (## for standard llms.txt format)
      if (trimmedLine.startsWith("## ")) {
        currentSection = trimmedLine.substring(3).trim();
        isOptionalSection = currentSection.toLowerCase().includes("optional");
        continue;
      }

      // Handle single # as title - use it as default section if no ## sections found
      if (trimmedLine.startsWith("# ") && !trimmedLine.startsWith("## ")) {
        // Only set as section if we don't have a section yet (some llms.txt use # for sections)
        if (!currentSection) {
          currentSection = trimmedLine.substring(2).trim();
          isOptionalSection = currentSection.toLowerCase().includes("optional");
        }
        continue;
      }

      const linkMatch = trimmedLine.match(
        /\[([^\]]+)\]\(([^)]+)\)(?:\s*:\s*(.*))?/,
      );
      if (linkMatch && currentSection) {
        const title = linkMatch[1];
        let linkUrl = linkMatch[2];
        const description = linkMatch[3];

        if (title && linkUrl) {
          // Resolve relative URLs against the llms.txt origin
          if (linkUrl.startsWith("/")) {
            linkUrl = `${origin}${linkUrl}`;
          } else if (
            !linkUrl.startsWith("http://") &&
            !linkUrl.startsWith("https://")
          ) {
            // Handle relative paths without leading slash
            linkUrl = new URL(linkUrl, url).href;
          }

          entries.push({
            title: title.trim(),
            url: linkUrl.trim(),
            description: description?.trim(),
            section: currentSection,
            isOptional: isOptionalSection,
          });
        }
      }
    }

    console.log(`  Found ${entries.length} entries`);
    return entries;
  }

  /**
   * Fetch all documents listed in an llms.txt file.
   */
  async fetchDocs(
    llmsTxtUrl: string,
    options?: LlmsTxtOptions,
  ): Promise<FetchedDocument[]> {
    const entries = await this.parse(llmsTxtUrl);

    const filteredEntries = options?.includeOptional
      ? entries
      : entries.filter((e) => !e.isOptional);

    console.log(
      `Fetching ${filteredEntries.length} documents from llms.txt...`,
    );

    const documents: FetchedDocument[] = [];

    for (const entry of filteredEntries) {
      try {
        const doc = await this.fetchDocument(entry);
        documents.push(doc);
        console.log(`  ✓ Fetched: ${entry.title}`);
      } catch (error) {
        console.error(`  ✗ Failed to fetch ${entry.title}: ${error}`);
      }
    }

    return documents;
  }

  private async fetchDocument(entry: LlmsTxtEntry): Promise<FetchedDocument> {
    let url = entry.url;

    // URLs should already be resolved to absolute in parse()
    let response = await fetch(url);

    if (!response.ok && !url.endsWith(".md")) {
      url = `${url}.md`;
      response = await fetch(url);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();

    const path = this.extractPathFromUrl(url);

    return {
      url,
      title: entry.title,
      content,
      path,
      metadata: {
        section: entry.section,
        description: entry.description,
      },
    };
  }

  private extractPathFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      let path = urlObj.pathname;

      if (path.endsWith(".md")) {
        path = path.substring(0, path.length - 3);
      }

      if (path.startsWith("/")) {
        path = path.substring(1);
      }

      return path || "index";
    } catch {
      return "unknown";
    }
  }
}
