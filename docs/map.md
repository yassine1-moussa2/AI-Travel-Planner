# Day map

Each destination shows a map of one day: numbered stops in visiting order, a dotted line joining them, and the hotel marked. Every edit (reorder, remove, swap, add, change hotel) updates the map instantly.

## Fixed decisions
- Library: maplibre-gl from npm. Pin an exact version published at least 14 days ago.
- Map style: OpenFreeMap Liberty, https://tiles.openfreemap.org/styles/liberty. No API key, no account. Keep the URL in one exported constant so switching providers is one line. Keep the map attribution visible (compact).
- No new API keys and nothing new in NEXT_PUBLIC_.
- MapLibre needs the browser: load the map component with next/dynamic and ssr: false from a client component, and import maplibre-gl/dist/maplibre-gl.css there.
- Create the map once per destination. On edits, update its GeoJSON sources with setData. Never re-create the map on every render. Call map.remove() on unmount.

## Data: pure and tested
- New file src/lib/mapData.ts with dayMapData(schedule: ScheduledDay, stay: Place | null).
  It returns: stops as GeoJSON points with properties order (starting at 1), name, time ("09:00"); the route as one LineString in visiting order; the stay as a point or null; bounds covering all stops and the stay, or null if there is nothing to show.
- It must use the existing scheduleDay() output, so numbers and times on the map always match the list. Skip stops whose place is missing.
- New tests in tests/mapData.test.ts: numbers follow the day's order; moveStop() changes the numbers; removeStop() removes the point; bounds include the hotel; an empty day has no route.
- Follow the easy-code style used in the rest of src/lib: plain loops, named variables, one comment per block.

## Interface
- New client component src/components/LegMap.tsx.
- LegSheet keeps which day is shown on the map (default: the first). Each day header gets a "Show on map" button with aria-pressed showing the active day.
- Wide screens (1100px and up): inside each destination, days on the left and the map on the right, sticky, so it stays beside the day being read (height about calc(100vh - 8rem), at most 560px). Below 1100px: the map sits above the days, 300px tall.
- Markers are DOM elements: a bougainvillea (#B42F66) circle with the white stop number in Figtree bold. The hotel marker is marigold (#F0A43A) with a small inline SVG bed icon. No emoji.
- Route: dotted line in the sea blue (#1E6A82), width 3.
- Map box: 14px rounded corners and the same 1px warm border as the day sheets. Optionally warm the base map by tinting land and water with setPaintProperty, but only on layers that exist at runtime; skip silently otherwise.
- Camera: fitBounds with 48px padding. A single point gets a zoom of 15. With prefers-reduced-motion, use duration 0.
- Clicking a marker opens a small popup: "09:55 Praca do Comercio" (time, then name).
- Accessibility: the map container has aria-label "Map of Day N in <city>"; each marker has an aria-label such as "Stop 2: <name> at 09:55". The list stays the main content; the map is extra.
- Under the map, one quiet caption: "Lines join stops in order. They are not walking routes."
- If the map style fails to load (offline, or OpenFreeMap down), show in the map box: "The map couldn't load. Your plan is unaffected." Use map.on("error").
- Follow the design rules in globals.css and web/CLAUDE.md: same palette, no dark mode, no all-caps labels.

## Done when
- npm run typecheck, npm run lint, npm test and npm run build all pass in web/.
- web/README.md lists the day map and credits OpenFreeMap and OpenStreetMap.
- One commit: "feat: day map with numbered stops".
