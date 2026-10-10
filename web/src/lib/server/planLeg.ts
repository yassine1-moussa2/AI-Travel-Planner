// Plans one destination end to end:
// find the city -> collect real places -> ask the AI to arrange them -> drop anything invented.
import { EUR_TO } from "../geo";
import { groundDays } from "../grounding";
import { aiLegSchema } from "../schema";
import type { Interest, LegPlan, LegRequest, Place, PlaceCategory, Point, StayStyle } from "../types";
import { PlannerError, logStep } from "./debug";
import { fetchPlaces, findDestination, geocode } from "./geoapify";
import type { FoundPlace } from "./geoapify";
import { generateJson } from "./gemini";
import { SYSTEM_PROMPT, buildLegPrompt } from "./prompt";

export interface CategoryGroup {
  categories: string;
  category: PlaceCategory;
  limit: number;
}

export const CITY_RADIUS_M = 5000;
export const STAY_RADIUS_M = 2500;
const MAX_MUST_SEE = 5;

// Always fetched: things to see, places to eat, places for coffee.
export const ALWAYS: CategoryGroup[] = [
  { categories: "tourism.sights,tourism.attraction", category: "sight", limit: 15 },
  { categories: "catering.restaurant", category: "food", limit: 20 },
  { categories: "catering.cafe", category: "cafe", limit: 8 },
];

export const BY_INTEREST: Record<Interest, CategoryGroup> = {
  history: { categories: "heritage,tourism.sights.castle", category: "sight", limit: 8 },
  museums: { categories: "entertainment.museum,entertainment.culture", category: "museum", limit: 10 },
  nature: { categories: "leisure.park", category: "nature", limit: 8 },
  beaches: { categories: "beach", category: "beach", limit: 6 },
  nightlife: { categories: "catering.bar,catering.pub", category: "nightlife", limit: 8 },
  shopping: { categories: "commercial.shopping_mall,commercial.marketplace", category: "shopping", limit: 6 },
};

export const STAY_CATEGORIES: Record<StayStyle, string> = {
  budget: "accommodation.hostel,accommodation.guest_house",
  comfort: "accommodation.hotel,accommodation.guest_house",
  treat: "accommodation.hotel",
};

// Used only if the AI forgets to give a nightly price.
const FALLBACK_NIGHTLY_EUR: Record<StayStyle, number> = { budget: 45, comfort: 110, treat: 220 };

function groupsFor(interests: Interest[]): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  for (const group of ALWAYS) {
    groups.push(group);
  }
  let chosen = interests;
  if (chosen.length === 0) {
    chosen = ["history", "museums", "nature"];
  }
  for (const interest of chosen) {
    groups.push(BY_INTEREST[interest]);
  }
  return groups;
}

// Fetch each group one after another and collect the results into one list.
// Deliberately not parallel: the free Geoapify plan rate-limits bursts, and a rejected
// burst would silently lose whole categories. Cached cities skip this entirely.
async function collectPlaces(center: Point, interests: Interest[]): Promise<FoundPlace[]> {
  const all: FoundPlace[] = [];
  for (const group of groupsFor(interests)) {
    const batch = await fetchPlaces(center, group.categories, group.category, group.limit, CITY_RADIUS_M);
    for (const place of batch) {
      all.push(place);
    }
  }
  return all;
}

// Look up each "must see" the traveller typed, so it exists on the map before the AI sees it.
async function collectMustSee(mustSee: string, center: Point): Promise<FoundPlace[]> {
  const names = mustSee.split(",");
  const found: FoundPlace[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    if (name === "" || found.length >= MAX_MUST_SEE) {
      continue;
    }
    const point = await geocode(name + ", " + center.name, center);
    if (point !== null) {
      found.push({ name, category: "sight", lat: point.lat, lon: point.lon, address: "", area: "", cuisine: "" });
    }
  }
  return found;
}

