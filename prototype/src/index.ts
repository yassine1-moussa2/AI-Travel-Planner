import "dotenv/config";
import { GeminiProvider } from "./llm/gemini.js";
import { GeoapifyPlacesProvider } from "./places/geoapify.js";
import type { PlacesProvider } from "./places/provider.js";
import { generateItinerary } from "./itinerary/generateItinerary.js";
import { hashKey, readCache, writeCache } from "./cache/simpleCache.js";
import type { Itinerary, Place, TripRequest } from "./types.js";

/**
 * CLI demo of the core engine, end to end:
 *   destination text --> geocode --> real places --> LLM arranges them --> validated itinerary
 *
 * Usage:
 *   npm run demo -- --destination "Lisbon, Portugal" --days 3 --budget 600 --interests sight,food
 */

function parseArgs(argv: string[]): TripRequest {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  const interests = (get("--interests") ?? "sight,food,nature").split(",") as TripRequest["interests"];

  return {
    destination: get("--destination") ?? "Lisbon, Portugal",
    days: Number(get("--days") ?? 3),
    budget: Number(get("--budget") ?? 600),
    currency: get("--currency") ?? "USD",
    interests,
  };
}

async function getCandidatePlaces(places: PlacesProvider, request: TripRequest): Promise<Place[]> {
  const placesCacheKey = hashKey({ destination: request.destination, interests: request.interests });
  const cached = await readCache<Place[]>("places", placesCacheKey);
  if (cached) {
    console.log(`[cache] reusing ${cached.length} places for "${request.destination}" — zero API calls`);
    return cached;
  }

  const coords = await places.geocode(request.destination);
  if (!coords) throw new Error(`Could not find a location for "${request.destination}"`);

  const found = await places.searchPlaces({ ...coords, categories: request.interests });
  console.log(`[api] fetched ${found.length} real places for "${request.destination}"`);

  await writeCache("places", placesCacheKey, found);
  return found;
}

function printItinerary(itinerary: Itinerary): void {
  for (const day of itinerary.days) {
    console.log(`\nDay ${day.dayNumber}: ${day.title}`);
    for (const item of day.items) {
      console.log(
        `  ${item.startTime}  ${item.place.name} (${item.place.category}, ${item.durationMin}min, ~${item.estimatedCost}) — ${item.note}`
      );
    }
  }
  console.log(`\nBudget breakdown:`, itinerary.budgetBreakdown);
  console.log(`Tips:`, itinerary.tips);
}

async function main(): Promise<void> {
  const geoapifyKey = process.env.GEOAPIFY_API_KEY;
  if (!geoapifyKey) throw new Error("Missing GEOAPIFY_API_KEY in .env — copy .env.example to .env and fill it in.");
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY in .env — copy .env.example to .env and fill it in.");
  }

  const request = parseArgs(process.argv.slice(2));
  const placesProvider = new GeoapifyPlacesProvider(geoapifyKey);
  const llm = new GeminiProvider();

  const tripCacheKey = hashKey(request);
  const cachedTrip = await readCache<Itinerary>("trips", tripCacheKey);
  if (cachedTrip) {
    console.log(`[cache] identical trip request already generated — zero LLM calls`);
    printItinerary(cachedTrip);
    return;
  }

  const candidatePlaces = await getCandidatePlaces(placesProvider, request);
  if (candidatePlaces.length === 0) {
    throw new Error(`No places found for "${request.destination}" with interests: ${request.interests.join(", ")}`);
  }

  const itinerary = await generateItinerary({ llm, request, candidatePlaces });
  await writeCache("trips", tripCacheKey, itinerary);

  printItinerary(itinerary);
}

main().catch((err) => {
  console.error("Failed to generate itinerary:", err instanceof Error ? err.message : err);
  process.exit(1);
});
