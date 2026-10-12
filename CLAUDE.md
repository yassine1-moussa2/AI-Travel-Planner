# Terrasse (AI Travel Planner): project context for Claude Code

## What this is
A portfolio web app in `web/`. The traveller describes a trip; the server collects real places
(Geoapify / OpenStreetMap, plus Wikidata for fame), asks Gemini to arrange them into days, drops
anything the AI invented, and the browser computes every time and total. Trips are saved in the
browser. There is no database and no sign-in. Rules specific to the app are in `web/CLAUDE.md`.

`prototype/` is the archived first CLI version. Don't develop it further.

## Non-negotiable rules
1. **The AI never invents places.** It gets candidate places with ids and may only answer with
   those ids; `web/src/lib/grounding.ts` drops anything else.
2. **All AI and places calls are server-side** (`web/src/lib/server/`). Never a `NEXT_PUBLIC_` key.
3. **AI output is validated with Zod**, with one repair retry, then a friendly error.
4. **The AI never does arithmetic.** Times and money live in `web/src/lib/recalculate.ts` (pure).
5. **Every AI-calling route stays rate-limited** (`web/src/lib/server/rateLimit.ts`).

## Stack (as built)
- Next.js 16 App Router, React 19, TypeScript, plain CSS (`web/src/app/globals.css`)
- Gemini over plain HTTPS (`web/src/lib/server/gemini.ts`), no AI SDK
- Geoapify for geocoding and places, Wikidata for fame, MapLibre GL with OpenFreeMap tiles
- Zod 4 for every input and AI answer
- Tests: `node:test` via `tsx`; CI: GitHub Actions on Node 24 (`.github/workflows/ci.yml`)
- In-memory cache and limits (`web/src/lib/server/cache.ts`, `rateLimit.ts`)

## Status
Finished as a portfolio project, runs locally. Going public is planned but optional; the phases
are in `docs/public-launch/` (Phase 1A, "say what the site does", is done).

## Conventions
- Small, focused commits with conventional-commit messages.
- Before finishing any change in `web/`: `npm run typecheck && npm run lint && npm test && npm run build`.
- Pin new npm packages to an exact version published at least 14 days ago.

## What not to build
Collaborative editing, bookings, payments, notifications, i18n, admin panel, chat UI.
