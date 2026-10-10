// Talks to Geoapify (OpenStreetMap data): finds cities on the map and real venues around them.
import { readCache, writeCache } from "./cache";
import { PlannerError, logError, requireEnv, startTimer } from "./debug";
import type { PlaceCategory, Point } from "../types";

const GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search";
const PLACES_URL = "https://api.geoapify.com/v2/places";

// Shape of the parts of Geoapify's answers we actually read.
export interface GeocodeResult {
  lat: number;
  lon: number;
  formatted?: string;
  city?: string;
  name?: string;
  country?: string;
  country_code?: string;
  result_type?: string;
}

export interface RawPlaceProperties {
  name?: string;
  place_id?: string;
  lat: number;
  lon: number;
  formatted?: string;
  address_line2?: string;
  suburb?: string;
  district?: string;
  categories?: string[];
  catering?: { cuisine?: string };
  wiki_and_media?: { wikidata?: string; wikipedia?: string };
}

export interface FoundPlace {
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  address: string;
  area: string;
  cuisine: string;
  wikidataId: string;
}

async function getJson(url: URL, step: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (response.status === 401 || response.status === 403) {
    throw new PlannerError(500, "The map service rejected our key.", "Geoapify " + response.status + " at " + step + ": check GEOAPIFY_API_KEY");
  }
  if (response.status === 429) {
    throw new PlannerError(429, "The map service is busy. Wait a few seconds and try again.", "Geoapify 429 rate limit at " + step);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new PlannerError(502, "The map service didn't answer properly. Try again in a moment.", "Geoapify " + response.status + " at " + step + ": " + body.slice(0, 300));
  }
  return response.json();
}

// Ask the geocoder about a piece of text. Extra settings narrow the search (limit, filter, type).
async function searchByName(text: string, settings: Record<string, string>): Promise<GeocodeResult[]> {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("text", text);
  url.searchParams.set("format", "json");
  for (const name in settings) {
    url.searchParams.set(name, settings[name]);
  }
  url.searchParams.set("apiKey", requireEnv("GEOAPIFY_API_KEY"));
  const data = (await getJson(url, "geocode")) as { results?: GeocodeResult[] };
  return data.results || [];
}

// A short readable name for a result, like "Lisbon, Portugal".
function toPoint(result: GeocodeResult, text: string): Point {
  let label = result.city || result.name || text;
  if (result.country) {
    label = label + ", " + result.country;
  }
  return { name: label, lat: result.lat, lon: result.lon };
}

// Turn "Lisbon" or "Alfama, Lisbon" into coordinates. Optionally only look near a point.
export async function geocode(text: string, near: Point | null): Promise<Point | null> {
  let nearKey = "";
  if (near !== null) {
    nearKey = near.lat.toFixed(2) + "," + near.lon.toFixed(2);
  }
  const cacheKey = "geo|" + text.toLowerCase() + "|" + nearKey;
  const cached = readCache<Point>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const done = startTimer("geocode");
  const settings: Record<string, string> = { limit: "1" };
  if (near !== null) {
    settings.filter = "circle:" + near.lon + "," + near.lat + ",30000";
  }
  const results = await searchByName(text, settings);
  if (results.length === 0) {
    done(text + " -> not found");
    return null;
  }

  const point = toPoint(results[0], text);
  writeCache(cacheKey, point);
  done(text + " -> " + point.name);
  return point;
}

export type DestinationKind = "place" | "country" | "region" | "none";

export interface DestinationLookup {
  kind: DestinationKind;
  point: Point | null;
}

// Streets and buildings share names with famous places ("Amalfi Coast" is also a street in
// Australia), but nobody travels to a street, so they are never taken as a destination.
const NOT_A_DESTINATION: Record<string, boolean> = { street: true, building: true };

// Pick the best answer a traveller could mean, and say whether it is too big to plan as one stop.
// Countries and regions ("Morocco", "Tuscany") have a centre in the middle of nowhere,
// which is why they used to fail with "too few places".
export function chooseDestination(results: GeocodeResult[]): { kind: DestinationKind; result: GeocodeResult | null } {
  for (const result of results) {
    const type = result.result_type || "";
    if (NOT_A_DESTINATION[type]) {
      continue;
    }
    if (type === "country") {
      return { kind: "country", result };
    }
    if (type === "state") {
      return { kind: "region", result };
    }
    return { kind: "place", result };
  }
  return { kind: "none", result: null };
}

