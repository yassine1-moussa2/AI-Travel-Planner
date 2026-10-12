/**
 * Shared types for the AI Travel Planner core engine.
 *
 * A "Place" is always a REAL place that came from a Places API. The LLM never
 * creates these — it only ever picks from a list of Places we hand it, and
 * refers to them by `id`. See src/itinerary/generateItinerary.ts.
 */

export interface Place {
  id: string; // stable id we control, e.g. "geoapify:51f7...4a"
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  address: string;
  priceLevel: number | null; // 0 (free) - 4 (very expensive), null if unknown
  description: string | null;
}

export type PlaceCategory = "sight" | "food" | "nightlife" | "nature";

export interface TripRequest {
  destination: string; // free-text, e.g. "Lisbon, Portugal"
  days: number;
  budget: number; // total trip budget, in the currency below
  currency: string; // e.g. "USD"
  interests: PlaceCategory[];
}

export interface ItineraryItem {
  place: Place;
  startTime: string; // "09:00"
  durationMin: number;
  note: string;
  estimatedCost: number;
}

export interface ItineraryDay {
  dayNumber: number;
  title: string;
  items: ItineraryItem[];
}

export interface Itinerary {
  days: ItineraryDay[];
  budgetBreakdown: {
    accommodation: number;
    food: number;
    activities: number;
    transport: number;
    total: number;
  };
  tips: string[];
}
