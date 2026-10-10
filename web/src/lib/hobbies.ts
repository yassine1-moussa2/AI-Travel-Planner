// What the group loves, and the real-place searches each hobby adds.
// Every category was checked against Geoapify's list and real results in Lisbon and New York.
// Pure: shared by the form, the server and the tests.
import { z } from "zod";
import type { PlaceCategory } from "./types";

export const HOBBY_IDS = [
  "photography",
  "street-art",
  "architecture",
  "food-markets",
  "vintage",
  "outlets",
  "live-music",
  "sport",
  "books",
  "wine-beer",
  "coffee",
  "gardens",
  "kids",
  "hiking",
] as const;

export type Hobby = (typeof HOBBY_IDS)[number];

export const hobbySchema = z.enum(HOBBY_IDS);

// At most this many hobby searches per city; further hobbies still reach the AI as words.
export const MAX_HOBBY_SEARCHES = 4;

export interface HobbySearch {
  categories: string;
  category: PlaceCategory;
  limit: number;
  radius: number;
  nameContains?: string;
}

export interface HobbyInfo {
  label: string;
  searches: HobbySearch[];
}

const CITY = 5000;
const AROUND = 20000;

export const HOBBIES: Record<Hobby, HobbyInfo> = {
  photography: { label: "Photography", searches: [{ categories: "tourism.attraction.viewpoint", category: "sight", limit: 10, radius: CITY }] },
  // Geoapify has no graffiti category; murals are the closest (and find azulejo panels in Lisbon).
  "street-art": { label: "Street art", searches: [{ categories: "tourism.attraction.artwork.mural", category: "sight", limit: 10, radius: CITY }] },
  architecture: { label: "Architecture", searches: [{ categories: "building.historic", category: "sight", limit: 10, radius: CITY }] },
  "food-markets": { label: "Food markets", searches: [{ categories: "commercial.marketplace", category: "shopping", limit: 8, radius: CITY }] },
  vintage: { label: "Vintage and second-hand", searches: [{ categories: "commercial.second_hand", category: "shopping", limit: 8, radius: CITY }] },
  // Also an interest chip; kept here so free text like "bargain hunting" can reach it.
  outlets: { label: "Outlets and deals", searches: [{ categories: "commercial.shopping_mall", category: "shopping", limit: 20, radius: 60000, nameContains: "outlet" }] },
  // No Geoapify category for music venues: this one only reaches the AI as words.
  "live-music": { label: "Live music", searches: [] },
  // The nearest stadiums are small local pitches; 20 within 15 km reach Estádio da Luz and
  // Yankee Stadium, and fame then puts the famous ones first.
  sport: { label: "Football and sport", searches: [{ categories: "sport.stadium", category: "sight", limit: 20, radius: 15000 }] },
  books: { label: "Books", searches: [{ categories: "commercial.books", category: "shopping", limit: 8, radius: CITY }] },
  // Wine shops in New York are mostly liquor stores, so only places that make wine or beer.
  "wine-beer": { label: "Wine and beer", searches: [{ categories: "production.winery,production.brewery", category: "nightlife", limit: 8, radius: AROUND }] },
  coffee: { label: "Coffee", searches: [{ categories: "catering.cafe.coffee_shop", category: "cafe", limit: 8, radius: CITY }] },
  gardens: { label: "Gardens", searches: [{ categories: "leisure.park.garden", category: "nature", limit: 8, radius: CITY }] },
  // Zoos and aquariums are on the edge of town (Lisbon's Oceanário is 7 km out); playgrounds nearby.
  kids: {
    label: "Kids and family",
    searches: [
      { categories: "entertainment.zoo,entertainment.aquarium,entertainment.theme_park", category: "nature", limit: 8, radius: AROUND },
      { categories: "leisure.playground", category: "nature", limit: 4, radius: 2000 },
    ],
  },
  // national_park returned nothing within 20 km of Lisbon or New York, so nature reserves only.
  hiking: { label: "Hiking and nature", searches: [{ categories: "leisure.park.nature_reserve", category: "nature", limit: 8, radius: AROUND }] },
};

// The hobby chips shown in the form. "Outlets and deals" is already an interest chip above.
export const HOBBY_CHIPS: Hobby[] = [];
for (const hobby of HOBBY_IDS) {
  if (hobby !== "outlets") {
    HOBBY_CHIPS.push(hobby);
  }
}

// Chosen hobbies first, then ones read from the traveller's own words, without repeats.
export function mergeHobbies(chosen: Hobby[], fromText: Hobby[]): Hobby[] {
  const merged: Hobby[] = [];
  for (const hobby of chosen) {
    if (!merged.includes(hobby)) {
      merged.push(hobby);
    }
  }
  for (const hobby of fromText) {
    if (!merged.includes(hobby)) {
      merged.push(hobby);
    }
  }
  return merged;
}

// The searches to run, in hobby order, stopping at MAX_HOBBY_SEARCHES.
export function hobbySearches(hobbies: Hobby[]): HobbySearch[] {
  const searches: HobbySearch[] = [];
  for (const hobby of hobbies) {
    for (const search of HOBBIES[hobby].searches) {
      if (searches.length < MAX_HOBBY_SEARCHES) {
        searches.push(search);
      }
    }
  }
  return searches;
}

// Keep only answers that are on the fixed list. Free text can add known searches, never new ones.
export function keepKnownHobbies(values: unknown[]): Hobby[] {
  const known: Hobby[] = [];
  for (const value of values) {
    const checked = hobbySchema.safeParse(value);
    if (checked.success && !known.includes(checked.data)) {
      known.push(checked.data);
    }
  }
  return known;
}
