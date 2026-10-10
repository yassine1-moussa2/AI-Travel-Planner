// Tests for the day map's data: numbers follow the list, edits show up, the hotel is framed.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayMapData } from "../src/lib/mapData";
import type { DayMapData } from "../src/lib/mapData";
import { placesById, scheduleDay } from "../src/lib/recalculate";
import { defaultTrip } from "../src/lib/storage";
import { moveStop, removeStop } from "../src/lib/tripEdits";
import type { LegPlan, Place, Trip } from "../src/lib/types";

const cafe: Place = { id: "p1", name: "Corner Cafe", category: "cafe", lat: 38.7105, lon: -9.1366, address: "", cuisine: "", wikidataId: "", fame: -1, tier: "classic", wikiUrl: "" };
const square: Place = { id: "p2", name: "Big Square", category: "sight", lat: 38.7075, lon: -9.1364, address: "", cuisine: "", wikidataId: "", fame: -1, tier: "classic", wikiUrl: "" };
const lunch: Place = { id: "p3", name: "Fish House", category: "food", lat: 38.7300, lon: -9.1500, address: "", cuisine: "seafood", wikidataId: "", fame: -1, tier: "classic", wikiUrl: "" };
// The hotel sits north-east of every stop, so the bounds only cover it if it is included.
const hotel: Place = { id: "h1", name: "Sunny Hotel", category: "stay", lat: 38.7400, lon: -9.1200, address: "", cuisine: "", wikidataId: "", fame: -1, tier: "classic", wikiUrl: "" };

function lisbonTrip(): Trip {
  const plan: LegPlan = {
    cityName: "Lisbon, Portugal",
    center: { name: "Lisbon, Portugal", lat: 38.7077, lon: -9.1365 },
    places: [cafe, square, lunch],
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
  const trip = defaultTrip();
  trip.legs[0].city = "Lisbon";
  trip.legs[0].nights = 2;
  trip.legs[0].status = "ready";
  trip.legs[0].plan = plan;
  return trip;
}

// Build the map data the same way the page does: schedule the day, then look up the hotel.
function mapOfDay(trip: Trip, dayIndex: number): DayMapData {
  const plan = trip.legs[0].plan as LegPlan;
  const index = placesById(plan);
  const schedule = scheduleDay(plan.days[dayIndex], index, trip.preferences.pace);
  return dayMapData(schedule, index[plan.stayPlaceId] || null);
}

function namesInOrder(data: DayMapData): string[] {
  const names: string[] = [];
  for (const feature of data.stops.features) {
    names.push(feature.properties.order + " " + feature.properties.name);
  }
  return names;
}

test("map numbers follow the day's order, with the same times as the list", () => {
  const data = mapOfDay(lisbonTrip(), 0);
  assert.deepEqual(namesInOrder(data), ["1 Corner Cafe", "2 Big Square", "3 Fish House"]);
  assert.equal(data.stops.features[0].properties.time, "09:00");
  assert.equal(data.stops.features[1].properties.time, "09:45");
  assert.equal(data.route?.geometry.coordinates.length, 3);
  assert.deepEqual(data.route?.geometry.coordinates[0], [cafe.lon, cafe.lat]);
});

test("moving a stop changes the numbers on the map", () => {
  const moved = moveStop(lisbonTrip(), 0, 0, 0, 1);
  const data = mapOfDay(moved, 0);
  assert.deepEqual(namesInOrder(data), ["1 Big Square", "2 Corner Cafe", "3 Fish House"]);
  assert.deepEqual(data.route?.geometry.coordinates[0], [square.lon, square.lat]);
});

test("removing a stop removes its point", () => {
  const removed = removeStop(lisbonTrip(), 0, 0, 1);
  const data = mapOfDay(removed, 0);
  assert.deepEqual(namesInOrder(data), ["1 Corner Cafe", "2 Fish House"]);
  assert.equal(data.route?.geometry.coordinates.length, 2);
});

test("the bounds include the hotel", () => {
  const data = mapOfDay(lisbonTrip(), 0);
  assert.equal(data.stay?.properties.name, "Sunny Hotel");
  assert.deepEqual(data.bounds, [[lunch.lon, square.lat], [hotel.lon, hotel.lat]]);
});

test("an empty day has no route and no stops, but still shows the hotel", () => {
  const data = mapOfDay(lisbonTrip(), 1);
  assert.equal(data.stops.features.length, 0);
  assert.equal(data.route, null);
  assert.deepEqual(data.bounds, [[hotel.lon, hotel.lat], [hotel.lon, hotel.lat]]);
});

test("with nothing to show there are no bounds", () => {
  const trip = lisbonTrip();
  const plan = trip.legs[0].plan as LegPlan;
  const schedule = scheduleDay(plan.days[1], placesById(plan), trip.preferences.pace);
  assert.equal(dayMapData(schedule, null).bounds, null);
});
