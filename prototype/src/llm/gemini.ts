import { z } from "zod";
import type { LLMProvider } from "./provider.js";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models/";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
}

// Plain HTTPS instead of an SDK: one fewer dependency tree to keep patched.
// The web app (web/src/lib/server/gemini.ts) talks to Gemini the same way.
export class GeminiProvider implements LLMProvider {
  // If Google retires this model, set GEMINI_MODEL in .env (gemini-flash-latest always works).
  constructor(private readonly model = process.env.GEMINI_MODEL || "gemini-3.6-flash") {}

  async generateStructured<T>(params: { schema: z.ZodType<T>; system: string; prompt: string }): Promise<T> {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) {
      throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY in .env");
    }

    const response = await fetch(API_ROOT + this.model + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.system }] },
        contents: [{ role: "user", parts: [{ text: params.prompt }] }],
        // The schema goes with the request so Gemini answers in exactly our shape.
        // Low temperature: we want a sensible schedule, not creative writing.
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(params.schema, { target: "draft-7", io: "input" }),
          temperature: 0.3,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      throw new Error("Gemini " + response.status + ": " + (await response.text()).slice(0, 300));
    }

    // Join the answer's text parts, skipping the model's thinking.
    const data = (await response.json()) as GeminiResponse;
    let text = "";
    for (const part of data.candidates?.[0]?.content?.parts ?? []) {
      if (part.thought !== true && part.text !== undefined) {
        text += part.text;
      }
    }
    // Throws on bad JSON or a schema mismatch, which triggers the caller's repair retry.
    return params.schema.parse(JSON.parse(text));
  }
}
