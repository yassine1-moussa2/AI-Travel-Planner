// Tests for finding must-sees: which icons the plan skipped, which day they fit, which hops
// are long, which places reach the AI, and how the Wikidata answer is read.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_CANDIDATES, RESERVED, selectCandidates } from "../src/lib/candidates";
import { EXCURSION_MIN_MINUTES, applyExcursionRules, isExcursion, isLongHop, missingIcons, nearestDay } from "../src/lib/discovery";
import { placesById } from "../src/lib/recalculate";
import { ADVENTUROUS_ICON_COUNT, BY_INTEREST, fetchGroup, iconCountFor } from "../src/lib/server/planLeg";
import { readFamousPlaces } from "../src/lib/server/wikidata";
import { ICON_COUNT } from "../src/lib/fame";
import type { FoundPlace } from "../src/lib/server/geoapify";
import type { LegPlan, Place, PlaceCategory, PlaceTier, Stop } from "../src/lib/types";

function place(id: string, category: PlaceCategory, tier: PlaceTier, fame: number, lat: number, lon: number): Place {
  return { id, name: "Place " + id, category, lat, lon, address: "", cuisine: "", wikidataId: "", fame, tier, wikiUrl: "" };
}

// Day 1 in Baixa, day 2 in Belém (about 6 km west).
const baixaSquare = place("p1", "sight", "classic", 20, 38.7075, -9.1364);
const baixaLunch = place("p2", "food", "classic", -1, 38.7100, -9.1380);
const belemMonastery = place("p3", "sight", "icon", 60, 38.6979, -9.2068);
const belemTower = place("p4", "sight", "icon", 70, 38.6916, -9.2160);
const castle = place("p5", "sight", "icon", 40, 38.7139, -9.1335);

function lisbonPlan(): LegPlan {
  return {
    cityName: "Lisbon, Portugal",
    center: { name: "Lisbon, Portugal", lat: 38.7077, lon: -9.1365 },
    places: [baixaSquare, baixaLunch, belemMonastery, belemTower, castle],
    stays: [],
    stayPlaceId: "",
    nightlyPricePerRoom: 100,
    localTransportPerPersonPerDay: 6,
    days: [
      { title: "Baixa", stops: [{ uid: "a", placeId: "p1", durationMinutes: 60, costPerPerson: 0, note: "" }, { uid: "b", placeId: "p2", durationMinutes: 60, costPerPerson: 20, note: "" }] },
      { title: "Belém", stops: [{ uid: "c", placeId: "p3", durationMinutes: 90, costPerPerson: 10, note: "" }] },
      { title: "Free", stops: [] },
    ],
    tips: [],
  };
}

test("missing icons are the icons no day visits, most famous first", () => {
  const missing = missingIcons(lisbonPlan());
  const ids: string[] = [];
  for (const item of missing) {
    ids.push(item.id);
  }
  assert.deepEqual(ids, ["p4", "p5"]);
});

test("a missing icon goes to the day whose stops are closest", () => {
  const plan = lisbonPlan();
  const index = placesById(plan);
  assert.equal(nearestDay(plan, belemTower, index), 1);
  assert.equal(nearestDay(plan, castle, index), 0);
});

test("with every day empty, the first day is suggested", () => {
  const plan = lisbonPlan();
  for (const day of plan.days) {
    day.stops = [];
  }
  assert.equal(nearestDay(plan, castle, placesById(plan)), 0);
});

test("only hops over 45 minutes are long", () => {
  assert.equal(isLongHop({ minutes: 45, mode: "transit" }), false);
  assert.equal(isLongHop({ minutes: 50, mode: "transit" }), true);
});

test("candidates keep icons, hidden finds and meals in their slots, and stop at the maximum", () => {
  const places: Place[] = [];
  // 60 unknown sights listed first would crowd everything else out without reserved slots.
  for (let number = 0; number < 60; number++) {
    places.push(place("s" + number, "sight", "classic", -1, 38.7, -9.1));
  }
  for (let number = 0; number < 10; number++) {
    places.push(place("i" + number, "sight", "icon", 100 - number, 38.7, -9.1));
  }
  for (let number = 0; number < 20; number++) {
    places.push(place("h" + number, "museum", "hidden", 2, 38.7, -9.1));
  }
  for (let number = 0; number < 25; number++) {
    places.push(place("f" + number, "food", "classic", -1, 38.7, -9.1));
  }
  places.push(place("asked", "sight", "classic", -1, 38.7, -9.1));

  const chosen = selectCandidates(places, { keepIds: { asked: true } });
  const counts: Record<string, number> = { icon: 0, hidden: 0, food: 0 };
  let keptAsked = false;
  for (const item of chosen) {
    if (item.tier === "icon") {
      counts.icon = counts.icon + 1;
    }
    if (item.tier === "hidden") {
      counts.hidden = counts.hidden + 1;
    }
    if (item.category === "food") {
      counts.food = counts.food + 1;
    }
    if (item.id === "asked") {
      keptAsked = true;
    }
  }
  assert.equal(chosen.length, MAX_CANDIDATES);
  assert.ok(counts.icon >= RESERVED.icons);
  assert.equal(counts.hidden, RESERVED.hidden);
  assert.equal(counts.food, RESERVED.food);
  assert.equal(keptAsked, true);
});

