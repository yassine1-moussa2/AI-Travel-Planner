// Tests for the logic the website promises: edits recalculate times and money correctly,
// and the AI can never smuggle in a place we didn't give it.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, hopBetween } from "../src/lib/geo";
import { groundDays } from "../src/lib/grounding";
import { buildTransfers, computeBudget, formatClock, placesById, scheduleDay } from "../src/lib/recalculate";
import { defaultTrip } from "../src/lib/storage";
import { moveStopToDay, removeStop, swapStop, updateStopNumber } from "../src/lib/tripEdits";
import type { LegPlan, Place, Trip } from "../src/lib/types";

// Three real-ish Lisbon spots: a cafe and a square ~500 m apart, a restaurant ~3 km away.
const cafe: Place = { id: "p1", name: "Corner Cafe", category: "cafe", lat: 38.7105, lon: -9.1366, address: "", cuisine: "" };
const square: Place = { id: "p2", name: "Big Square", category: "sight", lat: 38.7075, lon: -9.1364, address: "", cuisine: "" };
const lunch: Place = { id: "p3", name: "Fish House", category: "food", lat: 38.7300, lon: -9.1500, address: "", cuisine: "seafood" };
const spare: Place = { id: "p4", name: "Hill Garden", category: "nature", lat: 38.7150, lon: -9.1400, address: "", cuisine: "" };
const hotel: Place = { id: "h1", name: "Sunny Hotel", category: "stay", lat: 38.7110, lon: -9.1370, address: "", cuisine: "" };

function lisbonPlan(): LegPlan {
  return {
    cityName: "Lisbon, Portugal",
    center: { name: "Lisbon, Portugal", lat: 38.7077, lon: -9.1365 },
    places: [cafe, square, lunch, spare],
    stays: [hotel],
    stayPlaceId: "h1",
    nightlyPricePerRoom: 100,
    localTransportPerPersonPerDay: 6,
    days: [
      {
        title: "Downtown",
        stops: [
          { uid: "a", placeId: "p1", durationMinutes: 40, costPerPerson: 5, note: "" },
          { uid: "b", placeId: "p2", durationMinutes: 60, costPerPerson: 0, note: "" },
          { uid: "c", placeId: "p3", durationMinutes: 75, costPerPerson: 25, note: "" },
        ],
      },
      { title: "Hills", stops: [] },
    ],
    tips: [],
  };
}

function lisbonTrip(): Trip {
  const trip = defaultTrip();
  trip.travelers = 2;
  trip.rooms = 1;
  trip.budget = 1000;
  trip.legs[0].city = "Lisbon";
  trip.legs[0].nights = 2;
  trip.legs[0].status = "ready";
  trip.legs[0].plan = lisbonPlan();
  return trip;
}

function firstDay(trip: Trip) {
  const plan = trip.legs[0].plan as LegPlan;
  return scheduleDay(plan.days[0], placesById(plan), trip.preferences.pace);
}

test("distance between Lisbon and Porto is about 274 km", () => {
  const km = distanceKm(38.7223, -9.1393, 41.1579, -8.6291);
  assert.ok(km > 265 && km < 285, "got " + km);
});

test("short hops are walked, long hops use transit", () => {
  assert.deepEqual(hopBetween(0.5), { minutes: 10, mode: "walk" });
  assert.deepEqual(hopBetween(3), { minutes: 20, mode: "transit" });
});

test("a day is laid out from the pace start time, with travel between stops", () => {
  const day = firstDay(lisbonTrip());
  assert.equal(formatClock(day.stops[0].startMinutes), "09:00");
  assert.equal(formatClock(day.stops[0].endMinutes), "09:40");
  // ~330 m walk from cafe to square -> rounded up to 5 minutes.
  assert.equal(formatClock(day.stops[1].startMinutes), "09:45");
  assert.equal(day.stops[1].hopBefore?.mode, "walk");
});

test("making one visit longer pushes every later stop back", () => {
  const before = firstDay(lisbonTrip());
  const edited = updateStopNumber(lisbonTrip(), 0, 0, 0, "durationMinutes", 100);
  const after = firstDay(edited);
  assert.equal(after.stops[1].startMinutes - before.stops[1].startMinutes, 60);
  assert.equal(after.stops[2].startMinutes - before.stops[2].startMinutes, 60);
});

test("a day without a midday meal is flagged", () => {
  const day = firstDay(lisbonTrip());
  // Lunch currently starts around 11:00, before the 11:30 window.
  assert.equal(day.missingLunch, true);

  const longer = updateStopNumber(lisbonTrip(), 0, 0, 1, "durationMinutes", 90);
  assert.equal(firstDay(longer).missingLunch, false);
});