// Find where a trip destination is, and whether it can be planned as one place.
export async function findDestination(text: string): Promise<DestinationLookup> {
  const cacheKey = "destination|" + text.toLowerCase();
  const cached = readCache<DestinationLookup>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const done = startTimer("destination");
  const choice = chooseDestination(await searchByName(text, { limit: "5" }));
  let lookup: DestinationLookup = { kind: choice.kind, point: null };
  if (choice.result !== null) {
    lookup = { kind: choice.kind, point: toPoint(choice.result, text) };
  }

  // "New York" is first a state, but travellers mean the city. Ask once more for a city
  // with that name in the same country; for "Morocco" or "Tuscany" there is none.
  const tooBig = choice.kind === "country" || choice.kind === "region";
  if (tooBig && choice.result !== null && choice.result.country_code) {
    const cities = await searchByName(text, { limit: "1", type: "city", filter: "countrycode:" + choice.result.country_code });
    if (cities.length > 0 && cities[0].result_type === "city") {
      lookup = { kind: "place", point: toPoint(cities[0], text) };
    }
  }

  writeCache(cacheKey, lookup);
  let found = "nothing usable";
  if (lookup.point !== null) {
    found = lookup.point.name;
  }
  done(text + " -> " + lookup.kind + " " + found);
  return lookup;
}

// Raw features, used by the planner and by the data-exploration script.
export async function fetchRawPlaces(center: Point, categories: string, limit: number, radiusMeters: number, name: string = ""): Promise<RawPlaceProperties[]> {
  const url = new URL(PLACES_URL);
  url.searchParams.set("categories", categories);
  // Optional: only places whose name matches, like "outlet" among shopping malls.
  if (name !== "") {
    url.searchParams.set("name", name);
  }
  // Nameless places are useless to a traveller and were dropped anyway; asking for named ones
  // only keeps the limit for real results (87% of New York viewpoints have no name).
  url.searchParams.set("conditions", "named");
  url.searchParams.set("filter", "circle:" + center.lon + "," + center.lat + "," + radiusMeters);
  url.searchParams.set("bias", "proximity:" + center.lon + "," + center.lat);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("apiKey", requireEnv("GEOAPIFY_API_KEY"));

  const data = (await getJson(url, "places " + categories)) as { features?: { properties: RawPlaceProperties }[] };
  const properties: RawPlaceProperties[] = [];
  for (const feature of data.features || []) {
    properties.push(feature.properties);
  }
  return properties;
}

function toFoundPlace(raw: RawPlaceProperties, category: PlaceCategory): FoundPlace | null {
  if (raw.name === undefined || raw.name.trim() === "") {
    return null;
  }
  let cuisine = "";
  if (raw.catering !== undefined && raw.catering.cuisine !== undefined) {
    cuisine = raw.catering.cuisine.replaceAll("_", " ").replaceAll(";", ", ");
  }
  // OpenStreetMap links some places to Wikidata; that link is how we measure fame.
  let wikidataId = "";
  if (raw.wiki_and_media !== undefined && raw.wiki_and_media.wikidata !== undefined) {
    wikidataId = raw.wiki_and_media.wikidata.trim();
  }
  return {
    name: raw.name.trim(),
    category,
    lat: raw.lat,
    lon: raw.lon,
    address: raw.address_line2 || raw.formatted || "",
    area: raw.suburb || raw.district || "",
    cuisine,
    wikidataId,
  };
}

// One category group, cached. A failure here is logged and returns nothing,
// so one bad category never ruins the whole city.
export async function fetchPlaces(center: Point, categories: string, category: PlaceCategory, limit: number, radiusMeters: number, name: string = ""): Promise<FoundPlace[]> {
  const cacheKey = "places|named|" + center.lat.toFixed(3) + "," + center.lon.toFixed(3) + "|" + categories + "|" + limit + "|" + radiusMeters + "|" + name;
  const cached = readCache<FoundPlace[]>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const done = startTimer("places");
  let raws: RawPlaceProperties[] = [];
  try {
    raws = await fetchRawPlaces(center, categories, limit, radiusMeters, name);
  } catch (error) {
    // Key problems and rate limits affect every category, so stop and report them.
    // Anything else (like one unknown category name) only skips this group.
    if (error instanceof PlannerError && (error.status === 500 || error.status === 429)) {
      throw error;
    }
    logError("places " + categories, error);
    return [];
  }

  const found: FoundPlace[] = [];
  for (const raw of raws) {
    const place = toFoundPlace(raw, category);
    if (place !== null) {
      found.push(place);
    }
  }
  writeCache(cacheKey, found);
  done(categories + " -> " + found.length + " named places");
  return found;
}
