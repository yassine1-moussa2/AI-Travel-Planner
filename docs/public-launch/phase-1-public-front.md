# Phase 1: Friendlier for the public

Three additions. Each works locally, needs no account, and adds no AI cost for visitors. About three days.
Ship them as three separate commits, in this order.

General rules for all three:

- Follow `web/CLAUDE.md`: grounding stays, arithmetic stays in plain code, easy-code style in `src/lib`,
  palette and type from `globals.css`, no dark mode, no all-caps labels.
- Pin any new npm package to an exact version published at least 14 days ago.
- `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass before each commit.

---

## 1A. Say what the site does

**Under the headline**, one sentence in the hero:

> Plan a trip from real places, see what it costs, and change anything.

**A "How it works" section** after the ready-made trips (1B). It is a real sequence, so numbered steps fit:

1. **Tell us the trip.** Who's going, where, for how long, and roughly what you can spend.
2. **We build the days from real places.** Cafés, sights and restaurants that exist, arranged so you're not
   crossing town all day.
3. **Make it yours.** Move, swap or drop anything. Times and the budget update as you go.

Then one line under the steps:

> Every place is real. Every price is an estimate you can change.

**Rename the three stay styles everywhere the traveller sees them** (`STYLE_WORDS` in `src/lib/words.ts`):
`budget` → "Budget", `comfort` → "Mid-range", `treat` → "Luxury". The internal keys stay the same. The
AI-facing descriptions in `src/lib/server/prompt.ts` stay as they are.

---

## 1B. Ready-made trips: Lisbon, Barcelona, Rome × Budget, Mid-range, Luxury

Nine trips, generated once by you with the real pipeline, reviewed by hand, committed to the repo.
Visitors open them with no AI call.

### Fixed parameters for every sample

| Field | Value |
| --- | --- |
| Travellers / rooms | 2 / 1 |
| Nights | 3 |
| Currency | EUR |
| Origin, start date | empty (travel to the city is not included; no dates) |
| Pace | balanced |

| City (geocoder text) | Interests | Must see |
| --- | --- | --- |
| Lisbon, Portugal | history, nature | Belém Tower |
| Barcelona, Spain | history, beaches | Sagrada Família |
| Rome, Italy | history, museums | Colosseum |

| Tier | `stayStyle` | Budget field (EUR, two people, three nights, excluding travel) |
| --- | --- | --- |
| Budget | budget | 600 |
| Mid-range | comfort | 1,200 |
| Luxury | treat | 2,800 |

The budget field only guides the AI (through `dailyBudgetPerPerson`). The price shown on the site is always
computed by `computeBudget`, never typed in.

### Files

- `src/data/samples/<city>-<tier>.json`, e.g. `lisbon-budget.json`, holding
  `{ id, city, tier, generatedAt, model, trip }`, where `trip` is a complete `Trip` with one leg in status
  `ready`.
- Add a Zod `tripSchema` for the whole `Trip` type to `src/lib/schema.ts`. Samples are validated with it now;
  Phase 2 reuses it to validate saved trips.

### Generation script

`scripts/generate-samples.ts`, run with `npm run samples:generate`:

- Loads `.env.local` (`process.loadEnvFile`), builds each `LegRequest` from the tables above, calls the
  existing `planLeg`, and writes the nine files.
- One trip at a time (rate limits), printing the computed total for each.
- Running it is developer use of the AI, done by you, locally. The public never triggers it.

### Review before committing (by you, in the browser)

- [ ] Every stop is a plausible place to visit. Drop or swap odd ones in the editor, then press the
      **Copy trip as JSON** button and paste the result over the `trip` field of that sample's file.
      That button exists only when `process.env.NODE_ENV === "development"`, so the public never sees it.
      Document this review loop in `web/README.md`.
- [ ] Prices look believable for the tier.
- [ ] The hotel fits the tier.
- [ ] For each city, Budget < Mid-range < Luxury in the computed total.

### Tests (`tests/samples.test.ts`)

- Exactly nine files exist and each parses with `tripSchema`.
- Each sample has 3 days and at least 4 stops per day.
- Every stop's `placeId` exists in that leg's `places` (grounding holds in stored data too).
- Per city, computed totals strictly increase from Budget to Mid-range to Luxury.

### Interface

A section right after the hero: **"Or start from a ready-made trip"**.

- One card per city. City name in the display font, "3 nights for two" under it.
- Inside each card, three choices: tier name, the computed total, and the per-person amount, for example
  "Mid-range: €1,140, €570 each". Each choice is a button.
- Under the cards: "Estimated for two travellers sharing a room, three nights. Travel to the city is not
  included. Prices estimated in <month and year of generatedAt>."
- Design: these are postcards, not a SaaS card grid. Postcard paper, the display font for the city, and the
  three prices set like a stamp block. Different from the day sheets, but from the same palette.
- Clicking a tier loads a copy of that trip into the editor and scrolls to it. If the current trip already
  has a plan, first ask inline: "This replaces your current plan." with **Replace** and **Keep mine**.
- Above the loaded trip: "This is a ready-made Lisbon trip. Change anything, it's yours now."

---

## 1C. Weather

Real forecast for days within 16 days; typical weather for later dates, clearly labelled. No AI anywhere.
Open-Meteo is free for non-commercial use and needs no key. Credit it in the footer: "Weather data by
Open-Meteo.com" (linked).

### Which kind of weather for each day

- No start date: no weather. Show one quiet line: "Add a departure date to see the weather."
- Day before today (UTC): no weather for that day.
- Day 0 to 15 days from today (UTC): **forecast**.
- Day 16 or more days away: **typical**: the average of the same calendar dates over the past five complete
  years. 29 February uses 28 February in non-leap years.

### Server route `GET /api/weather`

Query: `lat`, `lon`, `from` (YYYY-MM-DD), `days` (1 to 30), validated with Zod.

- Forecast: `https://api.open-meteo.com/v1/forecast` with
  `daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`,
  `timezone=auto`, `start_date`, `end_date`.