// Give each venue a short id (p1, p2... or h1, h2...) and skip duplicates by name.
function numberPlaces(found: FoundPlace[], prefix: string, areas: Record<string, string>): Place[] {
  const seenNames: Record<string, boolean> = {};
  const places: Place[] = [];
  for (const item of found) {
    const key = item.name.toLowerCase();
    if (seenNames[key]) {
      continue;
    }
    seenNames[key] = true;
    const id = prefix + (places.length + 1);
    areas[id] = item.area;
    places.push({ id, name: item.name, category: item.category, lat: item.lat, lon: item.lon, address: item.address, cuisine: item.cuisine });
  }
  return places;
}

export async function planLeg(input: LegRequest): Promise<LegPlan> {
  // A trip stop must be a town or city: a country or region has no centre worth planning around.
  const destination = await findDestination(input.city);
  const quoted = "\"" + input.city + "\"";
  if (destination.kind === "country") {
    throw new PlannerError(422, quoted + " is a whole country. Add each town or city you want to visit as its own destination.", "destination is a country: " + input.city);
  }
  if (destination.kind === "region") {
    throw new PlannerError(422, quoted + " is a whole region. Choose the town or city you'll stay in, and add more destinations for more stops.", "destination is a region: " + input.city);
  }
  const center = destination.point;
  if (center === null) {
    throw new PlannerError(404, "We couldn't find a town or city called " + quoted + ". Try adding the country, like \"Porto, Portugal\".", "no usable geocode result for " + input.city);
  }

  // Sleep near the area they asked for, if we can find it; otherwise near the centre.
  let stayCenter = center;
  if (input.preferences.stayArea.trim() !== "") {
    const areaPoint = await geocode(input.preferences.stayArea + ", " + center.name, center);
    if (areaPoint !== null) {
      stayCenter = areaPoint;
    }
  }

  const mustSee = await collectMustSee(input.preferences.mustSee, center);
  const general = await collectPlaces(center, input.preferences.interests);
  const stayFound = await fetchPlaces(stayCenter, STAY_CATEGORIES[input.preferences.stayStyle], "stay", 12, STAY_RADIUS_M);

  // Must-see places go first so they survive de-duplication.
  const combined: FoundPlace[] = [];
  for (const item of mustSee) {
    combined.push(item);
  }
  for (const item of general) {
    combined.push(item);
  }

  const areas: Record<string, string> = {};
  const places = numberPlaces(combined, "p", areas);
  const stays = numberPlaces(stayFound, "h", areas);
  logStep("candidates", places.length + " places, " + stays.length + " stays in " + center.name);

  if (places.length < 6) {
    throw new PlannerError(422, "We found too few places in " + center.name + " to build a good plan. Try a bigger nearby city.", "only " + places.length + " named places");
  }

  const prompt = buildLegPrompt(input, center.name, places, stays, areas);
  const ai = await generateJson(SYSTEM_PROMPT, prompt, aiLegSchema);

  const validIds: Record<string, boolean> = {};
  for (const place of places) {
    validIds[place.id] = true;
  }
  const grounded = groundDays(ai.days, validIds, input.nights);
  logStep("grounding", grounded.droppedStops + " invented or repeated stops dropped");

  return {
    cityName: center.name,
    center,
    places,
    stays,
    stayPlaceId: pickStay(ai.stayPlaceId, stays),
    nightlyPricePerRoom: pickNightly(ai.nightlyPricePerRoom, input),
    localTransportPerPersonPerDay: Math.max(0, Math.round(ai.localTransportPerPersonPerDay)),
    days: grounded.days,
    tips: ai.tips.slice(0, 4),
  };
}

function pickStay(aiChoice: string, stays: Place[]): string {
  for (const stay of stays) {
    if (stay.id === aiChoice) {
      return aiChoice;
    }
  }
  if (stays.length > 0) {
    return stays[0].id;
  }
  return "";
}

function pickNightly(aiPrice: number, input: LegRequest): number {
  if (aiPrice > 0) {
    return Math.round(aiPrice);
  }
  const fallback = FALLBACK_NIGHTLY_EUR[input.preferences.stayStyle] * EUR_TO[input.currency];
  return Math.round(fallback);
}
