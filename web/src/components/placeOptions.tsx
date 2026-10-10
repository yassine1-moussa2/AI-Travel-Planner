// Builds <option> lists of places grouped by kind, for the "add" and "swap" menus.
import type { ReactNode } from "react";
import { CATEGORY_WORDS } from "@/lib/words";
import type { Place, PlaceCategory } from "@/lib/types";

const ORDER: PlaceCategory[] = ["food", "cafe", "sight", "museum", "nature", "beach", "nightlife", "shopping"];

export function placeOptionGroups(places: Place[]): ReactNode[] {
  const groups: ReactNode[] = [];
  for (const category of ORDER) {
    const options: ReactNode[] = [];
    for (const place of places) {
      if (place.category === category) {
        options.push(<option key={place.id} value={place.id}>{place.name}</option>);
      }
    }
    if (options.length > 0) {
      groups.push(<optgroup key={category} label={CATEGORY_WORDS[category]}>{options}</optgroup>);
    }
  }
  return groups;
}

export function findPlace(places: Place[], id: string): Place | null {
  for (const place of places) {
    if (place.id === id) {
      return place;
    }
  }
  return null;
}
