// Shared vocabulary for the whole app: what a trip, a stop and a place look like.

export type Currency = "EUR" | "USD" | "GBP" | "MAD";
export type Pace = "slow" | "balanced" | "full";
export type StayStyle = "budget" | "comfort" | "treat";
export type Interest = "history" | "museums" | "nature" | "beaches" | "nightlife" | "shopping";
// How far off the beaten path to go: mostly famous places, a mix, or mostly hidden finds.
export type TripStyle = "classic" | "balanced" | "adventurous";

export type PlaceCategory =
  | "sight"
  | "museum"
  | "nature"
  | "beach"
  | "nightlife"
  | "shopping"
  | "food"
  | "cafe"
  | "stay";

// How well known a place is, measured from Wikipedia (see src/lib/fame.ts).
export type PlaceTier = "icon" | "classic" | "hidden" | "local";

// A real venue returned by the places API. The AI may only pick from these.
export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  address: string;
  cuisine: string;
  wikidataId: string;
  fame: number;
  tier: PlaceTier;
  wikiUrl: string;
}

export interface Point {
  name: string;
  lat: number;
  lon: number;
}

// One visit inside a day. Times are NOT stored: they are recalculated from durations.
export interface Stop {
  uid: string;
  placeId: string;
  durationMinutes: number;
  costPerPerson: number;
  note: string;
}

export interface Day {
  title: string;
  stops: Stop[];
}

export interface Preferences {
  interests: Interest[];
  stayStyle: StayStyle;
  stayArea: string;
  food: string;
  mustSee: string;
  pace: Pace;
  tripStyle: TripStyle;
}

// Everything the server needs to plan one destination.
export interface LegRequest {
  city: string;
  nights: number;
  travelers: number;
  currency: Currency;
  dailyBudgetPerPerson: number;
  preferences: Preferences;
}

// The server's answer for one destination.
export interface LegPlan {
  cityName: string;
  center: Point;
  places: Place[];
  stays: Place[];
  stayPlaceId: string;
  nightlyPricePerRoom: number;
  localTransportPerPersonPerDay: number;
  days: Day[];
  tips: string[];
}

export type LegStatus = "idle" | "loading" | "ready" | "error";

// One destination as the browser holds it: what the traveller typed, plus the plan.
export interface Leg {
  city: string;
  nights: number;
  status: LegStatus;
  error: string;
  plannedFor: string;
  plan: LegPlan | null;
}

export interface Trip {
  travelers: number;
  rooms: number;
  origin: string;
  originPoint: Point | null;
  startDate: string;
  budget: number;
  currency: Currency;
  preferences: Preferences;
  legs: Leg[];
  transferOverrides: Record<string, number>;
}
