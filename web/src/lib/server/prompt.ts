// Builds the instructions sent to the AI for one destination.
import { dayStartMinutes, formatClock } from "../recalculate";
import type { LegRequest, Place } from "../types";

export const SYSTEM_PROMPT =
  "You are a friend who lives in the city and plans trips for visitors. " +
  "You may ONLY use places from the lists you are given, referenced by their id. " +
  "Never invent a place. Reply with a single JSON object and nothing else.";

const STOPS_PER_DAY = { slow: "4 to 5", balanced: "5 to 6", full: "6 to 8" };

const STYLE_WORDS = {
  budget: "simple and cheap (hostel or guesthouse)",
  comfort: "comfortable mid-range",
  treat: "a treat, upscale",
};

function describePlace(place: Place, extra: string): string {
  let line = place.id + " | " + place.name + " | " + place.category;
  if (place.cuisine !== "") {
    line = line + " | cuisine: " + place.cuisine;
  }
  if (extra !== "") {
    line = line + " | area: " + extra;
  }
  return line;
}

export function buildLegPrompt(input: LegRequest, cityName: string, places: Place[], stays: Place[], areas: Record<string, string>): string {
  const prefs = input.preferences;
  const lines: string[] = [];

  lines.push("Plan " + input.nights + " day(s) in " + cityName + " for " + input.travelers + " traveller(s).");
  lines.push("Each day starts around " + formatClock(dayStartMinutes(prefs.pace)) + ". Aim for " + STOPS_PER_DAY[prefs.pace] + " stops per day.");
  lines.push("Money: about " + input.dailyBudgetPerPerson + " " + input.currency + " per person per day for meals and visits together. All prices in " + input.currency + ".");
  if (prefs.interests.length > 0) {
    lines.push("They love: " + prefs.interests.join(", ") + ".");
  }
  if (prefs.food.trim() !== "") {
    lines.push("Food wishes (respect them when choosing restaurants): " + prefs.food.trim() + ".");
  }
  if (prefs.mustSee.trim() !== "") {
    lines.push("Must include: " + prefs.mustSee.trim() + ".");
  }
  let stayWish = "Where they want to sleep: " + STYLE_WORDS[prefs.stayStyle];
  if (prefs.stayArea.trim() !== "") {
    stayWish = stayWish + ", near " + prefs.stayArea.trim();
  }
  lines.push(stayWish + ".");

  lines.push("");
  lines.push("PLACES (id | name | type | details):");
  for (const place of places) {
    lines.push(describePlace(place, areas[place.id] || ""));
  }
  lines.push("");
  lines.push("STAYS (id | name | type):");
  for (const stay of stays) {
    lines.push(describePlace(stay, areas[stay.id] || ""));
  }

  lines.push("");
  lines.push("Rules:");
  lines.push("- Every day has lunch at a food place in the middle of the day and dinner at a food place as the last or second-to-last stop. A cafe can open the day.");
  lines.push("- Order each day so consecutive stops are close together (use the areas).");
  lines.push("- Never use the same place twice across the whole stay.");
  lines.push("- costPerPerson: realistic entry ticket or meal price for ONE person; 0 for free places like parks, viewpoints and squares.");
  lines.push("- durationMinutes: realistic time spent there.");
  lines.push("- note: one specific sentence a local friend would say (what to order, where to sit, when to go). No clichés such as 'hidden gem', 'vibrant' or 'must-see'.");
  lines.push("- title: a short day title (max 6 words) naming the areas visited.");
  lines.push("- stayPlaceId: the stay that best matches their style and area. nightlyPricePerRoom: typical price of one double room per night there.");
  lines.push("- localTransportPerPersonPerDay: typical metro/bus/tram spend per person per day in this city.");
  lines.push("- tips: 3 short practical tips specific to " + cityName + ".");
  lines.push("");
  lines.push('JSON shape: {"days":[{"title":"","stops":[{"placeId":"","durationMinutes":0,"costPerPerson":0,"note":""}]}],"stayPlaceId":"","nightlyPricePerRoom":0,"localTransportPerPersonPerDay":0,"tips":[""]}');
  lines.push("Return exactly " + input.nights + " day(s).");

  return lines.join("\n");
}
