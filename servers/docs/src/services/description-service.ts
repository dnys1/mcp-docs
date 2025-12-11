import { openai } from "@ai-sdk/openai";
import { logger } from "@mcp/shared/logger";
import { generateText } from "ai";

const log = logger.child({ service: "DescriptionService" });

/**
 * Generate a description for a documentation source using gpt-4.1-mini.
 * Uses document titles to provide context about what the documentation covers.
 */
export async function generateSourceDescription(
  name: string,
  url: string,
  documentTitles: string[],
): Promise<string> {
  try {
    // Take a sample of titles to provide context
    const sampleTitles = documentTitles.slice(0, 15).join(", ");

    const { text } = await generateText({
      model: openai("gpt-4.1-mini"),
      prompt: `Generate a one-sentence description for a documentation search tool called "${name}" from ${url}.

Sample document titles: ${sampleTitles}

The description should explain what kind of documentation this is and what users can search for. Keep it under 100 characters. Do not include quotes around the response.`,
      maxOutputTokens: 50,
    });

    const description = text.trim();
    log.debug("Generated source description", { name, description });
    return description;
  } catch (error) {
    log.warn("Failed to generate description, using fallback", {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
    return `Search ${name} documentation.`;
  }
}

/**
 * Generate a description for a group of documentation sources.
 * Uses the individual source descriptions to provide context.
 */
export async function generateGroupDescription(
  groupName: string,
  sourceDescriptions: string[],
): Promise<string> {
  try {
    const descList = sourceDescriptions
      .filter((d) => d && !d.startsWith("Search "))
      .slice(0, 5)
      .join("; ");

    // If we don't have meaningful descriptions, use fallback
    if (!descList) {
      return `Search ${groupName} documentation.`;
    }

    const { text } = await generateText({
      model: openai("gpt-4.1-mini"),
      prompt: `Generate a one-sentence description for a documentation search tool that searches across multiple ${groupName} documentation sources.

The individual sources cover: ${descList}

The description should summarize what users can search for across all these sources. Keep it under 100 characters. Do not include quotes around the response.`,
      maxOutputTokens: 50,
    });

    const description = text.trim();
    log.debug("Generated group description", { groupName, description });
    return description;
  } catch (error) {
    log.warn("Failed to generate group description, using fallback", {
      groupName,
      error: error instanceof Error ? error.message : String(error),
    });
    return `Search ${groupName} documentation.`;
  }
}
