// POST /api/plan-leg — plans a single destination.
// The browser calls this once per destination, so each city appears as soon as it is ready
// and changing one city only re-plans that city.
import { legRequestSchema } from "@/lib/schema";
import { errorResponse, startTimer } from "@/lib/server/debug";
import { planLeg } from "@/lib/server/planLeg";
import { allowPlan } from "@/lib/server/rateLimit";

// A city plan takes 15 to 40 seconds, longer when the AI is busy and we retry. 300 s is the Vercel Hobby ceiling.
export const maxDuration = 300;

export async function POST(request: Request) {
  // Every plan costs an AI call, so the limits are checked before anything else.
  const limit = allowPlan(request);
  if (!limit.ok) {
    return Response.json({ error: limit.message }, { status: 429 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request was not valid JSON." }, { status: 400 });
  }

  const checked = legRequestSchema.safeParse(body);
  // Say which detail is wrong in plain words; the technical reason goes to the terminal.
  if (!checked.success) {
    const field = String(checked.error.issues[0].path[0]);
    let message = "Some trip details look wrong (" + field + "). Check the form and try again.";
    if (field === "city") {
      message = "Each destination needs a city name of at least two letters.";
    }
    console.error("[planner] bad plan-leg request: " + checked.error.message);
    return Response.json({ error: message }, { status: 400 });
  }

  const done = startTimer("plan-leg total");
  try {
    const plan = await planLeg(checked.data);
    done(plan.cityName);
    return Response.json({ plan });
  } catch (error) {
    return errorResponse("plan-leg", error);
  }
}
