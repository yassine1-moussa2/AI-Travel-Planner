// Tests how fame is measured and how places are sorted into icons, classics, hidden and local finds.
// fetch is faked, so no network is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HIDDEN_MAX_FAME, ICON_MIN_FAME, classifyPlaces } from "../src/lib/fame";
import { countWikipediaSitelinks, fetchSitelinkCounts } from "../src/lib/server/wikidata";
import type { Place, PlaceCategory } from "../src/lib/types";

function place(id: string, category: PlaceCategory, wikidataId: string, fame: number): Place {
  return { id, name: "Place " + id, category, lat: 38.7, lon: -9.1, address: "", cuisine: "", wikidataId, fame, tier: "classic", wikiUrl: "" };
}

function tiers(places: Place[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of places) {
    result[item.id] = item.tier;
  }
  return result;
}

test("only Wikipedia language editions are counted", () => {
  const counted = countWikipediaSitelinks({
    enwiki: { site: "enwiki", title: "Belém Tower" },
    ptwiki: { site: "ptwiki", title: "Torre de Belém" },
    zh_yuewiki: { site: "zh_yuewiki", title: "貝倫塔" },
    commonswiki: { site: "commonswiki", title: "Category:Belém Tower" },
    abstractwiki: { site: "abstractwiki", title: "Q1" },
    enwikivoyage: { site: "enwikivoyage", title: "Belém" },
    enwikiquote: { site: "enwikiquote", title: "Belém" },
  });
  assert.equal(counted.fame, 3);
  assert.equal(counted.wikiUrl, "https://en.wikipedia.org/wiki/Bel%C3%A9m_Tower");
});

test("without an English article, the link goes to the first edition", () => {
  const counted = countWikipediaSitelinks({ ptwiki: { site: "ptwiki", title: "Miradouro da Graça" } });
  assert.equal(counted.fame, 1);
  assert.equal(counted.wikiUrl, "https://pt.wikipedia.org/wiki/Miradouro_da_Gra%C3%A7a");
});

test("icons are the most famous sights, capped at the icon count and above the minimum", () => {
  const places = [
    place("a", "sight", "Q1", 90),
    place("b", "sight", "Q2", 40),
    place("c", "sight", "Q3", 20),
    place("d", "sight", "Q4", ICON_MIN_FAME - 1),
    place("e", "food", "Q5", 80),
  ];
  const result = tiers(classifyPlaces(places, { iconCount: 2, discoveryIds: {} }));
  assert.equal(result.a, "icon");
  assert.equal(result.b, "icon");
  // Famous enough, but the two icon slots are taken.
  assert.equal(result.c, "classic");
  // Below the minimum fame: never an icon, and too famous to be hidden.
  assert.equal(result.d, "classic");
  // Only sights can be icons, however famous a restaurant is.
  assert.equal(result.e, "classic");
});

test("hidden finds have a Wikidata record and between 1 and the hidden maximum editions", () => {
  const places = [
    place("one", "sight", "Q1", 1),
    place("max", "museum", "Q2", HIDDEN_MAX_FAME),
    place("over", "museum", "Q3", HIDDEN_MAX_FAME + 1),
    place("zero", "sight", "Q4", 0),
  ];
  const result = tiers(classifyPlaces(places, { iconCount: 8, discoveryIds: {} }));
  assert.equal(result.one, "hidden");
  assert.equal(result.max, "hidden");
  assert.equal(result.over, "classic");
  assert.equal(result.zero, "classic");
});

test("local finds have no Wikidata record and come from a discovery search", () => {
  const places = [place("market", "shopping", "", -1), place("cafe", "cafe", "", -1)];
  const result = tiers(classifyPlaces(places, { iconCount: 8, discoveryIds: { market: true } }));
  assert.equal(result.market, "local");
  assert.equal(result.cafe, "classic");
});

test("unknown fame is never an icon or a hidden find", () => {
  const places = [place("unknown", "sight", "Q9", -1)];
  const result = tiers(classifyPlaces(places, { iconCount: 8, discoveryIds: { unknown: true } }));
  assert.equal(result.unknown, "classic");
});

test("a Wikidata failure leaves fame unknown instead of breaking the plan", async () => {
  globalThis.fetch = async function () {
    return new Response("busy", { status: 503 });
  };
  const counts = await fetchSitelinkCounts(["Q700001", "Q700002"]);
  assert.deepEqual(counts, {});
});

test("at most two batches of 50 are sent, one after another", async () => {
  const batchSizes: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  globalThis.fetch = async function (input: string | URL | Request) {
    inFlight = inFlight + 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const ids = (new URL(String(input)).searchParams.get("ids") || "").split("|");
    batchSizes.push(ids.length);
    const entities: Record<string, unknown> = {};
    for (const id of ids) {
      entities[id] = { sitelinks: { enwiki: { site: "enwiki", title: id } } };
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight = inFlight - 1;
    return new Response(JSON.stringify({ entities }), { status: 200 });
  };

  const ids: string[] = [];
  for (let number = 0; number < 130; number++) {
    ids.push("Q8" + String(number).padStart(5, "0"));
  }
  ids.push("not-an-id");
  const counts = await fetchSitelinkCounts(ids);
  assert.deepEqual(batchSizes, [50, 50]);
  assert.equal(maxInFlight, 1);
  assert.equal(Object.keys(counts).length, 100);
  assert.equal(counts.Q800000.fame, 1);
});