- Typical: `https://archive-api.open-meteo.com/v1/archive` with
  `daily=temperature_2m_max,temperature_2m_min,precipitation_sum`, `timezone=auto`, one request per past year
  for the trip's dates. A "rainy day" is `precipitation_sum` of 1 mm or more.
- Reply: `{ days: [{ date, kind: "forecast" | "typical", maxC, minC, rainChance?, rainyShare?, words? }], typicalYears? }`.
  `rainChance` is the forecast percentage; `rainyShare` is 0 to 1 for typical days; `words` comes from the
  weather code (forecast only).
- Cache with the existing cache helpers. Coordinates rounded to 2 decimals in the key. Forecast for 3 hours,
  typical for 30 days.
- Errors follow the existing `PlannerError` pattern: a friendly line for the page, the real cause in the
  terminal. Weather failing never blocks the plan.

### Weather words (`src/lib/weatherWords.ts`, pure)

| WMO codes | Words |
| --- | --- |
| 0 | clear sky |
| 1, 2 | mostly sunny |
| 3 | cloudy |
| 45, 48 | fog |
| 51, 53, 55, 56, 57 | drizzle |
| 61, 63, 66, 80, 81 | rain |
| 65, 67, 82 | heavy rain |
| 71, 73, 75, 77, 85, 86 | snow |
| 95, 96, 99 | thunderstorms |

### Packing hints (`src/lib/packing.ts`, pure; at most three, in this order)

- Any day with `rainChance` ≥ 50, or `rainyShare` ≥ 0.4: "Pack an umbrella or a light rain jacket."
- Any day with `maxC` ≥ 33: "Hot days: keep the middle of the day for indoor visits."
- Otherwise any day with `maxC` ≥ 28: "Bring sun protection."
- Any day with `minC` ≤ 8: "Bring a warm layer for the evenings."

### Interface

- Each day header: forecast as "22° / 15°, light rain"; typical as "Usually 22° / 15°, rain on 2 days in 10".
- Each destination header: "Forecast" or "Typical for these dates (2021 to 2025 average)".
- Packing hints join the destination's "Good to know" list, marked as coming from the weather.
- Temperatures in °C.

### Tests

- Day kind at the boundaries: 15 days away is forecast, 16 is typical, yesterday has none.
- Typical averaging over five years, including the 29 February rule.
- Every WMO code in the table maps to its words; an unknown code gives no words rather than a wrong guess.
- Packing hints: each rule, the order, and the limit of three.

---

## Done when

- The three commits are in, all checks pass, and `web/README.md` mentions the ready-made trips, the weather
  and the Open-Meteo credit.
- You've looked at the new sections in the browser on desktop and phone width, and sent screenshots for a
  design review.
