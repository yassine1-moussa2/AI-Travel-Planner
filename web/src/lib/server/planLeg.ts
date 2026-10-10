// Plans one destination end to end:
// find the city -> collect real places -> ask the AI to arrange them -> drop anything invented.
import { selectCandidates } from "../candidates";
import { EXCURSION_KM, applyExcursionRules } from "../discovery";
import { ICON_COUNT, classifyPlaces } from "../fame";
import { EUR_TO } from "../geo";
import { groundDays } from "../grounding";
import { aiLegSchema } from "../schema";
import type { Interest, LegPlan, LegRequest, Place, PlaceCategory, Point, StayStyle, TripStyle } from "../types";
import { PlannerError, logStep } from "./debug";
import { fetchPlaces, findDestination, geocode } from "./geoapify";
import type { FoundPlace } from "./geoapify";
import { generateJson } from "./gemini";
import { SYSTEM_PROMPT, buildLegPrompt } from "./prompt";
import { fetchSitelinkCounts, findFamousNearby } from "./wikidata";

export interface CategoryGroup {
  categories: string;
  category: PlaceCategory;
  limit: number;
  // Defaults to CITY_RADIUS_M. Some things worth the trip are further out.
  radius?: number;
  // Keep only places whose name contains this (case-insensitive), like "outlet".
  nameContains?: string;
}

export const CITY_RADIUS_M = 5000;
// Must-sees can be further out than everyday stops: the Brooklyn Bridge, Belém Tower.
export const ICON_RADIUS_M = 20000;
export const STAY_RADIUS_M = 2500;
// Outlet villages sit outside cities: Castel Romano is 20 km from Rome, Freeport 18 km from Lisbon.
export const OUTLET_RADIUS_M = 60000;
const MAX_MUST_SEE = 5;

// Always fetched: things to see, places to eat, places for coffee.
export const ALWAYS: CategoryGroup[] = [
  { categories: "tourism.sights,tourism.attraction", category: "sight", limit: 15 },
  { categories: "catering.restaurant", category: "food", limit: 20 },
  { categories: "catering.cafe", category: "cafe", limit: 8 },
];

export const BY_INTEREST: Record<Interest, CategoryGroup[]> = {
  history: [{ categories: "heritage,tourism.sights.castle", category: "sight", limit: 8 }],
  museums: [{ categories: "entertainment.museum,entertainment.culture", category: "museum", limit: 10 }],
  nature: [{ categories: "leisure.park", category: "nature", limit: 8 }],
  beaches: [{ categories: "beach", category: "beach", limit: 6 }],
  nightlife: [{ categories: "catering.bar,catering.pub", category: "nightlife", limit: 8 }],
  shopping: [{ categories: "commercial.shopping_mall,commercial.marketplace", category: "shopping", limit: 6 }],
  // Outlet malls far out (found by name: Geoapify has no outlet category), plus city markets.
  outlets: [
    { categories: "commercial.shopping_mall", category: "shopping", limit: 10, radius: OUTLET_RADIUS_M, nameContains: "outlet" },
    { categories: "commercial.marketplace", category: "shopping", limit: 6 },
  ],
};

// Off the beaten path, within the city radius. Every category was checked against Geoapify's
// list and against real results in Lisbon and New York (npm run explore).
// Street art is "mural" (Geoapify has no graffiti category); in Lisbon it also finds azulejo panels.
export const DISCOVERY: CategoryGroup[] = [
  { categories: "tourism.attraction.viewpoint,tourism.attraction.artwork.mural", category: "sight", limit: 15 },
  { categories: "commercial.marketplace,commercial.second_hand,commercial.books", category: "shopping", limit: 15 },
  { categories: "leisure.park.garden", category: "nature", limit: 8 },
  { categories: "entertainment.museum,entertainment.culture.arts_centre,entertainment.culture.gallery", category: "museum", limit: 15 },
];

