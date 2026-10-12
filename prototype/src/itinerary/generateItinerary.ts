import type { LLMProvider } from "../llm/provider.js";
import type { Itinerary, ItineraryDay, Place, TripRequest } from "../types.js";
import { buildUserPrompt, SYSTEM_PROMPT } from "./promptBuilder.js";
import { rawItinerarySchema, type RawItinerary } from "./schema.js";

/**
 * The core engine: retrieval-then-generate.
 *
 * `candidatePlaces` must already be REAL places (fetched from a PlacesProvider
 * before this function is called — see src/index.ts). This function never
 * calls a places API itself; it only arranges what it's given, and it
 * enforces that the LLM did the same.
 */
export async function generateItinerary(params: {
  llm: LLMProvider;
  request: TripRequest;
  candidatePlaces: Place[];
}): Promise<Itinerary> {
  const { llm, request, candidatePlaces } = params;
  const prompt = buildUserPrompt(request, candidatePlaces);

  const raw = await generateWithOneRetry(llm, prompt);

  return resolveAndValidate(raw, request, candidatePlaces);
}

/**
 * Structured output fails sometimes — the model returns something that
 * doesn't match the schema. We give it exactly one more chance, quoting the
 * error back to it, before giving up. Callers should catch and show a
 * friendly "couldn't plan this trip, try again" message rather than crash.
 */
async function generateWithOneRetry(llm: LLMProvider, prompt: string): Promise<RawItinerary> {
  try {
    return await llm.generateStructured({ schema: rawItinerarySchema, system: SYSTEM_PROMPT, prompt });
  } catch (firstError) {
    const reason = firstError instanceof Error ? firstError.message : String(firstError);
    const repairPrompt = `${prompt}\n\nYour previous response was invalid: ${reason}\nReturn ONLY JSON matching the required schema, with no extra commentary.`;

    return llm.generateStructured({ schema: rawItinerarySchema, system: SYSTEM_PROMPT, prompt: repairPrompt });
  }
}

/**
 * The rule that saves us: drop any placeId the model returned that we never
 * gave it. Then resolve the surviving ids back to full place records, so the
 * rest of the app never has to trust anything the LLM said about a place.
 */
function resolveAndValidate(raw: RawItinerary, request: TripRequest, candidatePlaces: Place[]): Itinerary {
  const placesById = new Map(candidatePlaces.map((p) => [p.id, p]));

  const days: ItineraryDay[] = raw.days.slice(0, request.days).map((day) => ({
    dayNumber: day.dayNumber,
    title: day.title,
    items: day.items
      .filter((item) => placesById.has(item.placeId))
      .map((item) => ({
        place: placesById.get(item.placeId)!,
        startTime: item.startTime,
        durationMin: item.durationMin,
        note: item.note,
        estimatedCost: item.estimatedCost,
      })),
  }));

  if (raw.budgetBreakdown.total > request.budget * 1.5) {
    console.warn(
      `Generated budget (${raw.budgetBreakdown.total} ${request.currency}) is well over the requested ` +
        `budget (${request.budget} ${request.currency}). Showing it anyway — the LLM's cost estimates are advisory.`
    );
  }

  return {
    days,
    budgetBreakdown: raw.budgetBreakdown,
    tips: raw.tips,
  };
}
