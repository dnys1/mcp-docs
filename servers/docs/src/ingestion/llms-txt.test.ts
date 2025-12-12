import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { LlmsTxtService } from "./llms-txt.js";

// Helper to create a typed fetch mock
function mockFetch(impl: (url: string) => Promise<Response>) {
  return impl as unknown as typeof fetch;
}

// Sample llms.txt content for testing
const SAMPLE_LLMS_TXT = `# Bun Documentation

> Bun is a fast JavaScript runtime.

## Getting Started

- [Installation](https://bun.sh/docs/installation): How to install Bun
- [Quick Start](https://bun.sh/docs/quickstart): Get started with Bun

## API Reference

- [Bun.serve](https://bun.sh/docs/api/serve): HTTP server API
- [Bun.file](https://bun.sh/docs/api/file): File system API

## Optional

- [Advanced Config](https://bun.sh/docs/advanced): Advanced configuration options
- [Plugins](https://bun.sh/docs/plugins): Plugin system
`;

const SAMPLE_DOC_CONTENT = `# Installation

Install Bun with one command:

\`\`\`bash
curl -fsSL https://bun.sh/install | bash
\`\`\`
`;

describe("LlmsTxtService.parse", () => {
  let originalFetch: typeof global.fetch;
  let service: LlmsTxtService;

  beforeEach(() => {
    originalFetch = global.fetch;
    service = new LlmsTxtService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("parses llms.txt and extracts entries", async () => {
    global.fetch = mockFetch(() =>
      Promise.resolve(new Response(SAMPLE_LLMS_TXT, { status: 200 })),
    );

    const entries = await service.parse("https://example.com/llms.txt");

    expect(entries).toHaveLength(6);
    expect(entries[0]).toEqual({
      title: "Installation",
      url: "https://bun.sh/docs/installation",
      description: "How to install Bun",
      section: "Getting Started",
      isOptional: false,
    });
  });

  test("detects optional sections", async () => {
    global.fetch = mockFetch(() =>
      Promise.resolve(new Response(SAMPLE_LLMS_TXT, { status: 200 })),
    );

    const entries = await service.parse("https://example.com/llms.txt");

    const optionalEntries = entries.filter((e) => e.isOptional);
    expect(optionalEntries).toHaveLength(2);
    expect(optionalEntries[0]?.title).toBe("Advanced Config");
    expect(optionalEntries[1]?.title).toBe("Plugins");
  });

  test("parses entries without descriptions", async () => {
    const content = `## Docs

- [API](https://example.com/api)
- [Guide](https://example.com/guide)
`;
    global.fetch = mockFetch(() =>
      Promise.resolve(new Response(content, { status: 200 })),
    );

    const entries = await service.parse("https://example.com/llms.txt");

    expect(entries).toHaveLength(2);
    expect(entries[0]?.description).toBeUndefined();
  });

  test("handles entries with colons in description", async () => {
    const content = `## Docs

- [Config](https://example.com/config): Configure options: foo, bar, baz
`;
    global.fetch = mockFetch(() =>
      Promise.resolve(new Response(content, { status: 200 })),
    );

    const entries = await service.parse("https://example.com/llms.txt");

    expect(entries[0]?.description).toBe("Configure options: foo, bar, baz");
  });

  test("includes entries under # header when no ## sections exist yet", async () => {
    // Some llms.txt files (like firecrawl) use # headers with entries directly
    const content = `# Title

Some intro text that should be ignored.

- [Under Title](https://example.com/under-title): This is under the # Title section

## Actual Section

- [Included](https://example.com/included): This should be included
`;
    global.fetch = mockFetch(() =>
      Promise.resolve(new Response(content, { status: 200 })),
    );

    const entries = await service.parse("https://example.com/llms.txt");

    // Both entries should be included - one under "Title", one under "Actual Section"
    expect(entries).toHaveLength(2);
    expect(entries[0]?.title).toBe("Under Title");
    expect(entries[0]?.section).toBe("Title");
    expect(entries[1]?.title).toBe("Included");
    expect(entries[1]?.section).toBe("Actual Section");
  });

  test("handles empty llms.txt", async () => {
    global.fetch = mockFetch(() =>
      Promise.resolve(new Response("", { status: 200 })),
    );

    const entries = await service.parse("https://example.com/llms.txt");

    expect(entries).toHaveLength(0);
  });

  test("handles llms.txt with only sections no entries", async () => {
    const content = `## Section 1

## Section 2

## Section 3
`;
    global.fetch = mockFetch(() =>
      Promise.resolve(new Response(content, { status: 200 })),
    );

    const entries = await service.parse("https://example.com/llms.txt");

    expect(entries).toHaveLength(0);
  });

  test("throws on HTTP error", async () => {
    global.fetch = mockFetch(() =>
      Promise.resolve(
        new Response("Not Found", { status: 404, statusText: "Not Found" }),
      ),
    );

    await expect(service.parse("https://example.com/llms.txt")).rejects.toThrow(
      "Failed to fetch llms.txt",
    );
  });

  test("detects case-insensitive optional sections", async () => {
    const content = `## OPTIONAL Resources

- [Extra](https://example.com/extra): Extra stuff

## optional extras

- [More](https://example.com/more): More stuff
`;
    global.fetch = mockFetch(() =>
      Promise.resolve(new Response(content, { status: 200 })),
    );

    const entries = await service.parse("https://example.com/llms.txt");

    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.isOptional)).toBe(true);
  });

  test("handles multiple sections correctly", async () => {
    global.fetch = mockFetch(() =>
      Promise.resolve(new Response(SAMPLE_LLMS_TXT, { status: 200 })),
    );

    const entries = await service.parse("https://example.com/llms.txt");

    const sections = [...new Set(entries.map((e) => e.section))];
    expect(sections).toContain("Getting Started");
    expect(sections).toContain("API Reference");
    expect(sections).toContain("Optional");
  });
});

