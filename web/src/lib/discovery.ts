// What the plan is still missing, and where it would fit. Pure, so it runs on every edit.
import { distanceKm } from "./geo";
import type { Hop } from "./geo";
import type { LegPlan, Place } from "./types";

// A hop longer than this gets a "long trip across town" notice.
export const LONG_HOP_MINUTES = 45;

export function isLongHop(hop: Hop): boolean {
  return hop.minutes > LONG_HOP_MINUTES;
}

function mostFamousFirst(first: Place, second: Place): number {
  return second.fame - first.fame;
}

// Icons of this destination that no day visits yet, most famous first.
export function missingIcons(plan: LegPlan): Place[] {
  const used: Record<string, boolean> = {};
  for (const day of plan.days) {
    for (const stop of day.stops) {
      used[stop.placeId] = true;
    }
  }
  const missing: Place[] = [];
  for (const place of plan.places) {
    if (place.tier === "icon" && !used[place.id]) {
      missing.push(place);
    }
  }
  missing.sort(mostFamousFirst);
  return missing;
}

// The day whose stops come closest to a place: adding it there costs the least travel.
// Empty days are skipped; if every day is empty, the first day is the answer.
export function nearestDay(plan: LegPlan, place: Place, index: Record<string, Place>): number {
  let bestDay = 0;
  let bestKm = Infinity;
  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    for (const stop of plan.days[dayIndex].stops) {
      const other = index[stop.placeId];
      if (other === undefined) {
        continue;
      }
      const km = distanceKm(place.lat, place.lon, other.lat, other.lon);
      if (km < bestKm) {
        bestKm = km;
        bestDay = dayIndex;
      }
    }
  }
  return bestDay;
}
