// GET /api/health — open http://localhost:3000/api/health when something is broken.
// It checks each key and makes one tiny real call to each service, so you know which one fails.
// Each call costs real quota, so on a public server it answers only with the secret token:
//   curl -H "x-health-token: $HEALTH_CHECK_TOKEN" https://your-site/api/health
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

// Open in development; in production only with the token, and not at all when no token is set.
function mayRun(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  const expected = process.env.HEALTH_CHECK_TOKEN;
  if (expected === undefined || expected.trim().length < 16) {
    return false;
  }
  return request.headers.get("x-health-token") === expected.trim();
}

export async function GET(request: Request) {
  // A plain 404 so the route doesn't advertise itself to strangers.
  if (!mayRun(request)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const startedAt = Date.now();
  const geoapify = await checkGeoapify();
  const gemini = await checkGemini();
  return Response.json({
    geoapify,
    gemini,
    debugLogging: process.env.PLANNER_DEBUG === "1",
    tookMs: Date.now() - startedAt,
  });
}
