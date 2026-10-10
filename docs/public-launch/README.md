# Going public: overview

Terrasse goes from a local tool to a public site in four phases. Phase 0 and 1 work locally and are safe
to do now. Phase 2 makes the site safe for strangers. Phase 3 puts it online.

Facts below were checked on 10 October 2026. Re-check anything marked with a link before relying on it.

## Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| AI for the public | Paid Gemini, with a per-user and a global daily cap | Google's terms allow [only paid services](https://ai.google.dev/terms) when an app is offered to users in the EEA, Switzerland or the UK |
| Sign-in | Google, plus an emailed sign-in link | No passwords stored anywhere. The first sign-in is the registration |
| Auth library | [Better Auth](https://www.better-auth.com) | The Auth.js team joined Better Auth in September 2025; Better Auth is the recommended choice for new projects |
| Ready-made trips | Lisbon, Barcelona, Rome, each in Budget, Mid-range and Luxury | Visitors get a useful site in seconds, with zero AI cost |
| Weather | [Open-Meteo](https://open-meteo.com) | Free for non-commercial use, no key. Real forecast up to 16 days ahead, typical weather beyond that |
| Database | Postgres on Neon (EU region), with Drizzle ORM | Persistent cache, accounts, trips and history in one place |
| Hosting | Vercel Hobby (EU region) | Free for non-commercial projects; [functions may run up to 300 s](https://vercel.com/docs/functions/limitations), enough for a 15 to 40 s city plan |
| Invite-only start | An allow-list of email addresses | Better than a shared password: each person signs in as themselves |

## Who can do what once public

| Action | Visitor | Signed in |
| --- | --- | --- |
| Open and edit a ready-made trip | Yes | Yes |
| Edit times, places, prices on any plan | Yes | Yes |
| Plan a new city with the AI | No, asked to sign in | Yes, up to 5 new cities a day |
| Keep trips and their history | In this browser only | In the account, on any device |

## Architecture

```
Browser ──▶ Next.js on Vercel (EU) ──▶ Postgres on Neon (EU)
                │                         users, sessions, trips, versions,
                │                         usage and cost log, cache
                ├──▶ Geoapify      real places, geocoding
                ├──▶ Gemini (paid) arranging places into days
                ├──▶ Open-Meteo    forecast and typical weather
                ├──▶ Google        "Continue with Google"
                └──▶ Resend        sign-in link emails
```

Rules that do not change:

- The AI only arranges real places it was given; grounding drops anything else.
- All arithmetic (times, budgets, weather averages, limits) is plain code, never the AI.
- API keys and secrets live only on the server.

## AI cost and the daily cap

Gemini 3.6 Flash rises to $1.50 per million input tokens and $7.50 per million output tokens (thinking
included) from 1 January 2027. Budget at that rate.

One city plan is roughly 3,000 tokens in and up to 6,000 out, which comes to about $0.05. If the repair
retry fires, it's about $0.10. These are estimates. The app records the real token counts that Gemini
returns, so replace them with measured numbers after the first week.

| Setting | Start value | Worst case per day |
| --- | --- | --- |
| `PLAN_LIMIT_PER_USER_DAY` | 5 | |
| `PLAN_LIMIT_GLOBAL_DAY` | 10 (invite-only) | about $1 |

Ready-made trips and cached cities cost nothing. Also set a Google Cloud budget alert at $10 a month. The
alert only warns you; the global cap in the app is what actually stops spending.

## Phases

| Phase | What | Effort | Spec |
| --- | --- | --- | --- |
| 0 | Close loose ends | 1 hour | [phase-0-loose-ends.md](phase-0-loose-ends.md) |
| 1 | Site description, ready-made trips, weather | about 3 days | [phase-1-public-front.md](phase-1-public-front.md) |
| 2 | Database, sign-in, my trips and history, limits, privacy | 5 to 7 days | [phase-2-accounts.md](phase-2-accounts.md) |
| 3 | Go live, invite-only first | about 1 day | [phase-3-deploy.md](phase-3-deploy.md) |

The prompts to paste into Claude Code, one per step, are in
[claude-code-prompts.md](claude-code-prompts.md).

## Accounts you will need (all have free tiers; check current limits when signing up)

- Neon: the database (Phase 2)
- Google Cloud: the sign-in client (Phase 2) and Gemini billing (Phase 3)
- Resend: sign-in emails (Phase 2). It only delivers to other people's addresses from a domain you
  own, so the email link needs a domain (about €10 a year). Google sign-in works without one.
- Vercel: hosting (Phase 3)

The visa checks come after launch: wrong visa advice on a public site is the riskiest feature of all.
