import type { Place, TripRequest } from "../types.js";

export const SYSTEM_PROMPT = `You are a travel itinerary planner.

You will be given a list of real candidate places, each with an id. You must
build a day-by-day itinerary using ONLY those places, referenced by their
exact id. Do not invent places, ids, addresses, or coordinates.

Rules:
- Every item's placeId must be one of the ids you were given.
- Spread places out sensibly across the day (morning/afternoon/evening),
  don't cluster everything at 09:00.
- Respect the number of days and the budget given.
- Keep travel between consecutive items on the same day realistic — prefer
  places that are geographically close together on the same day.
- It's fine to leave some candidate places unused.`;

export function buildUserPrompt(request: TripRequest, candidatePlaces: Place[]): string {
  const placesList = candidatePlaces
    .map((p) => {
      const price = p.priceLevel ?? "unknown";
      return `- id: ${p.id} | name: ${p.name} | category: ${p.category} | priceLevel: ${price} | coords: (${p.lat}, ${p.lng})`;
    })
    .join("\n");

  return `Plan a ${request.days}-day trip to ${request.destination}.
Total budget: ${request.budget} ${request.currency}.
Interests: ${request.interests.join(", ")}.

Candidate places (choose only from this list):
${placesList}`;
}
