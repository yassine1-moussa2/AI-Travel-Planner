// Measures how famous a place is: the number of Wikipedia language editions that write about it.
// Data from Wikidata (CC0). Never blocks a plan: on any failure, fame simply stays unknown (-1).
import { readCache, writeCache } from "./cache";
import { logError, startTimer } from "./debug";

const API_URL = "https://www.wikidata.org/w/api.php";
// Wikimedia blocks requests without a descriptive User-Agent.
export const USER_AGENT = "Terrasse/0.1 (https://github.com/yassine2004/AI-Travel-Planner)";
const BATCH_SIZE = 50;
const MAX_BATCHES = 2;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Sitelinks that end in "wiki" but are not a Wikipedia language edition.
const NOT_WIKIPEDIA: Record<string, boolean> = {
  commonswiki: true,
  specieswiki: true,
  metawiki: true,
  mediawikiwiki: true,
  wikidatawiki: true,
  sourceswiki: true,
  incubatorwiki: true,
  outreachwiki: true,
  wikimaniawiki: true,
  foundationwiki: true,
  abstractwiki: true,
  wikifunctionswiki: true,
};

export interface Sitelink {
  site?: string;
  title?: string;
}

export interface WikiFame {
  fame: number;
  wikiUrl: string;
}

function articleUrl(siteKey: string, title: string): string {
  // "enwiki" -> en.wikipedia.org; "zh_yuewiki" -> zh-yue.wikipedia.org
  const language = siteKey.slice(0, siteKey.length - 4).replaceAll("_", "-");
  return "https://" + language + ".wikipedia.org/wiki/" + encodeURIComponent(title.replaceAll(" ", "_"));
}

// Count the Wikipedia editions in an item's sitelinks, and pick an article to link to
// (English if there is one, otherwise the first edition listed).
export function countWikipediaSitelinks(sitelinks: Record<string, Sitelink>): WikiFame {
  let fame = 0;
  let firstKey = "";
  for (const key in sitelinks) {
    if (!key.endsWith("wiki") || NOT_WIKIPEDIA[key]) {
      continue;
    }
    fame = fame + 1;
    if (firstKey === "") {
      firstKey = key;
    }
  }

  let wikiUrl = "";
  const english = sitelinks.enwiki;
  if (english !== undefined && english.title) {
    wikiUrl = articleUrl("enwiki", english.title);
  } else if (firstKey !== "" && sitelinks[firstKey].title) {
    wikiUrl = articleUrl(firstKey, sitelinks[firstKey].title || "");
  }
  return { fame, wikiUrl };
}

interface EntitiesReply {
  entities?: Record<string, { sitelinks?: Record<string, Sitelink>; missing?: string }>;
}

// One request for up to 50 ids. Throws on any network or HTTP problem.
async function fetchBatch(ids: string[]): Promise<Record<string, WikiFame>> {
  const url = new URL(API_URL);
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("ids", ids.join("|"));
  url.searchParams.set("props", "sitelinks");
  url.searchParams.set("format", "json");
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error("Wikidata " + response.status);
  }
  const data = (await response.json()) as EntitiesReply;
  const result: Record<string, WikiFame> = {};
  const entities = data.entities || {};
  for (const id of ids) {
    const entity = entities[id];
    if (entity === undefined || entity.missing !== undefined) {
      continue;
    }
    result[id] = countWikipediaSitelinks(entity.sitelinks || {});
  }
  return result;
}

// Fame for each Wikidata id (like "Q125006"). Ids we couldn't measure are simply absent.
// Requests go one after another, at most two batches of 50 per call; earlier ids get priority.
export async function fetchSitelinkCounts(ids: string[]): Promise<Record<string, WikiFame>> {
  const result: Record<string, WikiFame> = {};
  const toFetch: string[] = [];
  const seen: Record<string, boolean> = {};

  // Skip malformed or repeated ids, and answer from the cache when we can.
  for (const id of ids) {
    if (!/^Q\d+$/.test(id) || seen[id]) {
      continue;
    }
    seen[id] = true;
    const cached = readCache<WikiFame>("wikidata|" + id);
    if (cached !== null) {
      result[id] = cached;
    } else if (toFetch.length < BATCH_SIZE * MAX_BATCHES) {
      toFetch.push(id);
    }
  }

  for (let start = 0; start < toFetch.length; start = start + BATCH_SIZE) {
    const batch = toFetch.slice(start, start + BATCH_SIZE);
    const done = startTimer("wikidata");
    try {
      const counts = await fetchBatch(batch);
      for (const id in counts) {
        result[id] = counts[id];
        writeCache("wikidata|" + id, counts[id], THIRTY_DAYS_MS);
      }
      done(batch.length + " ids");
    } catch (error) {
      // Wikidata is a bonus: log it and plan with what we have.
      logError("wikidata", error);
      break;
    }
  }
  return result;
}

