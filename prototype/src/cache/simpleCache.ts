import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * A plain JSON-file cache. This is a stand-in for the Postgres `places`
 * table and `trips.promptHash` column from the full plan — same idea
 * (hash the normalised request, skip the API call on a hit), zero setup.
 * Swapping this for real Postgres/Drizzle queries later doesn't change any
 * caller — they only know about get/set.
 */

const CACHE_DIR = ".cache";

export function hashKey(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function readCache<T>(namespace: string, key: string): Promise<T | null> {
  const file = path.join(CACHE_DIR, namespace, `${key}.json`);
  try {
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null; // no cache entry yet (or unreadable) — treat as a miss
  }
}

export async function writeCache<T>(namespace: string, key: string, value: T): Promise<void> {
  const dir = path.join(CACHE_DIR, namespace);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${key}.json`), JSON.stringify(value, null, 2), "utf-8");
}
