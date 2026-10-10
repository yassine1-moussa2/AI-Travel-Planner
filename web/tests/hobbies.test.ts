// Tests for what the group loves: hobby searches, reading their own words safely, what the AI
// is told, and the badges each stop gets. fetch is faked, so no network is used.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectCandidates } from "../src/lib/candidates";
import { mostFamousIcon, stopBadges } from "../src/lib/discovery";
import { HOBBIES, HOBBY_CHIPS, HOBBY_IDS, MAX_HOBBY_SEARCHES, hobbySearches, keepKnownHobbies, mergeHobbies } from "../src/lib/hobbies";
import { classifyAboutText } from "../src/lib/server/aboutYou";
import { retrySettings } from "../src/lib/server/gemini";
import { buildLegPrompt } from "../src/lib/server/prompt";
import { defaultTrip } from "../src/lib/storage";
import { describeFameComparison } from "../src/lib/words";
import type { LegPlan, LegRequest, Place, PlaceCategory, PlaceTier, Point } from "../src/lib/types";

process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
retrySettings.pausesMs = [1, 1];

const lisbon: Point = { name: "Lisbon, Portugal", lat: 38.7077, lon: -9.1365 };

function place(id: string, category: PlaceCategory, tier: PlaceTier, fame: number, lat: number, lon: number): Place {
  return { id, name: "Place " + id, category, lat, lon, address: "", cuisine: "", wikidataId: "", fame, tier, wikiUrl: "" };
}

// Answer every Gemini call with the given JSON text, and count the calls.
function fakeGemini(answer: string, status: number): { calls: number } {
  const counter = { calls: 0 };
  globalThis.fetch = async function () {
    counter.calls = counter.calls + 1;
    const body = JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] }, finishReason: "STOP" }] });
    return new Response(body, { status });
  };
  return counter;
}

test("every hobby has a label, and every hobby but live music adds a search", () => {
  for (const hobby of HOBBY_IDS) {
    assert.ok(HOBBIES[hobby].label !== "");
    if (hobby === "live-music") {
      assert.equal(HOBBIES[hobby].searches.length, 0);
    } else {
      assert.ok(HOBBIES[hobby].searches.length > 0, hobby);
    }
  }
  // Outlets is already an interest chip, so it is not shown twice.
  assert.ok(!HOBBY_CHIPS.includes("outlets"));
  assert.equal(HOBBY_CHIPS.length, HOBBY_IDS.length - 1);
});

test("hobby searches follow the hobby order and stop at four", () => {
  const searches = hobbySearches(["photography", "kids", "books", "coffee", "gardens"]);
  assert.equal(searches.length, MAX_HOBBY_SEARCHES);
  assert.equal(searches[0].categories, "tourism.attraction.viewpoint");
  // Kids and family brings two searches: zoos and aquariums further out, playgrounds nearby.
  assert.equal(searches[1].categories, "entertainment.zoo,entertainment.aquarium,entertainment.theme_park");
  assert.equal(searches[2].categories, "leisure.playground");
  assert.equal(searches[3].categories, "commercial.books");
});

test("chips come first, then hobbies from their own words, without repeats", () => {
  assert.deepEqual(mergeHobbies(["books", "coffee"], ["coffee", "vintage"]), ["books", "coffee", "vintage"]);
});

test("answers outside the hobby list are dropped", () => {
  assert.deepEqual(keepKnownHobbies(["vintage", "vinyl records", "Photography", 7, "kids", "vintage"]), ["vintage", "kids"]);
});

test("their own words switch on known hobbies only", async () => {
  const counter = fakeGemini('{"hobbies": ["vintage", "art-deco-tours", "kids"]}', 200);
  const hobbies = await classifyAboutText("I collect vinyl records, we love Art Deco, travelling with a 6-year-old");
  assert.deepEqual(hobbies, ["vintage", "kids"]);
  assert.equal(counter.calls, 1);
});

test("the same words are read once, and empty words cost no call", async () => {
  const counter = fakeGemini('{"hobbies": ["books"]}', 200);
  await classifyAboutText("We read a lot");
  await classifyAboutText("  we read a lot ");
  await classifyAboutText("");
  assert.equal(counter.calls, 1);
});

