// A small in-memory cache so the same city never costs two API calls in a day.
// It lives on globalThis because Next.js reloads modules on every code change in dev,
// which would otherwise wipe the cache constantly.

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const holder = globalThis as unknown as { travelPlannerCache?: Map<string, CacheEntry> };
if (holder.travelPlannerCache === undefined) {
  holder.travelPlannerCache = new Map();
}
const store = holder.travelPlannerCache;

export function readCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (entry === undefined) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function writeCache(key: string, value: unknown): void {
  store.set(key, { value, expiresAt: Date.now() + ONE_DAY_MS });
}
