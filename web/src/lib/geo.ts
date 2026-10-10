// Distance and travel-time estimates. Pure maths, no network.
import type { Currency } from "./types";

const EARTH_RADIUS_KM = 6371;
const WALKING_KMH = 4.5;
const CITY_TRANSIT_KMH = 18;
const TRANSIT_WAIT_MINUTES = 10;
const MAX_WALK_KM = 1.5;

// Rough conversion from EUR. Only used for transfer estimates, which the traveller can overwrite.
export const EUR_TO: Record<Currency, number> = { EUR: 1, USD: 1.1, GBP: 0.85, MAD: 10.8 };

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// Straight-line distance between two coordinates (haversine formula).
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const centralAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * centralAngle;
}

function roundUpToFive(minutes: number): number {
  return Math.ceil(minutes / 5) * 5;
}

export interface Hop {
  minutes: number;
  mode: "walk" | "transit";
}

// How long it takes to get between two stops in the same city.
export function hopBetween(km: number): Hop {
  if (km <= MAX_WALK_KM) {
    const walkMinutes = (km / WALKING_KMH) * 60;
    return { minutes: Math.max(5, roundUpToFive(walkMinutes)), mode: "walk" };
  }
  const rideMinutes = TRANSIT_WAIT_MINUTES + (km / CITY_TRANSIT_KMH) * 60;
  return { minutes: roundUpToFive(rideMinutes), mode: "transit" };
}

export interface TransferEstimate {
  km: number;
  mode: "ground" | "flight";
  hours: number;
  costPerPerson: number;
}

// Rough estimate for moving between cities: train/bus under 400 km, flight above.
export function estimateTransfer(km: number, currency: Currency): TransferEstimate {
  let hours = 0;
  let costInEuro = 0;
  let mode: "ground" | "flight" = "ground";

  if (km < 400) {
    hours = km / 80 + 0.5;
    costInEuro = 8 + km * 0.12;
  } else {
    mode = "flight";
    hours = km / 700 + 2.5;
    costInEuro = 50 + km * 0.07;
  }

  const cost = Math.round(costInEuro * EUR_TO[currency]);
  return { km: Math.round(km), mode, hours: Math.round(hours * 2) / 2, costPerPerson: cost };
}
