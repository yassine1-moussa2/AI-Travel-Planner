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
