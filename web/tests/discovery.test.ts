// Tests for finding must-sees: which icons the plan skipped, which day they fit, which hops
// are long, which places reach the AI, and how the Wikidata answer is read.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_CANDIDATES, RESERVED, selectCandidates } from "../src/lib/candidates";
import { isLongHop, missingIcons, nearestDay } from "../src/lib/discovery";
import { placesById } from "../src/lib/recalculate";
import { readFamousPlaces } from "../src/lib/server/wikidata";
import type { LegPlan, Place, PlaceCategory, PlaceTier } from "../src/lib/types";

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
