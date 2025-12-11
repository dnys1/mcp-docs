/**
 * AI-powered synthesis service for generating answers from documentation.
 * Supports multiple OpenAI models for comparison and experimentation.
 */

import { openai } from "@ai-sdk/openai";
import { logger } from "@mcp/shared/logger";
import { generateText } from "ai";

const log = logger.child({ service: "SynthesisService" });

export type SynthesisModel = "gpt-4.1-mini" | "o4-mini" | "gpt-5";

export interface SynthesisDocument {
  title: string;
  url: string;
  content: string;
}

export interface SynthesisResult {
  answer: string;
  model: SynthesisModel;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

const SYNTHESIS_PROMPT = `You are a documentation assistant. Answer the user's question using ONLY the provided documentation.

Guidelines:
- Include code snippets, commands, configurations, and technical details VERBATIM - do not paraphrase technical content
- Summarize explanatory prose in your own words for clarity
- Cite sources inline using markdown links: [Page Title](url)
- If the answer is not in the documentation, clearly state "This information is not in the provided documentation"
- Be concise but complete - include all relevant information
- Format code with proper markdown code blocks and language tags`;

/**
 * Synthesize an answer from documentation using an LLM.
 */
export async function synthesizeAnswer(
  query: string,
  documents: SynthesisDocument[],
  model: SynthesisModel = "gpt-4.1-mini",
): Promise<SynthesisResult> {
  const startTime = performance.now();

  // Format documents for the prompt
  const docsText = documents
    .map(
      (doc, i) =>
        `### Document ${i + 1}: ${doc.title}\nURL: ${doc.url}\n\n${doc.content}`,
      ``,
    )
    .join("\n\n---\n\n");

  const userPrompt = `Question: ${query}

Source Documentation:

${docsText}`;

  log.debug("Starting synthesis", {
    model,
    query: query.slice(0, 50),
    documentCount: documents.length,
    totalChars: docsText.length,
  });

  const llm = openai(model);

  // Reasoning models (o4-mini) don't support temperature
  const isReasoningModel = model.startsWith("o");

  const result = await generateText({
    model: llm,
    system: SYNTHESIS_PROMPT,
    prompt: userPrompt,
    maxOutputTokens: 4096,
    ...(isReasoningModel ? {} : { temperature: 0 }),
  });

  const durationMs = Math.round(performance.now() - startTime);

  log.info("Synthesis completed", {
    model,
    query: query.slice(0, 50),
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    durationMs,
  });

  return {
    answer: result.text,
    model,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    durationMs,
  };
}
