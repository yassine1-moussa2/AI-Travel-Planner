# Terrasse — the web planner

The website for the AI Travel Planner. Tell it who's travelling, where to and with what budget;
it builds a day-by-day plan from **real places only**, and you can change anything afterwards —
times and money recalculate instantly.

Runs locally only. Not deployed, marked `noindex`.

## Run it

Requires Node.js 20.12 or newer (24 LTS recommended).

```bash
cd web
npm install
cp .env.example .env.local     # then paste your two keys into .env.local
npm run dev
```

Open http://localhost:3000.

**Keys** (both free, no credit card): Geoapify (https://www.geoapify.com) and Google AI Studio
(https://aistudio.google.com).

## What it does

- **Groups and multi-city trips.** Several travellers and rooms; several destinations in one trip,
  with estimated journeys from home, between cities, and back.
- **Budget and wishes.** Total budget and currency, stay style, a neighbourhood to sleep near,
  food wishes, must-see places, interests and pace.
- **Edit everything.** Reorder, move to another day, swap, remove or add places; change any
  duration or price, the hotel, nightly rate or ticket prices. Changing a city re-plans only that city.
- **Must-sees, measured.** Fame is the number of Wikipedia languages that write about a place
  (from Wikidata), never guessed by the AI. The most famous sights within 20 km are offered even when
  far from the hotel (the Brooklyn Bridge, Belém Tower); any the plan skips are listed under
  "Also famous here" with a one-tap "Add to Day N".
- **Off the beaten path.** Viewpoints, murals, markets, vintage and book shops, gardens and small
  museums. Little-known places are labelled "Off the beaten path" or "Local find", and "Your style"
  (classic, balanced, adventurous) sets how many each day gets.
- **Worth the trip.** Outlet villages within 60 km, and excursions over 15 km out, planned as a half
  day with the travel time each way.
- **About you.** Hobby chips, the group's own words (read into the same fixed hobby list, so they can
  only switch on known searches) and a step-free preference that stays in the browser.
- **Day map.** Each destination shows one day on a map: numbered stops in visiting order, a dotted
  line joining them, and the hotel. Every edit updates it instantly; "Show on map" picks the day.
- **Honest numbers.** Every price is an estimate and every one is editable. The page says so.

## How it works

```
browser                                 server (/api/plan-leg, once per destination)
───────                                 ─────────────────────────────────────────────
trip sentence + wishes  ── request ──▶  1. find the city (and the stay area) on the map
                                        2. collect real venues by category       Geoapify
                                        3. ask the AI to arrange them by id      Gemini
                                        4. drop any id we didn't supply          grounding
plan  ◀───────────────────── reply ───  5. return places + days
  │
  └─ every edit: recalculate times and money in the browser (no network, no AI)
```

The key split: **the AI chooses venues, order and durations; code computes every clock time and
every total.** Language models are unreliable at arithmetic, and keeping maths out of the model is
what makes instant, correct recalculation possible.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Local site at http://localhost:3000 |
| `npm test` | 65 tests: scheduling, budget, edits, grounding, profiling, map data, Gemini retries, destination lookup, fame, discovery, prompt, hobbies |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run explore -- "Lisbon"` | Profile the places data for a city, its top icons and outlets (see below) |

## Exploring the data

`npm run explore -- "Porto"` asks Geoapify for every category group the planner uses and prints,
per group: rows returned, % with a name, area, address and cuisine, duplicate names, and distances
from the centre — then flags quality problems (for example "cuisine known for only 30%: food
wishes are hard to honour", or a group that returned nothing). Use it before changing radius,
limits or categories in `src/lib/server/planLeg.ts`.

## When something breaks

1. **Open http://localhost:3000/api/health.** It makes one tiny real call to each service and tells
   you which one fails and why. In production it only answers with the header
   `x-health-token: <HEALTH_CHECK_TOKEN>`, because every check costs real quota.
2. **Turn on step logs:** set `PLANNER_DEBUG=1` in `.env.local`, restart `npm run dev`, plan again.
   The terminal shows each step with its timing, and how many invented stops the grounding dropped.
3. **Errors are always printed** in the terminal as `[planner] FAILED at <step>: <real cause>`,
   even with debug logs off. The page shows the friendly version; the terminal shows the truth.

| Symptom | Likely cause | Fix |
|---|---|---|
| "an API key is missing on the server" | `.env.local` missing or not reloaded | Create it, then restart `npm run dev` |
| "The AI model isn't available" | Google retired the model name | Set `GEMINI_MODEL=gemini-flash-latest` |
| "free quota is used up" | Gemini free tier limit | Wait a minute; check quota in AI Studio |
| "That's a lot of plans in a minute" / "most cities allowed today" | The built-in plan limits | Raise `PLAN_LIMIT_*` in `.env.local`, restart |
| "map service is busy" | Geoapify rate limit | Wait a few seconds; plans one city at a time already |
| "is a whole country" / "is a whole region" | A country or region was typed as a destination | Type a town or city; add one destination per city |
| A destination lands in the wrong country | The name also exists elsewhere ("Lake Como" in New Jersey) | Add the country: "Como, Italy" |
| A category never shows up | Category name rejected | `npm run explore -- "<city>"`, look for "returned nothing" |
| Few or odd places | Sparse OpenStreetMap data | Try a bigger city; check `npm run explore` |

## Files

```
src/
├── app/
│   ├── page.tsx, layout.tsx, globals.css
│   └── api/  plan-leg · geocode · health (all rate-limited or locked in production)
├── components/          the page, one file per piece of the interface
└── lib/
    ├── types.ts         shared vocabulary
    ├── recalculate.ts   times and budget (pure, runs on every edit)
    ├── tripEdits.ts     every change a traveller can make
    ├── grounding.ts     drops places the AI invented
    ├── geo.ts           distances, walking vs transit, transfers
    ├── mapData.ts       what the day map draws (pure, from the same schedule as the list)
    ├── fame.ts          icon, classic, hidden and local tiers from Wikipedia counts
    ├── candidates.ts    which ~70 places the AI sees, with reserved slots
    ├── discovery.ts     missing icons, nearest day, excursions, badges
    ├── hobbies.ts       hobby chips and the searches each one adds
    ├── profile.ts       data-quality profiling
    └── server/          Geoapify, Wikidata, Gemini, prompt, planning, about-you, cache, rate limits, debug
scripts/explore-places.ts
tests/  planner · mapData · gemini · destination · fame · discovery · prompt · hobbies · rateLimit
```

## Known limits

- Prices are estimates: the places data has no prices, so the AI estimates and you can correct.
- Opening hours aren't checked yet.
- Transfers are rough distance-based estimates, not live train or flight fares.
- The place cache lives in server memory and resets when `npm run dev` restarts.
- Trips are saved in your browser only; there are no accounts yet.
- Plan limits are counted in server memory, per server instance. They stop casual abuse, not a
  determined attacker; Phase 2 moves them into the database.

## Credits

- Map tiles and style: [OpenFreeMap](https://openfreemap.org) (Liberty style), no key needed.
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- Fame scores from [Wikidata](https://www.wikidata.org/) (CC0).
- Map rendering: [MapLibre GL JS](https://maplibre.org).
