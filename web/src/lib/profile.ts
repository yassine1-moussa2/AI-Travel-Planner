// Data profiling for the places API: how complete and how useful is what it returns?
// Pure functions only, so they can be tested without the network.
import { distanceKm } from "./geo";
import type { Point } from "./types";

// The fields of a raw Geoapify place that matter for planning.
export interface RawPlace {
  name?: string;
  lat: number;
  lon: number;
  address_line2?: string;
  suburb?: string;
  district?: string;
  catering?: { cuisine?: string };
}

export interface GroupProfile {
  label: string;
  rows: number;
  namedPercent: number;
  addressPercent: number;
  areaPercent: number;
  cuisinePercent: number;
  duplicateNames: number;
  nearestKm: number;
  medianKm: number;
  farthestKm: number;
  topCuisines: string[];
  flags: string[];
}

function percent(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Math.round((count / total) * 100);
}

function hasText(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

function smallestFirst(first: number, second: number): number {
  return first - second;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  // Copy first so the caller's list keeps its order.
  const sorted = values.slice();
  sorted.sort(smallestFirst);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

// Count how often each cuisine appears and keep the five most common.
function topCuisines(rows: RawPlace[]): string[] {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.catering === undefined || !hasText(row.catering.cuisine)) {
      continue;
    }
    const cuisines = (row.catering.cuisine as string).split(";");
    for (const cuisine of cuisines) {
      const key = cuisine.trim();
      if (!(key in counts)) {
        counts[key] = 0;
      }
      counts[key] = counts[key] + 1;
    }
  }

  // Most frequent first.
  function mostCommonFirst(first: string, second: string): number {
    return counts[second] - counts[first];
  }
  const ranked = Object.keys(counts);
  ranked.sort(mostCommonFirst);
  const top: string[] = [];
  for (const cuisine of ranked.slice(0, 5)) {
    top.push(cuisine + " (" + counts[cuisine] + ")");
  }
  return top;
}

// Heuristic warnings, following the data-quality thresholds: >20% missing is an alert.
function qualityFlags(profile: GroupProfile, isFood: boolean): string[] {
  const flags: string[] = [];
  if (profile.rows === 0) {
    flags.push("returned nothing: category name may be wrong, or none nearby");
    return flags;
  }
  if (profile.namedPercent < 80) {
    flags.push((100 - profile.namedPercent) + "% have no name and will be skipped by the planner");
  }
  if (profile.areaPercent < 80) {
    flags.push("area missing on " + (100 - profile.areaPercent) + "%: the AI orders stops less well");
  }
  if (isFood && profile.cuisinePercent < 50) {
    flags.push("cuisine known for only " + profile.cuisinePercent + "%: food wishes are hard to honour");
  }
  if (profile.duplicateNames > 0) {
    flags.push(profile.duplicateNames + " duplicate names (chains or data repeats), de-duplicated by the planner");
  }
  if (profile.medianKm > 3) {
    flags.push("median distance " + profile.medianKm + " km: results are spread out, consider a smaller radius");
  }
  return flags;
}

export function profileGroup(label: string, rows: RawPlace[], center: Point, isFood: boolean): GroupProfile {
  let named = 0;
  let withAddress = 0;
  let withArea = 0;
  let withCuisine = 0;
  let duplicates = 0;
  const seenNames: Record<string, boolean> = {};
  const distances: number[] = [];

  for (const row of rows) {
    if (hasText(row.name)) {
      named = named + 1;
      const key = (row.name as string).trim().toLowerCase();
      if (seenNames[key]) {
        duplicates = duplicates + 1;
      }
      seenNames[key] = true;
    }
    if (hasText(row.address_line2)) {
      withAddress = withAddress + 1;
    }
    if (hasText(row.suburb) || hasText(row.district)) {
      withArea = withArea + 1;
    }
    if (row.catering !== undefined && hasText(row.catering.cuisine)) {
      withCuisine = withCuisine + 1;
    }
    distances.push(distanceKm(center.lat, center.lon, row.lat, row.lon));
  }

  let nearest = 0;
  let farthest = 0;
  if (distances.length > 0) {
    nearest = Math.min(...distances);
    farthest = Math.max(...distances);
  }

  const profile: GroupProfile = {
    label,
    rows: rows.length,
    namedPercent: percent(named, rows.length),
    addressPercent: percent(withAddress, rows.length),
    areaPercent: percent(withArea, rows.length),
    cuisinePercent: percent(withCuisine, rows.length),
    duplicateNames: duplicates,
    nearestKm: roundOne(nearest),
    medianKm: roundOne(median(distances)),
    farthestKm: roundOne(farthest),
    topCuisines: topCuisines(rows),
    flags: [],
  };
  profile.flags = qualityFlags(profile, isFood);
  return profile;
}
