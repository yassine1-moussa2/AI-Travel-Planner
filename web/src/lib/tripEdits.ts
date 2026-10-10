// Every change a traveller can make to their programme.
// Each function copies the trip, changes one thing on the copy, and returns it,
// so React sees a new object and recalculates times and money.
import type { LegPlan, Place, PlaceCategory, Stop, Trip } from "./types";

const DEFAULT_MINUTES: Record<PlaceCategory, number> = {
  food: 75,
  cafe: 40,
  museum: 90,
  sight: 60,
  nature: 60,
  beach: 120,
  nightlife: 90,
  shopping: 60,
  stay: 0,
};

let uidCounter = 0;

export function newUid(): string {
  uidCounter = uidCounter + 1;
  return "s" + Date.now().toString(36) + uidCounter;
}

function stopsOf(trip: Trip, legIndex: number, dayIndex: number): Stop[] {
  const plan = trip.legs[legIndex].plan;
  if (plan === null) {
    return [];
  }
  return plan.days[dayIndex].stops;
}

export function updateStopNumber(
  trip: Trip,
  legIndex: number,
  dayIndex: number,
  stopIndex: number,
  field: "durationMinutes" | "costPerPerson",
  value: number,
): Trip {
  const copy = structuredClone(trip);
  const stop = stopsOf(copy, legIndex, dayIndex)[stopIndex];
  let safeValue = Math.max(0, value);
  if (field === "durationMinutes") {
    safeValue = Math.min(Math.max(10, safeValue), 600);
  }
  stop[field] = safeValue;
  return copy;
}

export function removeStop(trip: Trip, legIndex: number, dayIndex: number, stopIndex: number): Trip {
  const copy = structuredClone(trip);
  stopsOf(copy, legIndex, dayIndex).splice(stopIndex, 1);
  return copy;
}

// Swap a stop with its neighbour: direction -1 moves it earlier, +1 later.
export function moveStop(trip: Trip, legIndex: number, dayIndex: number, stopIndex: number, direction: number): Trip {
  const copy = structuredClone(trip);
  const stops = stopsOf(copy, legIndex, dayIndex);
  const targetIndex = stopIndex + direction;
  if (targetIndex < 0 || targetIndex >= stops.length) {
    return trip;
  }
  const moving = stops[stopIndex];
  stops[stopIndex] = stops[targetIndex];
  stops[targetIndex] = moving;
  return copy;
}

export function moveStopToDay(trip: Trip, legIndex: number, fromDay: number, stopIndex: number, toDay: number): Trip {
  if (fromDay === toDay) {
    return trip;
  }
  const copy = structuredClone(trip);
  const removed = stopsOf(copy, legIndex, fromDay).splice(stopIndex, 1);
  stopsOf(copy, legIndex, toDay).push(removed[0]);
  return copy;
}

export function addStop(trip: Trip, legIndex: number, dayIndex: number, place: Place): Trip {
  const copy = structuredClone(trip);
  const stop: Stop = {
    uid: newUid(),
    placeId: place.id,
    durationMinutes: DEFAULT_MINUTES[place.category],
    costPerPerson: 0,
    note: "",
  };
  stopsOf(copy, legIndex, dayIndex).push(stop);
  return copy;
}

// Replace the venue of a stop but keep its slot in the day.
export function swapStop(trip: Trip, legIndex: number, dayIndex: number, stopIndex: number, place: Place): Trip {
  const copy = structuredClone(trip);
  const stop = stopsOf(copy, legIndex, dayIndex)[stopIndex];
  stop.placeId = place.id;
  stop.durationMinutes = DEFAULT_MINUTES[place.category];
  stop.note = "";
  return copy;
}

export function setStay(trip: Trip, legIndex: number, placeId: string): Trip {
  const copy = structuredClone(trip);
  const plan = copy.legs[legIndex].plan;
  if (plan !== null) {
    plan.stayPlaceId = placeId;
  }
  return copy;
}

export function setLegNumber(
  trip: Trip,
  legIndex: number,
  field: "nightlyPricePerRoom" | "localTransportPerPersonPerDay",
  value: number,
): Trip {
  const copy = structuredClone(trip);
  const plan = copy.legs[legIndex].plan;
  if (plan !== null) {
    plan[field] = Math.max(0, value);
  }
  return copy;
}

export function setTransferCost(trip: Trip, key: string, value: number): Trip {
  const copy = structuredClone(trip);
  copy.transferOverrides[key] = Math.max(0, value);
  return copy;
}

// Places of this destination not used on any day: the choices for "add" and "swap".
export function unusedPlaces(plan: LegPlan): Place[] {
  const used: Record<string, boolean> = {};
  for (const day of plan.days) {
    for (const stop of day.stops) {
      used[stop.placeId] = true;
    }
  }
  const free: Place[] = [];
  for (const place of plan.places) {
    if (!used[place.id]) {
      free.push(place);
    }
  }
  return free;
}
