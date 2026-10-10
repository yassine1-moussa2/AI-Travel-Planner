// Talks to Geoapify (OpenStreetMap data): finds cities on the map and real venues around them.
import { readCache, writeCache } from "./cache";
import { PlannerError, logError, requireEnv, startTimer } from "./debug";
import type { PlaceCategory, Point } from "../types";

const GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search";
const PLACES_URL = "https://api.geoapify.com/v2/places";

// Shape of the parts of Geoapify's answers we actually read.
interface GeocodeResult {
  lat: number;
  lon: number;
  formatted?: string;
  city?: string;
  name?: string;
  country?: string;
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
}

export interface FoundPlace {
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  address: string;
  area: string;
  cuisine: string;
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
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("text", text);
  url.searchParams.set("limit", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", requireEnv("GEOAPIFY_API_KEY"));
  if (near !== null) {
    url.searchParams.set("filter", "circle:" + near.lon + "," + near.lat + ",30000");
  }

  const data = (await getJson(url, "geocode")) as { results?: GeocodeResult[] };
  const results = data.results || [];
  if (results.length === 0) {
    done(text + " -> not found");
    return null;
  }

  const best = results[0];
  let label = best.city || best.name || text;
  if (best.country) {
    label = label + ", " + best.country;
  }
  const point: Point = { name: label, lat: best.lat, lon: best.lon };
  writeCache(cacheKey, point);
  done(text + " -> " + label);
  return point;
}

// Raw features, used by the planner and by the data-exploration script.
export async function fetchRawPlaces(center: Point, categories: string, limit: number, radiusMeters: number): Promise<RawPlaceProperties[]> {
  const url = new URL(PLACES_URL);
  url.searchParams.set("categories", categories);
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
  return {
    name: raw.name.trim(),
    category,
    lat: raw.lat,
    lon: raw.lon,
    address: raw.address_line2 || raw.formatted || "",
    area: raw.suburb || raw.district || "",
    cuisine,
  };
}

// One category group, cached. A failure here is logged and returns nothing,
// so one bad category never ruins the whole city.
export async function fetchPlaces(center: Point, categories: string, category: PlaceCategory, limit: number, radiusMeters: number): Promise<FoundPlace[]> {
  const cacheKey = "places|" + center.lat.toFixed(3) + "," + center.lon.toFixed(3) + "|" + categories + "|" + limit + "|" + radiusMeters;
  const cached = readCache<FoundPlace[]>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const done = startTimer("places");
  let raws: RawPlaceProperties[] = [];
  try {
    raws = await fetchRawPlaces(center, categories, limit, radiusMeters);
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
