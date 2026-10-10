# Discovery: must-sees, hidden finds, worth the trip, and the traveller's own interests

The AI still only arranges real places it was given. What changes is WHICH real places we find and how we label them. Fame is measured from data, never guessed by the AI.

## 1. Fame from data

- Geoapify returns properties.wiki_and_media.wikidata (a Q-id) when OpenStreetMap has one. Keep it: Place gets wikidataId ("" if none), fame (number, -1 if unknown) and tier ("icon" | "classic" | "hidden" | "local").
- New src/lib/server/wikidata.ts: fetchSitelinkCounts(ids) calls https://www.wikidata.org/w/api.php with action=wbgetentities, props=sitelinks, format=json, up to 50 ids per request.
  - Requests are serial, never parallel. Send a descriptive User-Agent, e.g. "Terrasse/0.1 (https://github.com/yassine2004/AI-Travel-Planner)" (Wikimedia blocks anonymous agents).
  - Cache results 30 days. At most 2 batches per city.
  - On any failure, fame stays -1 and planning continues. Wikidata must never block a plan.
  - Count only Wikipedia language editions: sitelink keys ending in "wiki", excluding commonswiki, specieswiki, metawiki, mediawikiwiki, wikidatawiki, sourceswiki, incubatorwiki, outreachwiki, wikimaniawiki, foundationwiki.
  - Also keep the Wikipedia article title (prefer enwiki) so the interface can link "Read about it".
- New pure file src/lib/fame.ts with classifyPlaces(places, settings):
  - icon: among sights and attractions, the top ICON_COUNT (start 8) by fame, with fame >= ICON_MIN_FAME (start 10)
  - hidden: has a Wikidata record and 1 <= fame <= HIDDEN_MAX_FAME (start 5)
  - local: no Wikidata record, but named and in a discovery category (section 3)
  - classic: everything else
  Keep these thresholds as named constants at the top of the file.

## 2. Must-sees, even far from the hotel

- Today we take the 15 nearest sights within 5 km, so fame never matters. Add an icons pass: tourism.sights and tourism.attraction within ICON_RADIUS_M (start 20000), limit 60. Keep only places with a Wikidata id, rank by fame, then classify.
- Prompt rules: icons are must-sees. Include as many as the days allow (at least one per day when there are 3 or more). Build each day around one area. A far icon anchors its day together with nearby stops; never zigzag across the city.
- After grounding, a pure function lists icons missing from the plan. Under each destination: "Also famous here:" with each missing icon and an "Add to Day N" button, where N comes from a pure function nearestDay() (the day whose stops are closest). No AI call.
- A hop longer than 45 minutes shows a notice under it: "Long trip across town: about 50 min each way."

## 3. Off the beaten path

- Discovery categories, in the city radius: viewpoints, artwork/street art, markets, second-hand and vintage shops, bookshops, gardens, small museums and arts centres.
- IMPORTANT: every Geoapify category name in this file is a starting point, not a fact. Before using any, check it against Geoapify's category list and run npm run explore -- "Lisbon" and npm run explore -- "New York". Replace or drop any category that returns nothing, and tell me what you changed.
- A "Your style" choice in the preferences, with three options:
  - Classic: mostly icons and classics, at most 1 hidden find per day
  - Balanced (default): at least 1 hidden find per day
  - Adventurous: at least 2 hidden finds per day, icons limited to the top 3
- Notes for hidden finds explain why they fit this traveller, using only what the traveller told us. No invented facts such as opening hours or history.

## 4. Worth the trip: outlets and excursions

- An "Outlets and deals" interest: shopping malls whose name contains "outlet" (case-insensitive) within OUTLET_RADIUS_M (start 60000), plus city markets.
- Any stop more than EXCURSION_KM (start 15) from the centre is an excursion: treated as a half-day block, at most one per day, with travel time shown each way. Pure function isExcursion() with tests.

## 5. About you: hobbies and interests

- A new "About you" part of the preferences. The heading reads "What does your group love?", because one trip can have several people.
- Hobby chips (multi-select), each mapped in src/lib/hobbies.ts to category groups (verify every category as in section 3):
  Photography (viewpoints), Street art, Architecture, Food markets, Vintage and second-hand, Outlets and deals, Live music, Football and sport (stadiums), Books, Wine and beer, Coffee, Gardens, Kids and family (zoos, aquariums, playgrounds), Hiking and nature.
- Free text: "Anything else we should know?" (max 300 characters), with a placeholder like "I collect vinyl records, we love Art Deco, travelling with a 6-year-old".
  - The free text is classified by Gemini into the FIXED hobby list only: JSON {"hobbies": [...]}, validated with a Zod enum, unknown values dropped. Free text can therefore only add known searches, never arbitrary ones.
  - The free text also goes into the planning prompt, to choose among candidates and write notes.
- "Step-free routes preferred" checkbox: a prompt constraint plus a note on the plan. This is health-related, so it stays in the browser only and must never be stored in the account database later. Add one line about it to docs/public-launch/phase-2-accounts.md (privacy section).
- Limit extra Geoapify searches to 4 hobby groups per city; further chips still go into the prompt.

## 6. Prompt and candidate list

- Each candidate line adds its tier, fame and distance from the centre, e.g.
  "p12 | Ponte 25 de Abril viewpoint | sight | icon, fame 54 | 6.2 km from centre"
- Keep the list near 70 places to control cost. Reserve slots: icons 8, hidden up to 15, hobbies up to 20, food 20, cafes 7. Fill the rest by fame.
- Unchanged: the AI may only use the given ids; grounding drops anything else.

## 7. Interface

- Small sentence-case badges on stops (no capitals, no emoji), using the palette: "Must-see" (marigold), "Off the beaten path" (sea blue), "Worth the trip" (bougainvillea outline), "Local find" (plain).
- Under a hidden find: "Written about in 3 languages (Belem Tower: 92)", comparing with the destination's most famous icon, plus a "Read about it" link to Wikipedia.
- Footer credit: "Fame scores from Wikidata (CC0)."

## 8. Tests

- Sitelink counting (Wikipedia editions only).
- classifyPlaces: icon top-N, both thresholds, local, unknown fame.
- nearestDay, isExcursion, missing-icons list.
- Hobby mapping; free-text classification drops values outside the enum.
- Prompt builder: tier and distance in lines, and the style rules per option.
- All existing tests stay green, especially grounding.

## 9. Real-data check (show me the output)

Extend npm run explore to print, per city: the top 10 icons with fame, the count of hidden candidates, and outlets found within 60 km. Run it for New York, Lisbon, Barcelona and Rome. The Brooklyn Bridge must appear as an icon for New York.

## Commits

1. Fame data: Wikidata client, classification, explore output
2. Icons pass, far must-sees, "Also famous here"
3. Off the beaten path and the style choice
4. Outlets and excursions
5. About you: hobbies, free text, step-free option, badges and interface