const SPARQL_URL = "https://query.wikidata.org/sparql";
// How many famous places to bring back per city; the rest of the list comes from Geoapify.
const FAMOUS_LIMIT = 25;

// Kinds of things a visitor can go and see (each includes its subclasses): structures such as
// bridges, towers and churches; museums; parks; monuments; squares; tourist attractions;
// landmarks; archaeological sites; gardens; neighbourhoods; streets; zoos; aquariums; sculptures.
const VISITABLE = "wd:Q811979 wd:Q33506 wd:Q22698 wd:Q4989906 wd:Q174782 wd:Q570116 wd:Q2319498 wd:Q839954 wd:Q1107656 wd:Q123705 wd:Q83620 wd:Q43501 wd:Q2281788 wd:Q860861";
// Famous, but not a sightseeing stop for most visitors: airports, and sports venues
// (stadiums and arenas are offered to sport fans through their hobby instead).
const NOT_SIGHTSEEING = "wd:Q1248784 wd:Q1076486";

// The most-linked items near a point, kept only if they are something a visitor can see.
// The inner query ranks by sitelinks first, so the type check only runs on 200 items.
function famousNearbyQuery(center: { lat: number; lon: number }, radiusKm: number): string {
  return `SELECT ?item ?itemLabel ?loc WHERE {
  {
    SELECT ?item ?links ?loc WHERE {
      SERVICE wikibase:around {
        ?item wdt:P625 ?loc .
        bd:serviceParam wikibase:center "Point(${center.lon} ${center.lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${radiusKm}" .
      }
      ?item wikibase:sitelinks ?links .
      FILTER(?links >= 8)
    }
    ORDER BY DESC(?links)
    LIMIT 200
  }
  FILTER EXISTS { VALUES ?visitable { ${VISITABLE} } ?item wdt:P31/wdt:P279* ?visitable . }
  FILTER NOT EXISTS { VALUES ?skip { ${NOT_SIGHTSEEING} } ?item wdt:P31/wdt:P279* ?skip . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY DESC(?links)
LIMIT 60`;
}

interface SparqlReply {
  results?: { bindings?: Record<string, { value: string }>[] };
}

// "Point(-74.0 40.7)" -> [lon, lat]
function parsePoint(text: string): [number, number] | null {
  const match = /Point\(([-0-9.eE]+) ([-0-9.eE]+)\)/.exec(text);
  if (match === null) {
    return null;
  }
  return [Number(match[1]), Number(match[2])];
}

export interface FamousPlace {
  wikidataId: string;
  name: string;
  lat: number;
  lon: number;
}

// Read the query answer: one place per item, skipping items without a real name or position.
export function readFamousPlaces(reply: SparqlReply, limit: number): FamousPlace[] {
  const places: FamousPlace[] = [];
  const seen: Record<string, boolean> = {};
  const bindings = reply.results?.bindings || [];
  for (const row of bindings) {
    if (places.length >= limit) {
      break;
    }
    const id = (row.item?.value || "").split("/").pop() || "";
    const name = row.itemLabel?.value || "";
    const point = parsePoint(row.loc?.value || "");
    // An item seen twice (several coordinates), or with no label (the label is then its Q-id).
    if (seen[id] || point === null || name === "" || name === id) {
      continue;
    }
    seen[id] = true;
    places.push({ wikidataId: id, name, lon: point[0], lat: point[1] });
  }
  return places;
}

// The most famous visitable places within a radius, most famous first. Far ones included:
// this is how the Brooklyn Bridge reaches a New York plan. Empty on any failure.
export async function findFamousNearby(center: { lat: number; lon: number }, radiusMeters: number): Promise<FamousPlace[]> {
  const radiusKm = Math.round(radiusMeters / 1000);
  const cacheKey = "famous|" + center.lat.toFixed(3) + "," + center.lon.toFixed(3) + "|" + radiusKm;
  const cached = readCache<FamousPlace[]>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const done = startTimer("wikidata famous");
  try {
    const url = new URL(SPARQL_URL);
    url.searchParams.set("query", famousNearbyQuery(center, radiusKm));
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json" },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      throw new Error("Wikidata query " + response.status);
    }
    const places = readFamousPlaces((await response.json()) as SparqlReply, FAMOUS_LIMIT);
    writeCache(cacheKey, places, THIRTY_DAYS_MS);
    done(places.length + " famous places");
    return places;
  } catch (error) {
    logError("wikidata famous", error);
    return [];
  }
}