test("budget adds beds, meals and visits, and local transport", () => {
  const budget = computeBudget(lisbonTrip());
  assert.equal(budget.stays, 200);          // 100 per room x 1 room x 2 nights
  assert.equal(budget.visitsAndFood, 60);   // (5 + 0 + 25) per person x 2 people
  assert.equal(budget.localTransport, 24);  // 6 x 2 people x 2 days
  assert.equal(budget.total, 284);
  assert.equal(budget.remaining, 716);
  assert.equal(budget.perPerson, 142);
});

test("adding a traveller scales per-person costs but not the room", () => {
  const trip = lisbonTrip();
  trip.travelers = 3;
  const budget = computeBudget(trip);
  assert.equal(budget.stays, 200);
  assert.equal(budget.visitsAndFood, 90);
});

test("removing a paid stop lowers the total immediately", () => {
  const edited = removeStop(lisbonTrip(), 0, 0, 2);
  assert.equal(computeBudget(edited).visitsAndFood, 10);
});

test("edits never change the original trip object", () => {
  const original = lisbonTrip();
  removeStop(original, 0, 0, 0);
  assert.equal((original.legs[0].plan as LegPlan).days[0].stops.length, 3);
});

test("moving a stop to another day and swapping a venue", () => {
  const moved = moveStopToDay(lisbonTrip(), 0, 0, 1, 1);
  const plan = moved.legs[0].plan as LegPlan;
  assert.equal(plan.days[0].stops.length, 2);
  assert.equal(plan.days[1].stops[0].placeId, "p2");

  const swapped = swapStop(lisbonTrip(), 0, 0, 1, spare);
  assert.equal((swapped.legs[0].plan as LegPlan).days[0].stops[1].placeId, "p4");
});

test("journeys home appear once a home city is known, and overrides win", () => {
  const trip = lisbonTrip();
  assert.equal(buildTransfers(trip).length, 0);

  trip.originPoint = { name: "Paris, France", lat: 48.8566, lon: 2.3522 };
  const lines = buildTransfers(trip);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].estimate.mode, "flight");

  trip.transferOverrides.out = 79;
  assert.equal(buildTransfers(trip)[0].costPerPerson, 79);
});

test("grounding drops invented and repeated places and fills missing days", () => {
  const valid = { p1: true, p2: true };
  const aiDays = [
    {
      title: "Day one",
      stops: [
        { placeId: "p1", durationMinutes: 42, costPerPerson: 4.6, note: "Sit outside." },
        { placeId: "p99", durationMinutes: 60, costPerPerson: 10, note: "Made up." },
        { placeId: "p1", durationMinutes: 30, costPerPerson: 0, note: "Twice." },
        { placeId: "p2", durationMinutes: 9999, costPerPerson: -5, note: "" },
      ],
    },
  ];

  const result = groundDays(aiDays, valid, 3);
  assert.equal(result.droppedStops, 2);
  assert.equal(result.days.length, 3);
  assert.equal(result.days[0].stops.length, 2);
  assert.equal(result.days[0].stops[0].durationMinutes, 40);
  assert.equal(result.days[0].stops[0].costPerPerson, 5);
  assert.equal(result.days[0].stops[1].durationMinutes, 360);
  assert.equal(result.days[0].stops[1].costPerPerson, 0);
  assert.equal(result.days[2].title, "A free day");
});

test("profiling counts missing fields, duplicates and distances", async () => {
  const { profileGroup } = await import("../src/lib/profile");
  const center = { name: "Lisbon", lat: 38.7077, lon: -9.1365 };
  const rows = [
    { name: "Fish House", lat: 38.7080, lon: -9.1360, suburb: "Baixa", catering: { cuisine: "seafood;portuguese" } },
    { name: "Fish House", lat: 38.7090, lon: -9.1370, suburb: "Baixa", catering: { cuisine: "seafood" } },
    { name: "", lat: 38.7100, lon: -9.1380 },
    { name: "Far Grill", lat: 38.7600, lon: -9.1000, address_line2: "Rua X" },
  ];

  const profile = profileGroup("food", rows, center, true);
  assert.equal(profile.rows, 4);
  assert.equal(profile.namedPercent, 75);
  assert.equal(profile.areaPercent, 50);
  assert.equal(profile.cuisinePercent, 50);
  assert.equal(profile.duplicateNames, 1);
  assert.equal(profile.topCuisines[0], "seafood (2)");
  assert.ok(profile.farthestKm > 6);
  assert.ok(profile.flags.length >= 3, "expected flags, got " + profile.flags.join(" | "));
});

test("an empty group is flagged as a likely wrong category", async () => {
  const { profileGroup } = await import("../src/lib/profile");
  const profile = profileGroup("interest: beaches", [], { name: "Madrid", lat: 40.4, lon: -3.7 }, false);
  assert.equal(profile.flags.length, 1);
  assert.ok(profile.flags[0].startsWith("returned nothing"));
});
