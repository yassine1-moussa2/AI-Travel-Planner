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
| `npm test` | 23 tests: scheduling, budget, edits, grounding, data profiling, map data, Gemini retries |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run explore -- "Lisbon"` | Profile the places data for a city (see below) |

## Exploring the data

`npm run explore -- "Porto"` asks Geoapify for every category group the planner uses and prints,
per group: rows returned, % with a name, area, address and cuisine, duplicate names, and distances
from the centre — then flags quality problems (for example "cuisine known for only 30%: food
wishes are hard to honour", or a group that returned nothing). Use it before changing radius,
limits or categories in `src/lib/server/planLeg.ts`.

## When something breaks

1. **Open http://localhost:3000/api/health.** It makes one tiny real call to each service and tells
   you which one fails and why.
2. **Turn on step logs:** set `PLANNER_DEBUG=1` in `.env.local`, restart `npm run dev`, plan again.
   The terminal shows each step with its timing, and how many invented stops the grounding dropped.
3. **Errors are always printed** in the terminal as `[planner] FAILED at <step>: <real cause>`,
   even with debug logs off. The page shows the friendly version; the terminal shows the truth.

| Symptom | Likely cause | Fix |
|---|---|---|
| "an API key is missing on the server" | `.env.local` missing or not reloaded | Create it, then restart `npm run dev` |
| "The AI model isn't available" | Google retired the model name | Set `GEMINI_MODEL=gemini-flash-latest` |
| "free quota is used up" | Gemini free tier limit | Wait a minute; check quota in AI Studio |
| "map service is busy" | Geoapify rate limit | Wait a few seconds; plans one city at a time already |
| A category never shows up | Category name rejected | `npm run explore -- "<city>"`, look for "returned nothing" |
| Few or odd places | Sparse OpenStreetMap data | Try a bigger city; check `npm run explore` |

## Files

```
src/
├── app/
│   ├── page.tsx, layout.tsx, globals.css
│   └── api/  plan-leg · geocode · health
├── components/          the page, one file per piece of the interface
└── lib/
    ├── types.ts         shared vocabulary
    ├── recalculate.ts   times and budget (pure, runs on every edit)
    ├── tripEdits.ts     every change a traveller can make
    ├── grounding.ts     drops places the AI invented
    ├── geo.ts           distances, walking vs transit, transfers
    ├── mapData.ts       what the day map draws (pure, from the same schedule as the list)
    ├── profile.ts       data-quality profiling
    └── server/          Geoapify, Gemini, prompt, planning, cache, debug
scripts/explore-places.ts
tests/  planner · mapData · gemini
```

## Known limits

- Prices are estimates: the places data has no prices, so the AI estimates and you can correct.
- Opening hours aren't checked yet.
- Transfers are rough distance-based estimates, not live train or flight fares.
- The place cache lives in server memory and resets when `npm run dev` restarts.
- Trips are saved in your browser only; there are no accounts yet.

## Credits

- Map tiles and style: [OpenFreeMap](https://openfreemap.org) (Liberty style), no key needed.
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- Map rendering: [MapLibre GL JS](https://maplibre.org).
