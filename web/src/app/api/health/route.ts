// GET /api/health — open http://localhost:3000/api/health when something is broken.
// It checks each key and makes one tiny real call to each service, so you know which one fails.
import { z } from "zod";
import { PlannerError } from "@/lib/server/debug";
import { geocode } from "@/lib/server/geoapify";
import { generateJson, modelName } from "@/lib/server/gemini";

interface Check {
  ok: boolean;
  detail: string;
}

function describe(error: unknown): string {
  if (error instanceof PlannerError) {
    return error.message;
  }
  return String(error);
}

async function checkGeoapify(): Promise<Check> {
  try {
    const point = await geocode("Lisbon", null);
    if (point === null) {
      return { ok: false, detail: "Key works but geocoding returned nothing." };
    }
    return { ok: true, detail: "Found " + point.name };
  } catch (error) {
    return { ok: false, detail: describe(error) };
  }
}

async function checkGemini(): Promise<Check> {
  try {
    const answer = await generateJson("Reply with JSON only.", 'Reply with {"ok": true}', z.object({ ok: z.boolean() }));
    return { ok: answer.ok, detail: "Model " + modelName() + " answered" };
  } catch (error) {
    return { ok: false, detail: describe(error) };
  }
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const geoapify = await checkGeoapify();
  const gemini = await checkGemini();
  return Response.json({
    url: request.url,
    geoapify,
    gemini,
    debugLogging: process.env.PLANNER_DEBUG === "1",
    tookMs: Date.now() - startedAt,
  });
}