// An adventurous traveller still sees the very top sights, but only a few.
export const ADVENTUROUS_ICON_COUNT = 3;

export function iconCountFor(style: TripStyle): number {
  if (style === "adventurous") {
    return ADVENTUROUS_ICON_COUNT;
  }
  return ICON_COUNT;
}

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
    for (const group of BY_INTEREST[interest]) {
      groups.push(group);
    }
  }
  return groups;
}

// One group, with its own radius and name filter. The name is checked again here because
// Geoapify's name search also matches near spellings.
export async function fetchGroup(center: Point, group: CategoryGroup): Promise<FoundPlace[]> {
  const radius = group.radius || CITY_RADIUS_M;
  const nameContains = group.nameContains || "";
  const batch = await fetchPlaces(center, group.categories, group.category, group.limit, radius, nameContains);
  if (nameContains === "") {
    return batch;
  }
  const kept: FoundPlace[] = [];
  for (const place of batch) {
    if (place.name.toLowerCase().includes(nameContains.toLowerCase())) {
      kept.push(place);
    }
  }
  return kept;
}

// Fetch each group one after another and collect the results into one list.
// Deliberately not parallel: the free Geoapify plan rate-limits bursts, and a rejected
// burst would silently lose whole categories. Cached cities skip this entirely.
// Places found by name (like outlets) were asked for specifically, so their names are
// added to `wanted` and they always reach the AI.
async function collectPlaces(center: Point, interests: Interest[], wanted: Record<string, boolean>): Promise<FoundPlace[]> {
  const all: FoundPlace[] = [];
  for (const group of groupsFor(interests)) {
    const batch = await fetchGroup(center, group);
    for (const place of batch) {
      all.push(place);
      if (group.nameContains !== undefined) {
        wanted[place.name.toLowerCase()] = true;
      }
    }
  }
  return all;
}

// The discovery searches, one after another like every Geoapify call.
export async function collectDiscovery(center: Point): Promise<FoundPlace[]> {
  const all: FoundPlace[] = [];
  for (const group of DISCOVERY) {
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
      found.push({ name, category: "sight", lat: point.lat, lon: point.lon, address: "", area: "", cuisine: "", wikidataId: "" });
    }
  }
  return found;
}

// The most famous visitable places within ICON_RADIUS_M, as candidate sights.
export async function collectFamous(center: Point): Promise<FoundPlace[]> {
  const famous = await findFamousNearby(center, ICON_RADIUS_M);
  const found: FoundPlace[] = [];
  for (const item of famous) {
    found.push({ name: item.name, category: "sight", lat: item.lat, lon: item.lon, address: "", area: "", cuisine: "", wikidataId: item.wikidataId });
  }
  return found;
}

// Give each venue a short id (p1, p2... or h1, h2...) and skip duplicates by name or Wikidata id.
// Fame starts unknown; measureFame fills it in.
export function numberPlaces(found: FoundPlace[], prefix: string, areas: Record<string, string>): Place[] {
  const seen: Record<string, boolean> = {};
  const places: Place[] = [];
  for (const item of found) {
    const nameKey = "name|" + item.name.toLowerCase();
    const wikiKey = "wiki|" + item.wikidataId;
    if (seen[nameKey] || (item.wikidataId !== "" && seen[wikiKey])) {
      continue;
    }
    seen[nameKey] = true;
    if (item.wikidataId !== "") {
      seen[wikiKey] = true;
    }
    const id = prefix + (places.length + 1);
    areas[id] = item.area;
    places.push({
      id,
      name: item.name,
      category: item.category,
      lat: item.lat,
      lon: item.lon,
      address: item.address,
      cuisine: item.cuisine,
      wikidataId: item.wikidataId,
      fame: -1,
      tier: "classic",
      wikiUrl: "",
    });
  }
  return places;
}