describe("LlmsTxtService.fetchDocs", () => {
  let originalFetch: typeof global.fetch;
  let service: LlmsTxtService;

  beforeEach(() => {
    originalFetch = global.fetch;
    service = new LlmsTxtService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("fetches documents from llms.txt entries", async () => {
    let _callCount = 0;
    global.fetch = mockFetch((url: string) => {
      _callCount++;
      if (url.includes("llms.txt")) {
        return Promise.resolve(
          new Response(
            `## Docs
- [Install](https://example.com/install): Installation guide`,
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(SAMPLE_DOC_CONTENT, { status: 200 }));
    });

    const docs = await service.fetchDocs("https://example.com/llms.txt");

    expect(docs).toHaveLength(1);
    expect(docs[0]?.title).toBe("Install");
    expect(docs[0]?.content).toContain("# Installation");
  });

  test("excludes optional entries by default", async () => {
    global.fetch = mockFetch((url: string) => {
      if (url.includes("llms.txt")) {
        return Promise.resolve(
          new Response(
            `## Required
- [Doc1](https://example.com/doc1): Required doc

## Optional
- [Doc2](https://example.com/doc2): Optional doc`,
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response("content", { status: 200 }));
    });

    const docs = await service.fetchDocs("https://example.com/llms.txt");

    expect(docs).toHaveLength(1);
    expect(docs[0]?.title).toBe("Doc1");
  });

  test("includes optional entries when configured", async () => {
    global.fetch = mockFetch((url: string) => {
      if (url.includes("llms.txt")) {
        return Promise.resolve(
          new Response(
            `## Required
- [Doc1](https://example.com/doc1): Required doc

## Optional
- [Doc2](https://example.com/doc2): Optional doc`,
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response("content", { status: 200 }));
    });

    const docs = await service.fetchDocs("https://example.com/llms.txt", {
      includeOptional: true,
    });

    expect(docs).toHaveLength(2);
  });

  test("continues on individual document fetch failure", async () => {
    global.fetch = mockFetch((url: string) => {
      if (url.includes("llms.txt")) {
        return Promise.resolve(
          new Response(
            `## Docs
- [Doc1](https://example.com/doc1): First doc
- [Doc2](https://example.com/doc2): Second doc
- [Doc3](https://example.com/doc3): Third doc`,
            { status: 200 },
          ),
        );
      }
      // Doc2 fails, doc2.md also fails
      if (url.includes("doc2")) {
        return Promise.resolve(
          new Response("Not Found", { status: 404, statusText: "Not Found" }),
        );
      }
      return Promise.resolve(
        new Response(`Content for ${url}`, { status: 200 }),
      );
    });

    const docs = await service.fetchDocs("https://example.com/llms.txt");

    // Should have 2 docs (doc1 and doc3), doc2 failed
    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.title)).toEqual(["Doc1", "Doc3"]);
  });

  test("extracts path from document URL", async () => {
    global.fetch = mockFetch((url: string) => {
      if (url.includes("llms.txt")) {
        return Promise.resolve(
          new Response(
            `## Docs
- [API](https://example.com/docs/api/serve): Server API`,
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response("content", { status: 200 }));
    });

    const docs = await service.fetchDocs("https://example.com/llms.txt");

    expect(docs[0]?.path).toBe("docs/api/serve");
  });

  test("includes metadata in fetched documents", async () => {
    global.fetch = mockFetch((url: string) => {
      if (url.includes("llms.txt")) {
        return Promise.resolve(
          new Response(
            `## Getting Started
- [Install](https://example.com/install): How to install`,
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response("content", { status: 200 }));
    });

    const docs = await service.fetchDocs("https://example.com/llms.txt");

    expect(docs[0]?.metadata).toEqual({
      section: "Getting Started",
      description: "How to install",
    });
  });

  test("tries .md extension on 404", async () => {
    const fetchedUrls: string[] = [];
    global.fetch = mockFetch((url: string) => {
      fetchedUrls.push(url);
      if (url.includes("llms.txt")) {
        return Promise.resolve(
          new Response(
            `## Docs
- [Doc](https://example.com/doc): A doc`,
            { status: 200 },
          ),
        );
      }
      if (url.endsWith(".md")) {
        return Promise.resolve(
          new Response("markdown content", { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response("Not Found", { status: 404, statusText: "Not Found" }),
      );
    });

    const docs = await service.fetchDocs("https://example.com/llms.txt");

    expect(docs).toHaveLength(1);
    expect(fetchedUrls).toContain("https://example.com/doc");
    expect(fetchedUrls).toContain("https://example.com/doc.md");
  });
});
