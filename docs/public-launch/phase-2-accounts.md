# Phase 2: Ready for strangers

Accounts, saved trips with history, a persistent cache, spending limits and privacy. Five to seven days.
Five commits, in this order: 2A, 2B, 2C, 2D, 2E.

General rules:

- Everything in `web/CLAUDE.md` still applies.
- Next.js 16 changed some conventions (for example, the request middleware file). Check the bundled docs in
  `node_modules/next/dist/docs/` before writing anything that touches routing or requests.
- Pin new packages to exact versions published at least 14 days ago.
- Tests must still run in CI without a database: database code sits behind small interfaces with in-memory
  versions for tests.
- Every new environment variable goes into `.env.example` with an empty value and a one-line comment.

---

## 2A. Database and persistent cache

- Postgres on Neon, EU region. Use two Neon branches: `dev` for your machine, `main` for production.
- Drizzle ORM with `drizzle-kit` migrations in `web/drizzle/`. Scripts: `db:generate`, `db:migrate`.

### Tables owned by the app

| Table | Columns | Notes |
| --- | --- | --- |
| `cache_entries` | `key` text primary key, `value` jsonb, `expires_at` timestamptz | Index on `expires_at`. About 1 write in 50 also deletes expired rows |
| `trips` | `id` uuid, `user_id` text → user (on delete cascade), `title` text, `data` jsonb, `created_at`, `updated_at` | Index on (`user_id`, `updated_at` desc) |
| `trip_versions` | `id` uuid, `trip_id` uuid → trips (on delete cascade), `created_at`, `summary` text, `data` jsonb | Index on (`trip_id`, `created_at` desc) |
| `usage_events` | `id` uuid, `user_id` text null → user (on delete set null), `kind` text, `city` text, `cached` boolean, `input_tokens` int, `output_tokens` int, `cost_usd` numeric(10,5), `created_at` | Indexes on `created_at` and (`user_id`, `created_at`) |

Better Auth creates its own tables (`user`, `session`, `account`, `verification`) in 2B.

### Cache

- `readCache` / `writeCache` keep their names but become async and use `cache_entries` when `DATABASE_URL`
  is set. Without it (tests, CI) they use the existing in-memory map.
- Whole city plans are cached too: key `plan|<sha256 of the normalised LegRequest>`, kept 30 days.
  Normalising means lower-cased, trimmed city text and sorted interests, so the same request always gives
  the same key.

---

## 2B. Sign in: Google, plus an emailed link

- [Better Auth](https://www.better-auth.com) with its Drizzle adapter.
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Email link: the magic-link plugin, sending through Resend (`RESEND_API_KEY`, `EMAIL_FROM`). The link works
  for 10 minutes and once only.
- `EMAIL_SIGNIN_ENABLED` switches the email option on or off. Resend only delivers to other people from a
  domain you own, so without a domain the site offers Google only.
- Signing in with Google and with an email link for the same verified address leads to one account
  (account linking with Google as a trusted provider).
- Turn on Better Auth's rate limiting. On top of that, at most 3 sign-in emails per address per hour.

### Invite-only switch

- `INVITE_ONLY=true` and `INVITE_EMAILS=a@example.com,b@example.com` (case-insensitive).
- Checked in two places: before a sign-in email is sent (so the site never emails strangers), and before an
  account is created.
- Refusal text: "Terrasse is invite-only for now. Ask the site owner for an invite."
- The check is a pure function `isInvited(email, settings)` with tests.

### Sign-in page `/sign-in`, in the site's warm design

- "Continue with Google" button.
- Or an email field with **Email me a sign-in link**. After sending: "Check your inbox. The link works for
  10 minutes."
- One line: "New here? Signing in creates your account." There's no separate registration page.
- Top-right of every page: **Sign in** when signed out; the person's first name, **My trips** and
  **Sign out** when signed in.

### When sign-in is needed

Pressing **Plan our trip** while signed out shows, inline: "Sign in to plan a new city. Ready-made trips are
free to explore." with both sign-in options. The trip being typed stays where it is (it's already saved in
the browser).

