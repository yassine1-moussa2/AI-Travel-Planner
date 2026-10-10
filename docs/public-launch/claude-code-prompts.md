# Prompts for Claude Code

Paste one prompt at a time, from the repository root. Wait for each step to be committed and checked before
starting the next. Every prompt ends with the same working rules, so they're written once here:

> **Working rules:** Read `web/CLAUDE.md` and the named spec file first. Implement only the named section.
> Show me the diff before each commit. Run `npm run typecheck`, `npm run lint`, `npm test` and
> `npm run build` in `web/` before committing. Don't push until I say so. When you need an account, key or
> secret, tell me which variable to set in `web/.env.local`; never ask me to paste a secret into the chat.

Copy the working rules under each prompt.

---

## Phase 0

```
Follow docs/public-launch/phase-0-loose-ends.md. Run each check, tell me which pass and which fail, then fix the failing ones, one small commit each.
```

## Phase 1

**1A**

```
Implement section 1A of docs/public-launch/phase-1-public-front.md: the hero sentence, the "How it works" section, and the renamed stay styles.
```

**1B, part 1: the machinery**

```
Implement section 1B of docs/public-launch/phase-1-public-front.md, except running the generation: tripSchema, the generation script, the dev-only "Copy trip as JSON" button, the ready-made trips section in the interface, and the sample tests. Stop before running the script.
```

**1B, part 2: generate and review** (uses your own Gemini key locally, about 9 AI calls)

```
Run npm run samples:generate in web/ and show me the computed total for each of the nine trips. Then wait while I review them in the browser. After my review, run the sample tests and commit the nine files.
```

**1C**

```
Implement section 1C of docs/public-launch/phase-1-public-front.md: the weather route, weather words, packing hints, the interface changes, the footer credit and the tests.
```

After Phase 1: run `npm run dev`, look at the new sections at desktop and phone width, and send screenshots
for a design review.

## Phase 2

**2A**

```
Implement section 2A of docs/public-launch/phase-2-accounts.md: Drizzle, the four app tables and their migrations, and the database-backed cache with the in-memory fallback. Tell me which Neon variable to set; I'll create the Neon project myself.
```

**2B**

```
Implement section 2B of docs/public-launch/phase-2-accounts.md: Better Auth with Google and the email link, the EMAIL_SIGNIN_ENABLED switch, the invite-only check, the sign-in page and the header links. Check the bundled Next.js 16 docs before touching request handling. Tell me exactly what to create in Google Cloud and which variables to set.
```

**2C**

```
Implement section 2C of docs/public-launch/phase-2-accounts.md: the trip API with the TripStore interface, autosave, describeChange with coalescing, the Earlier versions list, the /trips page and the first-sign-in import.
```

**2D**

```
Implement section 2D of docs/public-launch/phase-2-accounts.md: sign-in required for new plans, the cached-plan shortcut, both limits with the reservation pattern, cost recording from usageMetadata, npm run usage:report, the admin-only health check and the per-visitor limits on geocode and weather.
```

**2E**

```
Implement section 2E of docs/public-launch/phase-2-accounts.md: the privacy page, the account page with download and delete, and the logging rule. Then go through the security checklist in the same file and report on each item.
```

## Phase 3

```
Do step 1 of docs/public-launch/phase-3-deploy.md (maxDuration on the plan route, and the email sign-in switch if I have no domain). Then walk me through steps 2 to 6 one at a time, waiting for me to confirm each before moving on.
```
