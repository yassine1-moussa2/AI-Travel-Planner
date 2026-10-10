// Profiles what the places API returns for a city, group by group, the same way the planner asks.
// Use it to tune radius, limits and categories with evidence instead of guesses.
//
// Usage:  npm run explore -- "Lisbon"
import { profileGroup } from "../src/lib/profile";
import type { GroupProfile } from "../src/lib/profile";
import { fetchRawPlaces, geocode } from "../src/lib/server/geoapify";
import { ALWAYS, BY_INTEREST, CITY_RADIUS_M, STAY_CATEGORIES, STAY_RADIUS_M } from "../src/lib/server/planLeg";
import type { Point } from "../src/lib/types";

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

  const center = await geocode(city, null);
  if (center === null) {
    console.error("Couldn't find " + city + " on the map.");
    process.exit(1);
  }
  console.log("Profiling places around " + center.name + " (" + center.lat.toFixed(4) + ", " + center.lon.toFixed(4) + ")\n");

  // One group at a time, like the planner, to stay inside the free rate limit.
  const profiles: GroupProfile[] = [];
  for (const group of allGroups()) {
    profiles.push(await profileOne(group, center));
  }
  printProfiles(profiles);
}

main();
