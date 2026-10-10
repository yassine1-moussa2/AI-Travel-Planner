// How numbers and categories are said to the traveller, in plain words.
import type { Hop, TransferEstimate } from "./geo";
import type { Currency, Interest, Pace, PlaceCategory, StayStyle } from "./types";

export function formatMoney(amount: number, currency: Currency): string {
  const formatter = new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 });
  return formatter.format(amount);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return minutes + " min";
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) {
    return hours + " h";
  }
  return hours + " h " + rest;
}

export const CATEGORY_WORDS: Record<PlaceCategory, string> = {
  sight: "to see",
  museum: "museum",
  nature: "outdoors",
  beach: "beach",
  nightlife: "evening drinks",
  shopping: "shopping",
  food: "a meal",
  cafe: "coffee",
  stay: "a bed",
};

export const INTEREST_WORDS: Record<Interest, string> = {
  history: "Old streets and history",
  museums: "Museums and art",
  nature: "Parks and fresh air",
  beaches: "Beaches",
  nightlife: "A drink after dark",
  shopping: "Markets and shops",
};

export const STYLE_WORDS: Record<StayStyle, string> = {
  budget: "Simple and cheap",
  comfort: "Comfortable",
  treat: "A real treat",
};

export const PACE_WORDS: Record<Pace, string> = {
  slow: "Slow mornings",
  balanced: "A good balance",
  full: "See everything",
};

export function describeHop(hop: Hop): string {
  if (hop.mode === "walk") {
    return hop.minutes + " min on foot";
  }
  return hop.minutes + " min by metro or bus";
}

export function describeTransfer(estimate: TransferEstimate): string {
  if (estimate.mode === "flight") {
    return "about " + estimate.hours + " h door to door by plane, " + estimate.km + " km";
  }
  return "about " + estimate.hours + " h by train or coach, " + estimate.km + " km";
}
