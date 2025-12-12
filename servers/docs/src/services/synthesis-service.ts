/**
 * AI-powered synthesis service for generating answers from documentation.
 * Supports multiple OpenAI models for comparison and experimentation.
 */

import { logger } from "@mcp/shared/logger";
import type { LanguageModel } from "ai";
import { generateText } from "ai";

export type SynthesisModel = "gpt-4.1-mini" | "o4-mini" | "gpt-5";

export type SynthesisDocument = {
  title: string;
  url: string;
  content: string;
};

export type SynthesisResult = {
  answer: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
};

const SYNTHESIS_PROMPT = `You are a documentation assistant. Answer the user's question using ONLY the provided documentation.

Guidelines:
- Include code snippets, commands, configurations, and technical details VERBATIM - do not paraphrase technical content
- Summarize explanatory prose in your own words for clarity
- Cite sources inline using markdown links: [Page Title](url)
- If the answer is not in the documentation, clearly state "This information is not in the provided documentation"
- Be concise but complete - include all relevant information
- Format code with proper markdown code blocks and language tags`;

/**
 * Service for synthesizing answers from documentation using an LLM.
 */
export class SynthesisService {
  private readonly log = logger.child({ service: "SynthesisService" });

  constructor(
    private readonly languageModel: LanguageModel,
    private readonly modelName: string,
  ) {}

  async synthesize(
    query: string,
    documents: SynthesisDocument[],
  ): Promise<SynthesisResult> {
    const startTime = performance.now();

    // Format documents for the prompt
    const docsText = documents
      .map(
        (doc, i) =>
          `### Document ${i + 1}: ${doc.title}\nURL: ${doc.url}\n\n${doc.content}`,
      )
      .join("\n\n---\n\n");

    const userPrompt = `Question: ${query}

Source Documentation:

${docsText}`;

    this.log.debug("Starting synthesis", {
      model: this.modelName,
      query: query.slice(0, 50),
      documentCount: documents.length,
      totalChars: docsText.length,
    });

    // Reasoning models (o4-mini) don't support temperature
    const isReasoningModel = this.modelName.startsWith("o");

    const result = await generateText({
      model: this.languageModel,
      system: SYNTHESIS_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 4096,
      ...(isReasoningModel ? {} : { temperature: 0 }),
    });

    const durationMs = Math.round(performance.now() - startTime);

    this.log.info("Synthesis completed", {
      model: this.modelName,
      query: query.slice(0, 50),
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      durationMs,
    });

    return {
      answer: result.text,
      model: this.modelName,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      durationMs,
    };
  }
}
