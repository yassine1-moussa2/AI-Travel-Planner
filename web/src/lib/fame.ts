// Sorts real places into icons, classics, hidden finds and local finds.
// Fame is the number of Wikipedia editions writing about a place: measured, never guessed.
// Pure: no network, so it runs the same in tests, on the server and in the browser.
import type { Place, PlaceTier } from "./types";

// How many of the most famous sights count as must-sees, and how famous they must be.
export const ICON_COUNT = 8;
export const ICON_MIN_FAME = 10;
// A place with its own Wikidata record but written about in only a few languages.
export const HIDDEN_MAX_FAME = 5;

export interface FameSettings {
  // Most styles use ICON_COUNT; an adventurous traveller gets fewer must-sees.
  iconCount: number;
  // Places found by the discovery searches (viewpoints, markets, vintage shops…).
  discoveryIds: Record<string, boolean>;
}

function mostFamousFirst(first: Place, second: Place): number {
  return second.fame - first.fame;
}

// The ids of the top sights by fame, above the minimum.
function iconIds(places: Place[], iconCount: number): Record<string, boolean> {
  const sights: Place[] = [];
  for (const place of places) {
    if (place.category === "sight" && place.fame >= ICON_MIN_FAME) {
      sights.push(place);
    }
  }
  sights.sort(mostFamousFirst);

  const ids: Record<string, boolean> = {};
  for (let rank = 0; rank < sights.length && rank < iconCount; rank++) {
    ids[sights[rank].id] = true;
  }
  return ids;
}

function tierOf(place: Place, icons: Record<string, boolean>, discoveryIds: Record<string, boolean>): PlaceTier {
  if (icons[place.id]) {
    return "icon";
  }
  // Has a Wikipedia life, but a small one: known to some, missed by most visitors.
  if (place.wikidataId !== "" && place.fame >= 1 && place.fame <= HIDDEN_MAX_FAME) {
    return "hidden";
  }
  // No Wikipedia life at all, found by a discovery search: the kind of place only locals know.
  if (place.wikidataId === "" && place.name.trim() !== "" && discoveryIds[place.id]) {
    return "local";
  }
  return "classic";
}

// Return copies of the places, each with its tier set. Unknown fame (-1) is never an icon or hidden.
export function classifyPlaces(places: Place[], settings: FameSettings): Place[] {
  const icons = iconIds(places, settings.iconCount);
  const classified: Place[] = [];
  for (const place of places) {
    const copy = { ...place };
    copy.tier = tierOf(place, icons, settings.discoveryIds);
    classified.push(copy);
  }
  return classified;
}
