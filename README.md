# AI Travel Planner

**The main app is the website in [`web/`](web/) — see [`web/README.md`](web/README.md)
to run it.**

The CLI in `src/` (described below) is the original prototype, kept for reference.

## The original prototype — core engine

This is the **core AI engine** from the full project plan: retrieval-then-generate
itinerary building. It's a standalone TypeScript package with no framework, no DB,
no auth — just the part that actually matters for the "AI integration done properly"
story:

1. **Grounded generation** — real places come from Geoapify first; the LLM only
   arranges them and can't invent a place (`src/itinerary/generateItinerary.ts`).
2. **Structured output, validated** — Zod schema, one repair retry on failure
   (`src/itinerary/schema.ts`, `src/itinerary/generateItinerary.ts`).
3. **Cost control** — places and generated trips are cached by hash, so a repeat
   request costs zero API calls (`src/cache/simpleCache.ts`).
4. **Provider interfaces** — `LLMProvider` and `PlacesProvider` so swapping Gemini
   for OpenAI, or Geoapify for Google Places, is one new adapter file
   (`src/llm/provider.ts`, `src/places/provider.ts`).

## How it maps to the full 12-day plan

This covers Day 1 (API spikes), Day 3 (places layer + cache) and Day 4–5 (generation
engine). It deliberately skips Next.js, Postgres/Drizzle, Auth.js, and the UI — those
come later, once this engine works. `src/cache/simpleCache.ts` is a JSON-file stand-in
for the real `places` table and `trips.promptHash` column described in the plan;
swap it for Drizzle queries without touching any caller.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `GOOGLE_GENERATIVE_AI_API_KEY` — free key from https://aistudio.google.com
- `GEOAPIFY_API_KEY` — free key from https://www.geoapify.com (no credit card)

## Run it

```bash
npm run demo -- --destination "Lisbon, Portugal" --days 3 --budget 600 --interests sight,food
```

Run it again with the same arguments — you'll see `[cache]` lines instead of API
calls. Change `--destination` or `--interests` and it fetches fresh places, but still
grounds the itinerary only in what it fetched.

## Files

```
src/
  types.ts                     shared types (Place, TripRequest, Itinerary)
  places/
    provider.ts                 PlacesProvider interface
    geoapify.ts                  Geoapify adapter (geocode + category search)
  llm/
    provider.ts                  LLMProvider interface
    gemini.ts                     Gemini adapter (generateObject, Zod-enforced)
  itinerary/
    schema.ts                     Zod schema the LLM must return
    promptBuilder.ts                system + user prompt, incl. candidate places
    generateItinerary.ts             the core engine: prompt -> LLM -> validate -> resolve
  cache/
    simpleCache.ts                 JSON-file cache (stand-in for Postgres)
  index.ts                        CLI wiring it all together
```

## Next steps (not built here)

- [x] Wrap this in a Next.js Route Handler (`POST /api/trips/generate`) instead of a CLI.
  Done in `web/` as `POST /api/plan-leg`.
- [ ] Replace `simpleCache.ts` with real Drizzle/Postgres queries.
- [ ] Add Auth.js so trips are linked to a `userId`.
- [x] Build the itinerary UI (done in `web/`).
- [ ] Add the MapLibre map.

See `ai-travel-planner-plan.md` for the full schedule.
