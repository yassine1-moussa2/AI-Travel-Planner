// Talks to Google Gemini over plain HTTPS and returns validated JSON.
import type { z } from "zod";
import { PlannerError, logError, logStep, requireEnv, startTimer } from "./debug";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models/";
const DEFAULT_MODEL = "gemini-3.6-flash";

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
}

export function modelName(): string {
  const fromEnv = process.env.GEMINI_MODEL;
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    return fromEnv.trim();
  }
  return DEFAULT_MODEL;
}

// Translate HTTP failures into messages a person can act on.
function explainFailure(status: number, body: string, model: string): PlannerError {
  const detail = "Gemini " + status + ": " + body.slice(0, 400);
  const lowered = body.toLowerCase();

  if (status === 404 || lowered.includes("no longer available") || lowered.includes("not found")) {
    return new PlannerError(500, "The AI model isn't available right now.", detail + " -> model '" + model + "' is retired or unknown. Set GEMINI_MODEL in .env.local (try gemini-flash-latest).");
  }
  if (status === 503 || status === 500) {
    return new PlannerError(503, "The AI is very busy right now. Wait a minute and try again.", detail + " -> Google-side overload, temporary. If it persists, try another GEMINI_MODEL.");
  }
  if (status === 429) {
    return new PlannerError(429, "The AI is busy or the free quota is used up. Wait a minute and try again.", detail);
  }
  if (status === 400 && lowered.includes("api key")) {
    return new PlannerError(500, "The AI rejected our key.", detail + " -> check GOOGLE_GENERATIVE_AI_API_KEY");
  }
  if (status === 403) {
    return new PlannerError(500, "The AI rejected our key.", detail + " -> check GOOGLE_GENERATIVE_AI_API_KEY");
  }
  return new PlannerError(502, "The AI didn't answer properly. Try again.", detail);
}

// Google answers 500/503 when the model is overloaded. These usually clear within seconds,
// so we wait and retry before bothering the traveller. Quota (429) is not retried: waiting
// a few seconds rarely helps there, and the message tells them what to do.
// Exported so tests can shorten the pauses instead of waiting 7 real seconds.
export const retrySettings = { pausesMs: [2000, 5000] };

function isOverloaded(status: number): boolean {
  return status === 503 || status === 500;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}

// One raw call, retried on overload. Returns the model's text (thinking parts are skipped).
async function callGemini(system: string, prompt: string): Promise<string> {
  const model = modelName();
  const url = API_ROOT + model + ":generateContent";
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.5 },
  };

  const key = requireEnv("GOOGLE_GENERATIVE_AI_API_KEY");
  let response: Response | null = null;

  const pauses = retrySettings.pausesMs;
  for (let attempt = 0; attempt <= pauses.length; attempt++) {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    if (response.ok) {
      break;
    }

    const canRetry = isOverloaded(response.status) && attempt < pauses.length;
    if (!canRetry) {
      const errorText = await response.text();
      throw explainFailure(response.status, errorText, model);
    }
    logError("gemini", "model busy (" + response.status + "), retrying in " + pauses[attempt] + " ms");
    await pause(pauses[attempt]);
  }

  if (response === null) {
    throw new PlannerError(502, "The AI didn't answer. Try again.", "Gemini: no response object");
  }

  const data = (await response.json()) as GeminiResponse;
  const candidates = data.candidates || [];
  if (candidates.length === 0) {
    throw new PlannerError(502, "The AI returned an empty answer. Try again.", "Gemini returned no candidates");
  }

  let text = "";
  const parts = candidates[0].content?.parts || [];
  for (const part of parts) {
    if (part.thought !== true && part.text !== undefined) {
      text = text + part.text;
    }
  }
  logStep("gemini", "finish reason " + candidates[0].finishReason + ", " + text.length + " chars");
  return text;
}

// Some models wrap JSON in ```json fences even in JSON mode. Strip them.
function cleanJsonText(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    cleaned = cleaned.slice(firstNewline + 1);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

// Ask for JSON, validate it, and give the model one chance to repair a bad answer.
export async function generateJson<T>(system: string, prompt: string, schema: z.ZodType<T>): Promise<T> {
  let currentPrompt = prompt;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const done = startTimer("gemini attempt " + attempt);
    const text = await callGemini(system, currentPrompt);
    done(modelName());

    let problem = "";
    try {
      const parsed = JSON.parse(cleanJsonText(text));
      const checked = schema.safeParse(parsed);
      if (checked.success) {
        return checked.data;
      }
      problem = checked.error.message.slice(0, 500);
    } catch (error) {
      problem = "Not valid JSON: " + String(error);
    }

    logError("gemini validation (attempt " + attempt + ")", problem);
    currentPrompt = prompt + "\n\nYour previous answer was rejected: " + problem + "\nReply again with ONLY the corrected JSON object.";
  }

  throw new PlannerError(502, "The AI's plan came back malformed twice. Try again.", "Gemini JSON failed validation on both attempts");
}
