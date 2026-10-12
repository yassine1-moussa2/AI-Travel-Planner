// Tests how a typed destination is understood: a city is planned, a country or region is
// explained, and a street that happens to share the name is never used.
// The result shapes copy real Geoapify answers. fetch is faked, so no network is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseDestination, findDestination, isAreaResult } from "../src/lib/server/geoapify";
import type { GeocodeResult } from "../src/lib/server/geoapify";

process.env.GEOAPIFY_API_KEY = "test-key";

const marrakech: GeocodeResult = { lat: 31.626, lon: -7.989, city: "Marrakesh", country: "Morocco", country_code: "ma", result_type: "city" };
const morocco: GeocodeResult = { lat: 31.173, lon: -7.336, name: "Morocco", country: "Morocco", country_code: "ma", result_type: "country" };
const tuscany: GeocodeResult = { lat: 43.459, lon: 11.139, name: "Tuscany", country: "Italy", country_code: "it", result_type: "state" };
const newYorkState: GeocodeResult = { lat: 42.746, lon: -75.77, name: "New York", country: "United States", country_code: "us", result_type: "state" };
const newYorkCity: GeocodeResult = { lat: 40.713, lon: -74.006, city: "New York", country: "United States", country_code: "us", result_type: "city" };
const amalfiStreet: GeocodeResult = { lat: -31.912, lon: 141.47, name: "Amalfi Coast", city: "Broken Hill", country: "Australia", country_code: "au", result_type: "street" };
const baliIsland: GeocodeResult = { lat: -8.456, lon: 115.27, name: "Bali Island", country: "Indonesia", country_code: "id", result_type: "amenity" };

// Answer the first search with `first`, and the "city in the same country" search with `cities`.
function fakeGeocoder(first: GeocodeResult[], cities: GeocodeResult[]): { calls: number } {
  const counter = { calls: 0 };
  globalThis.fetch = async function (input: string | URL | Request) {
    counter.calls = counter.calls + 1;
    const url = new URL(String(input));
    let results = first;
    if (url.searchParams.get("type") === "city") {
      results = cities;
    }
    return new Response(JSON.stringify({ results }), { status: 200 });
  };
  return counter;
}

test("a city or an island is a place to plan", () => {
  assert.equal(chooseDestination([marrakech]).kind, "place");
  assert.equal(chooseDestination([baliIsland]).kind, "place");
});

test("a country or a region is flagged as too big", () => {
  assert.equal(chooseDestination([morocco]).kind, "country");
  assert.equal(chooseDestination([tuscany]).kind, "region");
});

test("a street with the same name is skipped, and nothing usable means none", () => {
  assert.equal(chooseDestination([amalfiStreet]).kind, "none");
  assert.equal(chooseDestination([amalfiStreet, marrakech]).result, marrakech);
  assert.equal(chooseDestination([]).kind, "none");
});

test("New York the state becomes New York the city", async () => {
  const counter = fakeGeocoder([newYorkState], [newYorkCity]);
  const lookup = await findDestination("New York");
  assert.equal(lookup.kind, "place");
  assert.equal(lookup.point?.name, "New York, United States");
  assert.equal(lookup.point?.lat, newYorkCity.lat);
  assert.equal(counter.calls, 2);
});

test("a country with no city of that name stays a country", async () => {
  fakeGeocoder([morocco], [morocco]);
  const lookup = await findDestination("Morocco");
  assert.equal(lookup.kind, "country");
});

test("a region with no city of that name stays a region", async () => {
  fakeGeocoder([tuscany], []);
  const lookup = await findDestination("Tuscany");
  assert.equal(lookup.kind, "region");
});

test("a plain city needs one search and is remembered", async () => {
  const counter = fakeGeocoder([marrakech], []);
  const first = await findDestination("Marrakech");
  const second = await findDestination("marrakech");
  assert.equal(first.point?.name, "Marrakesh, Morocco");
  assert.deepEqual(second, first);
  assert.equal(counter.calls, 1);
});

test("a landmark search that falls back to the whole city is not a landmark", () => {
  assert.equal(isAreaResult({ lat: 38.7, lon: -9.1, result_type: "city" }), true);
  assert.equal(isAreaResult({ lat: 38.7, lon: -9.1, result_type: "suburb" }), true);
  assert.equal(isAreaResult({ lat: 38.69, lon: -9.21, result_type: "amenity" }), false);
  assert.equal(isAreaResult({ lat: 38.69, lon: -9.21 }), false);
});