---

## 2C. My trips and their history

### API (all require a session; another person's trip answers 404, never 403)

| Route | Does |
| --- | --- |
| `GET /api/trips` | List the person's trips |
| `POST /api/trips` | Save a new trip |
| `GET`, `PUT`, `DELETE /api/trips/[id]` | Read, save, delete one trip |
| `GET /api/trips/[id]/versions` | List versions, newest first |
| `POST /api/trips/[id]/versions/[versionId]/restore` | Restore a version |

Bodies are validated with `tripSchema` from Phase 1 and capped at 300 KB. Data access goes through a
`TripStore` interface with a Postgres version and an in-memory version for tests.

### Saving

- Signed in: autosave 2 seconds after the last edit. Status near the trip title: "Saved", "Saving…", or
  "Not saved: you seem to be offline. Your changes are kept in this browser."
- Signed out: unchanged, the browser keeps the trip.
- First sign-in on a browser holding a planned trip: "Save the trip on this device to your account?" with
  **Save** and **Not now**.

### History

Every save is compared with the latest version by a pure function `describeChange(previous, next)` in
`src/lib/describeChange.ts`. It produces the one-line summary:

| Change | Summary |
| --- | --- |
| Stop removed | Removed Da Prata 52 from Day 1 |
| Stop added | Added Jardim da Estrela to Day 2 |
| Moved within a day | Moved Lisboa Story Centre earlier on Day 1 |
| Moved to another day | Moved Praça do Comércio from Day 1 to Day 2 |
| Venue swapped | Swapped Baía do Peixe for Cervejaria Ramiro on Day 1 |
| Duration | Changed time at Fabrica Coffee Roasters to 60 min |
| Stop price | Changed price at Da Prata 52 to €25 each |
| Hotel | Changed hotel in Lisbon to Casa do Largo |
| Nightly price | Changed nightly price in Lisbon to €140 |
| Transfer price | Changed ticket price from Lisbon to Porto |
| City re-planned | Re-planned Porto |
| Travellers, rooms, budget, dates, cities | Changed trip details |
| Several at once | The first summary + " and 2 more changes" |
| Nothing changed | No version is created |

- Coalescing: if the latest version is under 60 seconds old and has the same kind of change on the same
  stop or field, update it instead of adding a new one. Typing a price creates one version, not ten.
- Keep the newest 50 versions per trip.
- Under the plan, a closed `<details>` titled **Earlier versions**: each row shows time, summary and
  **Restore**. Restoring saves the old data as a new version: "Restored the version from 14:02, 12 Oct".

### `/trips` page

Newest first. Each row shows the title (default: the cities and month, e.g. "Lisbon and Porto, Oct 2026"),
when it was last edited, the estimated total, and **Open**, **Rename**, **Delete**. Delete asks inline:
"Delete this trip and its history? This can't be undone."

---

## 2D. Limits and the cost log

### In `POST /api/plan-leg`

1. No session → 401 with the sign-in message from 2B.
2. Cached plan for the same request (under 30 days old) → return it. Log a `usage_events` row with
   `cached = true` and no cost. It does not count toward any limit.
3. Otherwise check the limits, then plan.

| Limit | Variable | Start value | Counted |
| --- | --- | --- | --- |
| Per person | `PLAN_LIMIT_PER_USER_DAY` | 5 | Uncached plans in the last 24 hours |
| Whole site | `PLAN_LIMIT_GLOBAL_DAY` | 10 | Uncached plans since 00:00 UTC |

To avoid two simultaneous requests both slipping under a limit, insert the usage row first as a reservation,
count including it, and delete it if the count is over the limit.

Messages (429):

- Person: "You've planned 5 new cities in the last 24 hours. Your trips are saved and you can keep editing
  them. You can plan new cities again from 18:40." (The time is when the oldest counted plan turns 24 hours
  old: a pure function with tests.)
- Whole site: "The planner has reached today's limit. Ready-made trips and your saved trips still work. New
  plans open again at midnight UTC."

