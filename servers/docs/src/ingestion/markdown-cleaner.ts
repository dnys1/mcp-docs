/**
 * Markdown content cleaner - removes navigation, TOCs, and other cruft
 * to get to the "meat" of documentation pages.
 */

/**
 * Patterns that indicate a TOC or navigation section header
 */
const TOC_HEADER_PATTERNS = [
  /^#{1,3}\s*(in this (article|page|section|document|guide))/i,
  /^#{1,3}\s*(on this page)/i,
  /^#{1,3}\s*(table of contents)/i,
  /^#{1,3}\s*(contents)/i,
  /^#{1,3}\s*(quick links)/i,
  /^#{1,3}\s*(navigation)/i,
  /^#{1,3}\s*(jump to)/i,
];

/**
 * Patterns for lines to remove entirely
 */
const REMOVE_LINE_PATTERNS = [
  // Breadcrumbs (e.g., "Home > Docs > API > Auth")
  /^[A-Za-z0-9\s]+(\s*[>›»/]\s*[A-Za-z0-9\s]+){2,}\s*$/,
  // "Last updated" / "Edit this page" lines
  /^(last (updated|modified|edited)|updated on|edit this page)/i,
  // Feedback/rating prompts
  /^(was this (page|article|helpful)|rate this|feedback|did this help)/i,
  // "Read time" indicators
  /^\d+\s*min(ute)?s?\s*(read|reading)/i,
  // Share links
  /^(share|tweet|follow us)/i,
  // Cookie/consent related
  /^(we use cookies|cookie (policy|settings)|accept (all )?cookies)/i,
  // Empty links that are just navigation
  /^\[.*\]\(#.*\)$/,
];

/**
 * Patterns for sections to skip entirely (header + content until next header)
 */
const SKIP_SECTION_PATTERNS = [
  /^#{1,3}\s*(related (articles?|pages?|links?|resources?))/i,
  /^#{1,3}\s*(see also)/i,
  /^#{1,3}\s*(next steps)/i,
  /^#{1,3}\s*(additional resources)/i,
  /^#{1,3}\s*(feedback)/i,
  /^#{1,3}\s*(contribute)/i,
  /^#{1,3}\s*(help us improve)/i,
];

/**
 * Check if a line is a markdown header
 */
function _isHeader(line: string): boolean {
  return /^#{1,6}\s+/.test(line.trim());
}

/**
 * Get the header level (1-6) or 0 if not a header
 */
function getHeaderLevel(line: string): number {
  const match = line.trim().match(/^(#{1,6})\s+/);
  // biome-ignore lint/style/noNonNullAssertion: group 1 exists if match exists
  return match ? match[1]!.length : 0;
}

/**
 * Check if line matches any pattern in the list
 */
function matchesAny(line: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(line.trim()));
}

/**
 * Remove TOC sections - these typically have a list of links following a header
 */
function isTocHeader(line: string): boolean {
  return matchesAny(line, TOC_HEADER_PATTERNS);
}

/**
 * Check if this is a skip-section header (related articles, feedback, etc.)
 */
function isSkipSectionHeader(line: string): boolean {
  return matchesAny(line, SKIP_SECTION_PATTERNS);
}

/**
 * Check if line should be removed entirely
 */
function shouldRemoveLine(line: string): boolean {
  const trimmed = line.trim();

  // Keep empty lines for now (we'll collapse them later)
  if (!trimmed) return false;

  return matchesAny(trimmed, REMOVE_LINE_PATTERNS);
}

/**
 * Check if a line looks like a TOC entry (link-only line)
 */
function isTocEntry(line: string): boolean {
  const trimmed = line.trim();
  // Lines that are just markdown links, possibly with list markers
  return /^[-*]?\s*\[.+\]\(.+\)\s*$/.test(trimmed);
}

/**
 * Clean markdown content by removing navigation, TOCs, and other cruft.
 */
export function cleanMarkdown(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];

  let skipUntilHeaderLevel = 0; // If > 0, skip until we see a header of this level or lower
  let inTocSection = false;
  let tocHeaderLevel = 0;
  let consecutiveEmptyLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    const headerLevel = getHeaderLevel(line);

    // Check if we should stop skipping (hit a same-or-higher-level header)
    if (
      skipUntilHeaderLevel > 0 &&
      headerLevel > 0 &&
      headerLevel <= skipUntilHeaderLevel
    ) {
      skipUntilHeaderLevel = 0;
    }

    // Check if we should exit TOC section
    if (inTocSection && headerLevel > 0 && headerLevel <= tocHeaderLevel) {
      inTocSection = false;
      tocHeaderLevel = 0;
    }

    // Skip if we're in a skip section
    if (skipUntilHeaderLevel > 0) {
      continue;
    }

    // Check for skip-section headers (Related Articles, Feedback, etc.)
    if (isSkipSectionHeader(line)) {
      skipUntilHeaderLevel = headerLevel || 1;
      continue;
    }

    // Check for TOC headers
    if (isTocHeader(line)) {
      inTocSection = true;
      tocHeaderLevel = headerLevel || 1;
      continue;
    }

    // Skip TOC entries when in TOC section
    if (inTocSection && (isTocEntry(line) || !trimmed)) {
      continue;
    }

    // If we hit non-TOC content, exit TOC mode
    if (inTocSection && trimmed && !isTocEntry(line)) {
      inTocSection = false;
      tocHeaderLevel = 0;
    }

    // Check if line should be removed
    if (shouldRemoveLine(line)) {
      continue;
    }

    // Handle consecutive empty lines (collapse to max 2)
    if (!trimmed) {
      consecutiveEmptyLines++;
      if (consecutiveEmptyLines > 2) {
        continue;
      }
    } else {
      consecutiveEmptyLines = 0;
    }

    result.push(line);
  }

  // Trim leading/trailing whitespace and collapse excessive newlines
  return result
    .join("\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Truncate content to a maximum character length, trying to break at a sensible point.
 */
export function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }

  // Try to break at a paragraph boundary
  const truncated = content.slice(0, maxLength);
  const lastParagraphBreak = truncated.lastIndexOf("\n\n");

  if (lastParagraphBreak > maxLength * 0.7) {
    return `${truncated.slice(0, lastParagraphBreak)}\n\n[Content truncated...]`;
  }

  // Try to break at a sentence
  const lastSentence = truncated.search(/[.!?]\s+[A-Z][^.!?]*$/);
  if (lastSentence > maxLength * 0.8) {
    return `${truncated.slice(0, lastSentence + 1)}\n\n[Content truncated...]`;
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.9) {
    return `${truncated.slice(0, lastSpace)}...\n\n[Content truncated...]`;
  }

  return `${truncated}...\n\n[Content truncated...]`;
}