// Look up how many Wikipedia editions write about each place. Places Wikidata can't
// measure keep fame -1; a Wikidata outage never stops the plan.
export async function measureFame(places: Place[]): Promise<Place[]> {
  const ids: string[] = [];
  for (const place of places) {
    if (place.wikidataId !== "") {
      ids.push(place.wikidataId);
    }
  }
  const counts = await fetchSitelinkCounts(ids);

  const measured: Place[] = [];
  for (const place of places) {
    const copy = { ...place };
    const count = counts[place.wikidataId];
    if (count !== undefined) {
      copy.fame = count.fame;
      copy.wikiUrl = count.wikiUrl;
    }
    measured.push(copy);
  }
  return measured;
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
  const famous = await collectFamous(center);
  // Names that must reach the AI: what the traveller typed, and outlets they asked for.
  const asked: Record<string, boolean> = {};
  const general = await collectPlaces(center, input.preferences.interests, asked);
  const discovery = await collectDiscovery(center);
  const stayFound = await fetchPlaces(stayCenter, STAY_CATEGORIES[input.preferences.stayStyle], "stay", 12, STAY_RADIUS_M);

  // Must-see places go first so they survive de-duplication, then the famous ones,
  // so a famous place keeps its Wikidata identity when Geoapify lists it too.
  const combined: FoundPlace[] = [];
  for (const item of mustSee) {
    combined.push(item);
    asked[item.name.toLowerCase()] = true;
  }
  for (const item of famous) {
    combined.push(item);
  }
  for (const item of general) {
    combined.push(item);
  }
  // Remember which names came from a discovery search: without a Wikipedia page they are local finds.
  const discovered: Record<string, boolean> = {};
  for (const item of discovery) {
    combined.push(item);
    discovered[item.name.toLowerCase()] = true;
  }

  const areas: Record<string, string> = {};
  const measured = await measureFame(numberPlaces(combined, "p", areas));
  const discoveryIds: Record<string, boolean> = {};
  for (const place of measured) {
    if (discovered[place.name.toLowerCase()]) {
      discoveryIds[place.id] = true;
    }
  }
  const classified = classifyPlaces(measured, { iconCount: iconCountFor(input.preferences.tripStyle), discoveryIds });

  // Keep the list near 70 places; what the traveller named is always kept.
  const keepIds: Record<string, boolean> = {};
  for (const place of classified) {
    if (asked[place.name.toLowerCase()]) {
      keepIds[place.id] = true;
    }
  }
  const places = selectCandidates(classified, { keepIds });
  const stays = numberPlaces(stayFound, "h", areas);
  logStep("candidates", places.length + " places, " + stays.length + " stays in " + center.name);

  if (places.length < 6) {
    throw new PlannerError(422, "We found too few places in " + center.name + " to build a good plan. Try a bigger nearby city.", "only " + places.length + " named places");
  }

  const prompt = buildLegPrompt(input, center, places, stays, areas);
  const ai = await generateJson(SYSTEM_PROMPT, prompt, aiLegSchema);

  const validIds: Record<string, boolean> = {};
  for (const place of places) {
    validIds[place.id] = true;
  }
  const grounded = groundDays(ai.days, validIds, input.nights);
  logStep("grounding", grounded.droppedStops + " invented or repeated stops dropped");
  const index: Record<string, Place> = {};
  for (const place of places) {
    index[place.id] = place;
  }
  const excursions = applyExcursionRules(grounded.days, index, center);
  logStep("excursions", excursions.removedStops + " extra excursions taken out (max one per day, " + EXCURSION_KM + " km+)");

  return {
    cityName: center.name,
    center,
    places,
    stays,
    stayPlaceId: pickStay(ai.stayPlaceId, stays),
    nightlyPricePerRoom: pickNightly(ai.nightlyPricePerRoom, input),
    localTransportPerPersonPerDay: Math.max(0, Math.round(ai.localTransportPerPersonPerDay)),
    days: excursions.days,
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