test("the Wikidata answer becomes one place per item, skipping unnamed and repeated items", () => {
  const reply = {
    results: {
      bindings: [
        { item: { value: "http://www.wikidata.org/entity/Q125006" }, itemLabel: { value: "Brooklyn Bridge" }, loc: { value: "Point(-73.9969 40.7061)" } },
        { item: { value: "http://www.wikidata.org/entity/Q125006" }, itemLabel: { value: "Brooklyn Bridge" }, loc: { value: "Point(-73.99 40.70)" } },
        { item: { value: "http://www.wikidata.org/entity/Q999" }, itemLabel: { value: "Q999" }, loc: { value: "Point(-74 40.7)" } },
        { item: { value: "http://www.wikidata.org/entity/Q9202" }, itemLabel: { value: "Statue of Liberty" }, loc: { value: "Point(-74.0445 40.6892)" } },
      ],
    },
  };
  const places = readFamousPlaces(reply, 10);
  assert.equal(places.length, 2);
  assert.deepEqual(places[0], { wikidataId: "Q125006", name: "Brooklyn Bridge", lon: -73.9969, lat: 40.7061 });
  assert.equal(places[1].name, "Statue of Liberty");
});

test("local finds get their own slots even after famous places fill the list", () => {
  const places: Place[] = [];
  for (let number = 0; number < 80; number++) {
    places.push(place("c" + number, "sight", "classic", 50, 38.7, -9.1));
  }
  for (let number = 0; number < 12; number++) {
    places.push(place("l" + number, "shopping", "local", -1, 38.7, -9.1));
  }
  let locals = 0;
  for (const item of selectCandidates(places, { keepIds: {} })) {
    if (item.tier === "local") {
      locals = locals + 1;
    }
  }
  assert.equal(locals, RESERVED.local);
});

test("an adventurous trip gets only the top 3 icons", () => {
  assert.equal(iconCountFor("adventurous"), ADVENTUROUS_ICON_COUNT);
  assert.equal(iconCountFor("balanced"), ICON_COUNT);
  assert.equal(iconCountFor("classic"), ICON_COUNT);
});

function stopUids(stops: Stop[]): string[] {
  const uids: string[] = [];
  for (const stop of stops) {
    uids.push(stop.uid);
  }
  return uids;
}

function placeNames(places: FoundPlace[]): string[] {
  const names: string[] = [];
  for (const item of places) {
    names.push(item.name);
  }
  return names;
}

// Sintra is about 25 km from central Lisbon; Cascais about 26 km.
const sintra = place("x1", "sight", "classic", 40, 38.7976, -9.3906);
const cascais = place("x2", "beach", "classic", 30, 38.6979, -9.4215);

test("a stop more than 15 km from the centre is an excursion", () => {
  const center = lisbonPlan().center;
  assert.equal(isExcursion(sintra, center), true);
  assert.equal(isExcursion(belemTower, center), false);
});

test("an excursion gets half a day, and a second one on the same day is taken out", () => {
  const plan = lisbonPlan();
  plan.places.push(sintra, cascais);
  const days = [
    {
      title: "Sintra and Cascais",
      stops: [
        { uid: "s", placeId: "x1", durationMinutes: 90, costPerPerson: 15, note: "" },
        { uid: "l", placeId: "p2", durationMinutes: 60, costPerPerson: 20, note: "" },
        { uid: "c", placeId: "x2", durationMinutes: 120, costPerPerson: 0, note: "" },
      ],
    },
  ];
  const result = applyExcursionRules(days, placesById(plan), plan.center);
  assert.equal(result.removedStops, 1);
  assert.deepEqual(stopUids(result.days[0].stops), ["s", "l"]);
  assert.equal(result.days[0].stops[0].durationMinutes, EXCURSION_MIN_MINUTES);
  // The input is left untouched.
  assert.equal(days[0].stops[0].durationMinutes, 90);
});

test("the outlet search keeps only malls whose name says outlet, in any case", async () => {
  process.env.GEOAPIFY_API_KEY = "test-key";
  let askedName = "";
  globalThis.fetch = async function (input: string | URL | Request) {
    askedName = new URL(String(input)).searchParams.get("name") || "";
    const features = [
      { properties: { name: "Freeport Lisboa Fashion OUTLET", lat: 38.7, lon: -8.9 } },
      { properties: { name: "Outletcenter Strada", lat: 38.7, lon: -9.2 } },
      { properties: { name: "Colombo", lat: 38.75, lon: -9.19 } },
    ];
    return new Response(JSON.stringify({ features }), { status: 200 });
  };
  const outletGroup = BY_INTEREST.outlets[0];
  const found = await fetchGroup({ name: "Test", lat: 1.234, lon: 5.678 }, outletGroup);
  assert.equal(askedName, "outlet");
  assert.deepEqual(placeNames(found), ["Freeport Lisboa Fashion OUTLET", "Outletcenter Strada"]);
});