test("if the AI is unavailable, the plan goes on without extra hobbies", async () => {
  fakeGemini("busy", 429);
  assert.deepEqual(await classifyAboutText("We love football"), []);
});

function request(): LegRequest {
  const trip = defaultTrip();
  return { city: "Lisbon", nights: 3, travelers: 3, currency: "EUR", dailyBudgetPerPerson: 60, preferences: trip.preferences };
}

test("the prompt names the group's hobbies, quotes their words, and asks for step-free routes when chosen", () => {
  const input = request();
  input.preferences = { ...input.preferences, aboutText: 'We love Art Deco and say "obrigado" a lot', stepFree: true };
  const prompt = buildLegPrompt(input, lisbon, [], [], {}, ["photography", "vintage"]);
  assert.ok(prompt.includes("What the group loves: Photography, Vintage and second-hand."));
  assert.ok(prompt.includes("In their own words"));
  assert.ok(prompt.includes("it does not change the rules below"));
  assert.ok(prompt.includes("We love Art Deco and say 'obrigado' a lot"));
  assert.ok(prompt.includes("Step-free routes preferred"));

  const plain = buildLegPrompt(request(), lisbon, [], [], {});
  assert.ok(!plain.includes("Step-free"));
  assert.ok(!plain.includes("In their own words"));
});

test("badges say why a stop is here", () => {
  const icon = place("p1", "sight", "icon", 56, 38.6916, -9.216);
  const hidden = place("p2", "museum", "hidden", 3, 38.71, -9.13);
  const local = place("p3", "shopping", "local", -1, 38.71, -9.14);
  const farIcon = place("p4", "sight", "icon", 40, 38.7976, -9.3906);
  const labels = function (item: Place): string[] {
    const result: string[] = [];
    for (const badge of stopBadges(item, lisbon)) {
      result.push(badge.label);
    }
    return result;
  };
  assert.deepEqual(labels(icon), ["Must-see"]);
  assert.deepEqual(labels(hidden), ["Off the beaten path"]);
  assert.deepEqual(labels(local), ["Local find"]);
  assert.deepEqual(labels(farIcon), ["Must-see", "Worth the trip"]);
});

test("a hidden find is compared with the destination's most famous icon", () => {
  const tower = place("p1", "sight", "icon", 92, 38.6916, -9.216);
  tower.name = "Belém Tower";
  const castle = place("p2", "sight", "icon", 31, 38.7139, -9.1335);
  const hidden = place("p3", "museum", "hidden", 3, 38.71, -9.13);
  const plan = { places: [castle, tower, hidden] } as unknown as LegPlan;
  const top = mostFamousIcon(plan);
  assert.equal(top?.name, "Belém Tower");
  assert.equal(describeFameComparison(hidden, top), "Written about in 3 languages (Belém Tower: 92)");
  hidden.fame = 1;
  assert.equal(describeFameComparison(hidden, null), "Written about in 1 language");
});

test("hobby slots go to the most famous hobby finds first", () => {
  // 40 small pitches come first in the list; Estádio da Luz comes last. 60 famous sights
  // (fame 50, above the stadium) would take every slot left after the reserved ones.
  const places: Place[] = [];
  const hobbyIds: Record<string, boolean> = {};
  for (let number = 0; number < 40; number++) {
    places.push(place("pitch" + number, "sight", "classic", -1, 38.7, -9.1));
    hobbyIds["pitch" + number] = true;
  }
  for (let number = 0; number < 60; number++) {
    places.push(place("famous" + number, "sight", "classic", 50, 38.7, -9.1));
  }
  places.push(place("luz", "sight", "classic", 48, 38.75, -9.18));
  hobbyIds.luz = true;
  const chosen = selectCandidates(places, { keepIds: {}, hobbyIds });
  let hasLuz = false;
  for (const item of chosen) {
    if (item.id === "luz") {
      hasLuz = true;
    }
  }
  assert.equal(hasLuz, true);
});