### Real costs, recorded

- `gemini.ts` reads `usageMetadata` from every response, including retries and repairs: input =
  `promptTokenCount`, output = `candidatesTokenCount` + `thoughtsTokenCount`.
- Cost = tokens × `PRICE_INPUT_PER_M` / `PRICE_OUTPUT_PER_M` (defaults 1.50 and 7.50 US dollars per million),
  stored on the usage row. This is a pure function with tests.
- `npm run usage:report` prints today's plans and cost, the last 30 days' total, and the most planned cities.

### Other routes

- `/api/health` makes a paid AI call, so it answers only to emails in `ADMIN_EMAILS`. Anyone else gets 404.
- `/api/geocode` and `/api/weather` stay public, limited to 60 requests per minute per visitor. The counter
  lives in `cache_entries` and is keyed by a hash of the IP address, never the raw address.

---

## 2E. Privacy and the account page

This is a draft to be reviewed by a person; it isn't legal advice.

### `/privacy`, in plain words, in the site's design

- **What is stored:** email, name, the profile picture link if Google provides one, trips and their history,
  and counts and costs of plans. No passport data, no payment data.
- **Never stored:** "Step-free routes preferred" is health-related, so it stays in the browser: strip it from trips before saving them to the database, and never log it.
- **Why:** to sign you in, keep your trips, and prevent abuse.
- **Where:** Postgres on Neon, EU region; the site runs in Vercel's EU region.
- **Who else processes data:**
  - Google, for sign-in and for planning with Gemini. Trip details are sent to plan cities; under Google's
    paid terms they are not used to train models.
  - Geoapify, for place searches.
  - Open-Meteo, which receives coordinates and dates.
  - Resend, which receives the email address that sign-in links are sent to.
- **How long:** until you delete your account. Sessions expire after 30 days. Plan counts and costs are kept
  for 12 months without a link to you, for cost accounting.
- **Your rights:** download or delete everything from the account page; contact `CONTACT_EMAIL`.
- **Cookies:** one essential sign-in cookie and nothing else, so no cookie banner is needed. Adding analytics
  later means revisiting this.

### `/account`

- **Download my data**: a JSON file with the user record, all trips and all versions.
- **Delete my account**: the person types DELETE to confirm. This removes the user, their sessions, linked
  accounts, trips and versions, and sets `user_id` to null on their usage rows.

### Logging

Server logs contain ids only: never emails, trip contents or IP addresses.

---

## Security checklist (part of every commit's review)

- [ ] Every trip query filters on the signed-in user's id.
- [ ] Every request body is validated with Zod and size-capped.
- [ ] Changing routes (POST, PUT, DELETE) reject requests whose `Origin` isn't the site's own.
- [ ] Session cookies are httpOnly and secure in production (Better Auth defaults; verify, don't assume).
- [ ] No secret reaches the browser; nothing new uses `NEXT_PUBLIC_` except harmless settings.

## Tests (no database needed)

- `describeChange`: every row of the table, several changes at once, and no change.
- Coalescing: within 60 seconds and same kind → update; otherwise → new version.
- Limits: per-person and site counts; a cached plan doesn't count; the "again from" time.
- Cost from usage metadata, including thinking tokens.
- `isInvited`: allowed, refused, mixed-case email, and invite-only switched off.
- Trip API with the in-memory `TripStore`: someone else's trip answers 404; oversized bodies are refused.

## New environment variables

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_SIGNIN_ENABLED`, `INVITE_ONLY`, `INVITE_EMAILS`, `ADMIN_EMAILS`, `CONTACT_EMAIL`,
`PLAN_LIMIT_PER_USER_DAY`, `PLAN_LIMIT_GLOBAL_DAY`, `PRICE_INPUT_PER_M`, `PRICE_OUTPUT_PER_M`.

## Done when

The five commits are in, all checks pass in CI, and you've signed in with Google locally, saved a trip,
edited it, restored an earlier version, hit the per-person limit with a low test value, downloaded your data
and deleted a test account.
