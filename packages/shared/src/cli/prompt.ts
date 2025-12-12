/**
 * CLI prompt utilities for interactive input.
 */

import * as readline from "node:readline";

/**
 * Service for CLI prompting.
 */
export class CliPromptService {
  /**
   * Prompt the user for input.
   */
  async prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  /**
   * Prompt the user for a yes/no confirmation.
   */
  async confirm(question: string, defaultValue = true): Promise<boolean> {
    const hint = defaultValue ? "[Y/n]" : "[y/N]";
    const answer = await this.prompt(`${question} ${hint}: `);

    if (!answer) {
      return defaultValue;
    }

    return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
  }
}
