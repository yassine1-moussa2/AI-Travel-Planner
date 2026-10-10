// Keeps the trip in this browser, so a refresh never loses the plan.
// Nothing is sent anywhere: it stays on the traveller's own machine.
import type { Leg, Place, Trip } from "./types";

const STORAGE_KEY = "travel-planner-trip-v1";

export function emptyLeg(): Leg {
  return { city: "", nights: 3, status: "idle", error: "", plannedFor: "", plan: null };
}

export function defaultTrip(): Trip {
  return {
    travelers: 2,
    rooms: 1,
    origin: "",
    originPoint: null,
    startDate: "",
    budget: 1500,
    currency: "EUR",
    preferences: {
      interests: ["history", "nature"],
      stayStyle: "comfort",
      stayArea: "",
      food: "",
      mustSee: "",
      pace: "balanced",
      tripStyle: "balanced",
      hobbies: [],
      aboutText: "",
      stepFree: false,
    },
    legs: [emptyLeg()],
    transferOverrides: {},
  };
}

// A short fingerprint of what a destination was planned for, to notice later edits.
export function legKey(city: string, nights: number): string {
  return city.trim().toLowerCase() + "|" + nights;
}

// Trips saved before places had fame data get neutral values, so old plans still open.
function fillPlaceDefaults(places: Place[]): void {
  for (const place of places) {
    if (place.wikidataId === undefined) {
      place.wikidataId = "";
    }
    if (place.fame === undefined) {
      place.fame = -1;
    }
    if (place.tier === undefined) {
      place.tier = "classic";
    }
    if (place.wikiUrl === undefined) {
      place.wikiUrl = "";
    }
  }
}

export function loadTrip(): Trip | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      return null;
    }
    const trip = JSON.parse(saved) as Trip;
    if (!Array.isArray(trip.legs) || trip.legs.length === 0) {
      return null;
    }
    // Trips saved before these choices existed get the defaults.
    if (trip.preferences.tripStyle === undefined) {
      trip.preferences.tripStyle = "balanced";
    }
    if (trip.preferences.hobbies === undefined) {
      trip.preferences.hobbies = [];
    }
    if (trip.preferences.aboutText === undefined) {
      trip.preferences.aboutText = "";
    }
    if (trip.preferences.stepFree === undefined) {
      trip.preferences.stepFree = false;
    }
    // A plan that was mid-loading when the page closed can't finish now.
    for (const leg of trip.legs) {
      if (leg.status === "loading") {
        leg.status = "idle";
      }
      if (leg.plan !== null) {
        fillPlaceDefaults(leg.plan.places);
        fillPlaceDefaults(leg.plan.stays);
      }
    }
    return trip;
  } catch {
    return null;
  }
}

export function saveTrip(trip: Trip): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
  } catch {
    // Storage full or blocked: the plan still works, it just won't survive a refresh.
  }
}

export function clearTrip(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
