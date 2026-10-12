// Stops one visitor (or everyone together) from running up the AI and map bills.
// This lives in memory, so each server instance counts on its own and a restart resets it.
// That is enough before accounts exist; Phase 2 moves the counts into the database.

interface Counter {
  count: number;
  resetsAt: number;
}

const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// Old windows are swept once the map holds this many, so memory stays bounded.
const MAX_TRACKED = 5000;

const holder = globalThis as unknown as { travelPlannerLimits?: Map<string, Counter> };
if (holder.travelPlannerLimits === undefined) {
  holder.travelPlannerLimits = new Map();
}
const windows = holder.travelPlannerLimits;

// Drop finished windows; if every window is still live, drop the oldest so the map never grows past the cap.
function makeRoom(now: number): void {
  for (const [key, counter] of windows) {
    if (counter.resetsAt <= now) {
      windows.delete(key);
    }
  }
  for (const key of windows.keys()) {
    if (windows.size < MAX_TRACKED) {
      break;
    }
    windows.delete(key);
  }
}

// Count one use of `key`. Returns false once `limit` uses happened inside the window.
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (windows.size >= MAX_TRACKED) {
    makeRoom(now);
  }

  const counter = windows.get(key);
  if (counter === undefined || counter.resetsAt <= now) {
    windows.set(key, { count: 1, resetsAt: now + windowMs });
    return true;
  }
  if (counter.count >= limit) {
    return false;
  }
  counter.count = counter.count + 1;
  return true;
}

// Read a whole-number limit from the environment, falling back when unset or nonsense.
function limitFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    return fallback;
  }
  return value;
}

// The visitor's address as the hosting platform reports it. Vercel sets x-forwarded-for;
// the first entry is the visitor. Locally there is none, so everyone shares one bucket.
export function visitorId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.trim() !== "") {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp !== null && realIp.trim() !== "") {
    return realIp.trim();
  }
  return "local";
}

export interface LimitResult {
  ok: boolean;
  message: string;
}

// City plans call the AI, so they get a per-visitor and a whole-site daily cap.
export function allowPlan(request: Request): LimitResult {
  const visitor = visitorId(request);
  const perMinute = limitFromEnv("PLAN_LIMIT_PER_MINUTE", 6);
  const perVisitorDay = limitFromEnv("PLAN_LIMIT_PER_USER_DAY", 20);
  const globalDay = limitFromEnv("PLAN_LIMIT_GLOBAL_DAY", 200);

  if (!allow("plan-minute|" + visitor, perMinute, ONE_MINUTE_MS)) {
    return { ok: false, message: "That's a lot of plans in a minute. Wait a moment and try again." };
  }
  if (!allow("plan-day|" + visitor, perVisitorDay, ONE_DAY_MS)) {
    return { ok: false, message: "You've planned the most cities allowed today. Come back tomorrow, or edit the plans you have." };
  }
  if (!allow("plan-day|everyone", globalDay, ONE_DAY_MS)) {
    return { ok: false, message: "The planner has reached today's limit for everyone. Ready-made trips still work." };
  }
  return { ok: true, message: "" };
}

// Map lookups are cheap but still metered, so they only get a per-minute cap.
export function allowLookup(request: Request, name: string): LimitResult {
  const perMinute = limitFromEnv("LOOKUP_LIMIT_PER_MINUTE", 30);
  if (!allow(name + "-minute|" + visitorId(request), perMinute, ONE_MINUTE_MS)) {
    return { ok: false, message: "Too many searches in a minute. Wait a moment and try again." };
  }
  return { ok: true, message: "" };
}
