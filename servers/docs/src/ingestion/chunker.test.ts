import { describe, expect, test } from "bun:test";
import { chunkDocument } from "./chunker.js";

describe("chunkDocument", () => {
  describe("basic chunking", () => {
    test("returns single chunk for small content", async () => {
      const content = "This is a small piece of content.";
      const chunks = await chunkDocument(content);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(content);
    });

    test("returns empty array for empty content", async () => {
      const chunks = await chunkDocument("");
      expect(chunks).toHaveLength(0);
    });

    test("returns empty array for whitespace-only content", async () => {
      const chunks = await chunkDocument("   \n\n   \t  ");
      expect(chunks).toHaveLength(0);
    });

    test("trims whitespace from chunks", async () => {
      const content = "  Some content with whitespace  ";
      const chunks = await chunkDocument(content);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe("Some content with whitespace");
    });
  });

  describe("markdown content", () => {
    test("handles content with markdown headers", async () => {
      const content = `# Header 1
Content under header 1.

# Header 2
Content under header 2.`;

      const chunks = await chunkDocument(content);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      // Content should be preserved
      const joined = chunks.join("\n");
      expect(joined).toContain("Header 1");
      expect(joined).toContain("Header 2");
    });

    test("handles different header levels", async () => {
      const content = `# H1
Content 1

## H2
Content 2

### H3
Content 3`;

      const chunks = await chunkDocument(content);
      const joined = chunks.join("\n");

      expect(joined).toContain("H1");
      expect(joined).toContain("H2");
      expect(joined).toContain("H3");
    });

    test("preserves code blocks", async () => {
      const content = `# Code Example

\`\`\`javascript
function hello() {
  console.log("Hello, world!");
}
\`\`\`

Some text after code.`;

      const chunks = await chunkDocument(content);
      const joined = chunks.join("\n");

      expect(joined).toContain("```javascript");
      expect(joined).toContain('console.log("Hello, world!")');
    });

    test("preserves markdown formatting", async () => {
      const content = `# Title

**Bold text** and *italic text*.

- List item 1
- List item 2

> Blockquote here`;

      const chunks = await chunkDocument(content);
      const joined = chunks.join("\n");

      expect(joined).toContain("**Bold text**");
      expect(joined).toContain("*italic text*");
      expect(joined).toContain("- List item");
      expect(joined).toContain("> Blockquote");
    });
  });

  describe("large content chunking", () => {
    test("splits large content into multiple chunks", async () => {
      // Create content that exceeds default maxSize (512 chars)
      const paragraph = "This is a test paragraph with some content. ".repeat(
        30,
      );
      const content = `# Section 1\n${paragraph}\n\n# Section 2\n${paragraph}`;

      const chunks = await chunkDocument(content);

      expect(chunks.length).toBeGreaterThan(1);
    });

    test("respects custom maxSize option", async () => {
      // Create content around 1000 chars
      const content = "Word ".repeat(200);

      const chunksDefault = await chunkDocument(content);
      const chunksSmall = await chunkDocument(content, { maxSize: 100 });

      expect(chunksSmall.length).toBeGreaterThanOrEqual(chunksDefault.length);
    });

    test("chunks stay within size limits", async () => {
      const content = "This is a sentence. ".repeat(100);
      const maxSize = 200;

      const chunks = await chunkDocument(content, { maxSize });

      // Most chunks should be at or below the max size
      // (some may be slightly over due to not breaking mid-word)
      const oversizedChunks = chunks.filter((c) => c.length > maxSize * 1.5);
      expect(oversizedChunks.length).toBe(0);
    });
  });

  describe("overlap functionality", () => {
    test("adds overlap between chunks when specified", async () => {
      const content = "Sentence one. ".repeat(50) + "Sentence two. ".repeat(50);

      const chunksWithOverlap = await chunkDocument(content, {
        maxSize: 200,
        overlap: 50,
      });

      const chunksNoOverlap = await chunkDocument(content, {
        maxSize: 200,
        overlap: 0,
      });

      // With overlap, we may have more or same number of chunks
      // but the total character count should be higher
      if (chunksWithOverlap.length > 1) {
        const totalWithOverlap = chunksWithOverlap.reduce(
          (sum, c) => sum + c.length,
          0,
        );
        const totalNoOverlap = chunksNoOverlap.reduce(
          (sum, c) => sum + c.length,
          0,
        );
        expect(totalWithOverlap).toBeGreaterThanOrEqual(totalNoOverlap);
      }
    });
  });

  describe("custom options", () => {
    test("uses default options when none provided", async () => {
      const content = "Test content";
      const chunks = await chunkDocument(content);

      expect(chunks).toHaveLength(1);
    });

    test("accepts partial options", async () => {
      const content = "Test sentence. ".repeat(50);

      // Only override maxSize
      const chunks = await chunkDocument(content, { maxSize: 100 });

      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe("edge cases", () => {
    test("handles single word content", async () => {
      const chunks = await chunkDocument("Hello");

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe("Hello");
    });

    test("handles content with special characters", async () => {
      const content =
        "Content with émojis 🎉 and spëcial çharacters: @#$%^&*()";
      const chunks = await chunkDocument(content);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain("émojis");
      expect(chunks[0]).toContain("🎉");
    });

    test("handles content with only headers", async () => {
      const content = `# Header 1
# Header 2
# Header 3`;

      const chunks = await chunkDocument(content);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    test("handles very long lines", async () => {
      const longLine = "word ".repeat(500);
      const chunks = await chunkDocument(longLine, { maxSize: 200 });

      expect(chunks.length).toBeGreaterThan(1);
    });

    test("handles mixed content types", async () => {
      const content = `# Documentation

Here is some text with **bold** and *italic*.

## Code Example

\`\`\`ts
const x = 1;
\`\`\`

## List

- Item 1
- Item 2

> A quote

| Table | Header |
|-------|--------|
| Cell  | Cell   |`;

      const chunks = await chunkDocument(content);
      const joined = chunks.join("\n");

      expect(joined).toContain("Documentation");
      expect(joined).toContain("const x = 1");
      expect(joined).toContain("- Item");
    });
  });
});
