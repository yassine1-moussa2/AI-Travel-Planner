// Profiles what the places API returns for a city, group by group, the same way the planner asks.
// Use it to tune radius, limits and categories with evidence instead of guesses.
//
// Usage:  npm run explore -- "Lisbon"
import { ICON_COUNT, classifyPlaces } from "../src/lib/fame";
import { profileGroup } from "../src/lib/profile";
import type { GroupProfile } from "../src/lib/profile";
import { fetchPlaces, fetchRawPlaces, findDestination } from "../src/lib/server/geoapify";
import type { FoundPlace } from "../src/lib/server/geoapify";
import { ALWAYS, BY_INTEREST, CITY_RADIUS_M, DISCOVERY, STAY_CATEGORIES, STAY_RADIUS_M, collectDiscovery, collectFamous, measureFame, numberPlaces } from "../src/lib/server/planLeg";
import type { Place, Point } from "../src/lib/types";

interface GroupToCheck {
  label: string;
  categories: string;
  limit: number;
  radius: number;
  isFood: boolean;
}

// Every group the planner can ask for: the always-on ones, each interest, each stay style.
function allGroups(): GroupToCheck[] {
  const groups: GroupToCheck[] = [];
  for (const group of ALWAYS) {
    groups.push({ label: group.category + " (always)", categories: group.categories, limit: group.limit, radius: CITY_RADIUS_M, isFood: group.category === "food" });
  }
  for (const interest of Object.keys(BY_INTEREST) as (keyof typeof BY_INTEREST)[]) {
    const group = BY_INTEREST[interest];
    groups.push({ label: "interest: " + interest, categories: group.categories, limit: group.limit, radius: CITY_RADIUS_M, isFood: false });
  }
  for (const group of DISCOVERY) {
    groups.push({ label: "discovery: " + group.categories.split(",")[0], categories: group.categories, limit: group.limit, radius: CITY_RADIUS_M, isFood: false });
  }
  for (const style of Object.keys(STAY_CATEGORIES) as (keyof typeof STAY_CATEGORIES)[]) {
    groups.push({ label: "stay: " + style, categories: STAY_CATEGORIES[style], limit: 12, radius: STAY_RADIUS_M, isFood: false });
  }
  return groups;
}

async function profileOne(group: GroupToCheck, center: Point): Promise<GroupProfile> {
  try {
    const rows = await fetchRawPlaces(center, group.categories, group.limit, group.radius);
    return profileGroup(group.label, rows, center, group.isFood);
  } catch (error) {
    const empty = profileGroup(group.label, [], center, group.isFood);
    empty.flags = ["request failed: " + String(error)];
    return empty;
  }
}

function printProfiles(profiles: GroupProfile[]): void {
  const table: Record<string, string | number>[] = [];
  for (const profile of profiles) {
    table.push({
      group: profile.label,
      rows: profile.rows,
      "named %": profile.namedPercent,
      "area %": profile.areaPercent,
      "address %": profile.addressPercent,
      "cuisine %": profile.cuisinePercent,
      dupes: profile.duplicateNames,
      "median km": profile.medianKm,
      "max km": profile.farthestKm,
    });
  }
  console.table(table);

  console.log("\nData quality flags");
  let anyFlag = false;
  for (const profile of profiles) {
    for (const flag of profile.flags) {
      console.log("  " + profile.label + ": " + flag);
      anyFlag = true;
    }
    if (profile.topCuisines.length > 0) {
      console.log("  " + profile.label + " top cuisines: " + profile.topCuisines.join(", "));
    }
  }
  if (!anyFlag) {
    console.log("  none");
  }
}

// Every place the planner could offer in this city, measured and classified the same way.
async function classifiedCandidates(center: Point): Promise<Place[]> {
  // Famous places first, as in the planner, so they keep their Wikidata identity.
  const found: FoundPlace[] = await collectFamous(center);
  const groups = ALWAYS.slice();
  for (const interest of Object.keys(BY_INTEREST) as (keyof typeof BY_INTEREST)[]) {
    groups.push(BY_INTEREST[interest]);
  }
  for (const group of groups) {
    const batch = await fetchPlaces(center, group.categories, group.category, group.limit, CITY_RADIUS_M);
    for (const item of batch) {
      found.push(item);
    }
  }
  // Discovery finds go last, as in the planner; their names mark local finds.
  const discovered: Record<string, boolean> = {};
  for (const item of await collectDiscovery(center)) {
    found.push(item);
    discovered[item.name.toLowerCase()] = true;
  }
  const measured = await measureFame(numberPlaces(found, "p", {}));
  const discoveryIds: Record<string, boolean> = {};
  for (const place of measured) {
    if (discovered[place.name.toLowerCase()]) {
      discoveryIds[place.id] = true;
    }
  }
  return classifyPlaces(measured, { iconCount: ICON_COUNT, discoveryIds });
}

function mostFamousFirst(first: Place, second: Place): number {
  return second.fame - first.fame;
}

// The fame summary: what would be a must-see, and how many hidden finds there are to choose from.
function printFame(places: Place[]): void {
  const icons: Place[] = [];
  let hidden = 0;
  let local = 0;
  let withWikidata = 0;
  for (const place of places) {
    if (place.tier === "icon") {
      icons.push(place);
    }
    if (place.tier === "hidden") {
      hidden = hidden + 1;
    }
    if (place.tier === "local") {
      local = local + 1;
    }
    if (place.wikidataId !== "") {
      withWikidata = withWikidata + 1;
    }
  }
  icons.sort(mostFamousFirst);

  console.log("\nFame (Wikipedia editions, from Wikidata)");
  console.log("  " + places.length + " candidates, " + withWikidata + " with a Wikidata record");
  console.log("  Top icons:");
  if (icons.length === 0) {
    console.log("    none");
  }
  for (let rank = 0; rank < icons.length && rank < 10; rank++) {
    console.log("    " + String(icons[rank].fame).padStart(4) + "  " + icons[rank].name);
  }
  console.log("  Hidden candidates: " + hidden);
  console.log("  Local finds: " + local);
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    console.error("No .env.local found. Copy .env.example to .env.local and add your keys.");
    process.exit(1);
  }

  const city = process.argv.slice(2).join(" ").trim();
  if (city === "") {
    console.error('Usage: npm run explore -- "Lisbon"');
    process.exit(1);
  }

  // Same lookup as the planner, so "New York" means the city, not the state.
  const destination = await findDestination(city);
  const center = destination.point;
  if (center === null || destination.kind !== "place") {
    console.error("Couldn't find a town or city called " + city + " (" + destination.kind + ").");
    process.exit(1);
  }
  console.log("Profiling places around " + center.name + " (" + center.lat.toFixed(4) + ", " + center.lon.toFixed(4) + ")\n");

  // One group at a time, like the planner, to stay inside the free rate limit.
  const profiles: GroupProfile[] = [];
  for (const group of allGroups()) {
    profiles.push(await profileOne(group, center));
  }
  printProfiles(profiles);
  printFame(await classifiedCandidates(center));
}

main();
