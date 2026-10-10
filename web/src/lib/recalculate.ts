// Turns a trip into clock times and money. Runs in the browser on every edit,
// so it must be fast, pure and never call the network.
import { distanceKm, estimateTransfer, hopBetween } from "./geo";
import type { Hop, TransferEstimate } from "./geo";
import type { Day, LegPlan, Pace, Place, Point, Stop, Trip } from "./types";

const LUNCH_FROM = 11 * 60 + 30;
const LUNCH_UNTIL = 14 * 60 + 30;
const LATE_EVENING = 22 * 60;

export interface ScheduledStop {
  stop: Stop;
  place: Place | null;
  startMinutes: number;
  endMinutes: number;
  hopBefore: Hop | null;
}

export interface ScheduledDay {
  stops: ScheduledStop[];
  endsLate: boolean;
  missingLunch: boolean;
}

export function dayStartMinutes(pace: Pace): number {
  if (pace === "slow") {
    return 10 * 60;
  }
  if (pace === "full") {
    return 8 * 60 + 30;
  }
  return 9 * 60;
}

export function formatClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
}

// Index every place of a leg by id so stops can find their venue quickly.
export function placesById(plan: LegPlan): Record<string, Place> {
  const index: Record<string, Place> = {};
  for (const place of plan.places) {
    index[place.id] = place;
  }
  for (const stay of plan.stays) {
    index[stay.id] = stay;
  }
  return index;
}

// Walk through a day in order: each stop starts after the previous one ends plus travel time.
export function scheduleDay(day: Day, index: Record<string, Place>, pace: Pace): ScheduledDay {
  const scheduled: ScheduledStop[] = [];
  let clock = dayStartMinutes(pace);
  let previousPlace: Place | null = null;
  let hasLunch = false;

  for (const stop of day.stops) {
    const place = index[stop.placeId] || null;
    let hop: Hop | null = null;

    if (previousPlace !== null && place !== null) {
      const km = distanceKm(previousPlace.lat, previousPlace.lon, place.lat, place.lon);
      hop = hopBetween(km);
      clock = clock + hop.minutes;
    }

    const start = clock;
    const end = start + stop.durationMinutes;
    scheduled.push({ stop, place, startMinutes: start, endMinutes: end, hopBefore: hop });

    if (place !== null && place.category === "food" && start >= LUNCH_FROM && start <= LUNCH_UNTIL) {
      hasLunch = true;
    }
    clock = end;
    previousPlace = place;
  }

  const endsLate = clock > LATE_EVENING;
  const missingLunch = day.stops.length > 0 && !hasLunch;
  return { stops: scheduled, endsLate, missingLunch };
}

// The date of a given day, counted from the trip start ("" if no start date was given).
export function formatDayDate(startDate: string, offsetDays: number): string {
  if (startDate === "") {
    return "";
  }
  const parts = startDate.split("-");
  const utcMillis = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + offsetDays);
  const date = new Date(utcMillis);
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// How many days into the trip each destination begins.
export function legStartOffsets(trip: Trip): number[] {
  const offsets: number[] = [];
  let running = 0;
  for (const leg of trip.legs) {
    offsets.push(running);
    running = running + leg.nights;
  }
  return offsets;
}

export interface TransferLine {
  key: string;
  fromName: string;
  toName: string;
  estimate: TransferEstimate;
  costPerPerson: number;
}

function legPoint(trip: Trip, legIndex: number): Point | null {
  const plan = trip.legs[legIndex].plan;
  if (plan === null) {
    return null;
  }
  return plan.center;
}

function makeTransfer(trip: Trip, key: string, from: Point, to: Point): TransferLine {
  const km = distanceKm(from.lat, from.lon, to.lat, to.lon);
  const estimate = estimateTransfer(km, trip.currency);
  let cost = estimate.costPerPerson;
  if (key in trip.transferOverrides) {
    cost = trip.transferOverrides[key];
  }
  return { key, fromName: from.name, toName: to.name, estimate, costPerPerson: cost };
}

// Every journey between places: home to the first city, city to city, and back home.
export function buildTransfers(trip: Trip): TransferLine[] {
  const lines: TransferLine[] = [];
  const legCount = trip.legs.length;

  const firstCity = legPoint(trip, 0);
  if (trip.originPoint !== null && firstCity !== null) {
    lines.push(makeTransfer(trip, "out", trip.originPoint, firstCity));
  }

  for (let legIndex = 0; legIndex < legCount - 1; legIndex++) {
    const from = legPoint(trip, legIndex);
    const to = legPoint(trip, legIndex + 1);
    if (from !== null && to !== null) {
      lines.push(makeTransfer(trip, "leg-" + legIndex, from, to));
    }
  }

  const lastCity = legPoint(trip, legCount - 1);
  if (trip.originPoint !== null && lastCity !== null) {
    lines.push(makeTransfer(trip, "home", lastCity, trip.originPoint));
  }
  return lines;
}

export interface Budget {
  stays: number;
  visitsAndFood: number;
  localTransport: number;
  transfers: number;
  total: number;
  perPerson: number;
  remaining: number;
  biggestLabel: string;
}

function sumStopCosts(days: Day[]): number {
  let total = 0;
  for (const day of days) {
    for (const stop of day.stops) {
      total = total + stop.costPerPerson;
    }
  }
  return total;
}

// Add everything up. Only destinations that have a plan contribute.
export function computeBudget(trip: Trip): Budget {
  let stays = 0;
  let visitsAndFood = 0;
  let localTransport = 0;

  for (const leg of trip.legs) {
    if (leg.plan === null) {
      continue;
    }
    stays = stays + leg.plan.nightlyPricePerRoom * trip.rooms * leg.nights;
    visitsAndFood = visitsAndFood + sumStopCosts(leg.plan.days) * trip.travelers;
    localTransport = localTransport + leg.plan.localTransportPerPersonPerDay * trip.travelers * leg.plan.days.length;
  }

  let transfers = 0;
  for (const line of buildTransfers(trip)) {
    transfers = transfers + line.costPerPerson * trip.travelers;
  }

  const total = stays + visitsAndFood + localTransport + transfers;
  const perPerson = total / Math.max(1, trip.travelers);

  // Name the largest slice so an over-budget message can point at it.
  let biggestLabel = "where you sleep";
  let biggestValue = stays;
  if (visitsAndFood > biggestValue) {
    biggestLabel = "meals and visits";
    biggestValue = visitsAndFood;
  }
  if (transfers > biggestValue) {
    biggestLabel = "getting between cities";
  }

  return {
    stays: Math.round(stays),
    visitsAndFood: Math.round(visitsAndFood),
    localTransport: Math.round(localTransport),
    transfers: Math.round(transfers),
    total: Math.round(total),
    perPerson: Math.round(perPerson),
    remaining: Math.round(trip.budget - total),
    biggestLabel,
  };
}

// What each person can spend per day on meals and visits, sent to the AI as guidance.
// The rest of the money is assumed to go on beds and transport; the share depends on stay style.
export function dailyBudgetPerPerson(trip: Trip): number {
  let totalNights = 0;
  for (const leg of trip.legs) {
    totalNights = totalNights + leg.nights;
  }
  const perPersonPerDay = trip.budget / Math.max(1, trip.travelers) / Math.max(1, totalNights);

  let share = 0.4;
  if (trip.preferences.stayStyle === "budget") {
    share = 0.5;
  }
  if (trip.preferences.stayStyle === "treat") {
    share = 0.35;
  }
  return Math.round(perPersonPerDay * share);
}
