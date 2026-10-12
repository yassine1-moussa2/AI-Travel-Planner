# Prototype (archived)

> **Archived.** This is the first version of the project: a command-line tool built in September 2026 to
> prove the core idea before any website existed. The real app is [`web/`](../web/). This folder is kept
> to show where the project started; it is not developed further.

It proved three things that the web app still relies on:

1. **Grounded generation.** Real places come from Geoapify first; the AI only arranges them and cannot
   invent a place (`src/itinerary/generateItinerary.ts`).
2. **Validated output.** The AI's answer must match a Zod schema, with one repair retry
   (`src/itinerary/schema.ts`).
3. **Swappable providers.** `LLMProvider` and `PlacesProvider` interfaces, so changing Gemini or
   Geoapify means one new adapter file (`src/llm/provider.ts`, `src/places/provider.ts`).

What it got wrong, and the web app fixed: it had no idea which places are famous, so a Porto plan
could fill a day with small statues while skipping the Ribeira. The web app measures fame from
Wikidata instead.

## Run it

```bash
cd prototype
npm install
cp .env.example .env     # add GOOGLE_GENERATIVE_AI_API_KEY and GEOAPIFY_API_KEY
npm run demo -- --destination "Lisbon, Portugal" --days 3 --budget 600 --interests sight,food
```

Run it twice with the same arguments: the second run prints `[cache]` lines instead of calling the APIs.

## Files

```
src/
  types.ts                      shared types (Place, TripRequest, Itinerary)
  places/provider.ts            PlacesProvider interface
  places/geoapify.ts            Geoapify adapter (geocode + category search)
  llm/provider.ts               LLMProvider interface
  llm/gemini.ts                 Gemini over plain HTTPS, answer shape sent as JSON Schema
  itinerary/schema.ts           Zod schema the AI must return
  itinerary/promptBuilder.ts    system + user prompt, including the candidate places
  itinerary/generateItinerary.ts  prompt -> AI -> validate -> repair once -> resolve places
  cache/simpleCache.ts          JSON-file cache
  index.ts                      CLI
```
