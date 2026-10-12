import type { z } from "zod";

/**
 * Anything that can turn a prompt into a schema-validated object implements
 * this. Swapping Gemini for OpenAI later means writing one new file.
 */
export interface LLMProvider {
  generateStructured<T>(params: {
    schema: z.ZodType<T>;
    system: string;
    prompt: string;
  }): Promise<T>;
}
