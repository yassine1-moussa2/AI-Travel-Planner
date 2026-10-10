// Chooses which real places the AI gets to see. Every place costs prompt tokens, so the list
// stays near 70, with slots reserved so icons, hidden finds and meals are never crowded out.
// Pure: no network.
import type { Place } from "./types";

export const MAX_CANDIDATES = 70;
// Local finds have no fame score, so without their own slots they would always sort last.
export const RESERVED = { icons: 8, hidden: 15, food: 20, cafes: 7, local: 10 };

export interface CandidateRules {
  // Places the traveller asked for by name: always kept.
  keepIds: Record<string, boolean>;
}

function mostFamousFirst(first: Place, second: Place): number {
  return second.fame - first.fame;
}

// Returns the chosen places in their original order, so ids and grouping stay stable.
export function selectCandidates(places: Place[], rules: CandidateRules): Place[] {
  const chosen: Record<string, boolean> = {};
  let count = 0;

  // Take up to `limit` places that pass the test, in the order given.
  function reserve(list: Place[], limit: number, test: (place: Place) => boolean): void {
    let taken = 0;
    for (const place of list) {
      if (taken >= limit || count >= MAX_CANDIDATES) {
        return;
      }
      if (!chosen[place.id] && test(place)) {
        chosen[place.id] = true;
        taken = taken + 1;
        count = count + 1;
      }
    }
  }

  const byFame = places.slice();
  byFame.sort(mostFamousFirst);

  reserve(places, MAX_CANDIDATES, (place) => rules.keepIds[place.id] === true);
  reserve(byFame, RESERVED.icons, (place) => place.tier === "icon");
  reserve(places, RESERVED.hidden, (place) => place.tier === "hidden");
  reserve(places, RESERVED.food, (place) => place.category === "food");
  reserve(places, RESERVED.cafes, (place) => place.category === "cafe");
  reserve(places, RESERVED.local, (place) => place.tier === "local");
  // Whatever room is left goes to the best-known of the rest (unknown fame sorts last).
  // Hidden finds already had their 15: "up to 15" is a cap, so they can't flood the list.
  reserve(byFame, MAX_CANDIDATES, (place) => place.tier !== "hidden");

  const selected: Place[] = [];
  for (const place of places) {
    if (chosen[place.id]) {
      selected.push(place);
    }
  }
  return selected;
}
