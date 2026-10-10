# Phase 3: Go live, invite-only first

A runbook. Most steps happen in web consoles and are done by you; the two code steps are marked
**(Claude Code)**. About one day.

Before starting: Phases 0 to 2 are merged and the latest CI run is green.

## 1. Code changes before the first deploy (Claude Code)

- In `src/app/api/plan-leg/route.ts`, export `maxDuration = 120` (seconds). A city takes 15 to 40 seconds,
  plus retries. Check the exact syntax in the bundled Next.js docs (route segment config, `maxDuration`).
- If you have no domain yet, set `EMAIL_SIGNIN_ENABLED=false` so the site offers Google sign-in only.

## 2. Database (Neon)

1. Use the `main` branch of your Neon project (EU region) for production.
2. Before every production migration, create a Neon branch named `before-<date>`. That's your restore point.
3. From `web/`: `DATABASE_URL="<production url>" npm run db:migrate`.

## 3. Google Cloud

### Sign-in client

1. **OAuth consent screen**: External; app name Terrasse; your support email; scopes `openid`, `email`,
   `profile` only.
2. Leave the publishing status on **Testing** while invite-only, and add your invitees as test users. Only
   test users can then sign in with Google, which doubles as a second invite list.
3. **Credentials → OAuth client ID → Web application.** Authorised redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-site>/api/auth/callback/google`

   Confirm the callback path against the Better Auth docs for the version you pinned.

### Gemini on the paid tier

1. In the Google Cloud project that owns your production Gemini key, turn on billing. Use a separate key
   from your development one.
2. **Billing → Budgets & alerts**: a budget of $10 a month, with alerts at 50%, 90% and 100%. It warns
   only. The app's `PLAN_LIMIT_GLOBAL_DAY` is what actually stops spending.

## 4. Email (Resend), only if you have a domain

1. Add your domain in Resend and create the DNS records it shows. Wait until it says verified.
2. Create an API key with sending access only.
3. Set `EMAIL_FROM="Terrasse <hello@your-domain>"` and `EMAIL_SIGNIN_ENABLED=true`.

Without a domain, Resend only delivers to your own address, so keep `EMAIL_SIGNIN_ENABLED=false` until you
have one.

## 5. Vercel

1. Import the GitHub repository. **Root Directory**: `web`. Framework: Next.js. Node.js: 24.
2. Functions region: an EU region close to your Neon region.
3. Environment variables, Production: every variable in `web/.env.example`, with production values:
   - `BETTER_AUTH_URL` = your site's address
   - `BETTER_AUTH_SECRET` = the output of `openssl rand -base64 32` (new, never reused from dev)
   - `INVITE_ONLY=true`, `INVITE_EMAILS`, `ADMIN_EMAILS`, `CONTACT_EMAIL`
   - `PLAN_LIMIT_PER_USER_DAY=5`, `PLAN_LIMIT_GLOBAL_DAY=10`
   - `PLANNER_DEBUG=0`
4. Deploy.

## 6. Smoke test (about 15 minutes, on the live site)

- [ ] The homepage loads; a ready-made trip opens and can be edited.
- [ ] Setting a date shows the weather, and its source is labelled.
- [ ] The day map shows numbered stops.
- [ ] Google sign-in works for an invited address and is refused for a non-invited one.
- [ ] The email link, if enabled, arrives within a minute and works only once.
- [ ] `/api/health` signed in as admin: both services OK. Signed out: 404.
- [ ] Planning a new city works, and `npm run usage:report` against production shows its cost row.
- [ ] The privacy page is linked from the footer; a test account can download its data and delete itself.
- [ ] The footer credits OpenStreetMap, Geoapify, OpenFreeMap and Open-Meteo.

## 7. If something goes wrong

- **Bad deploy:** Vercel → Deployments → the previous deployment → Instant Rollback.
- **Bad migration:** restore from the `before-<date>` Neon branch.
- **Costs climbing:** lower `PLAN_LIMIT_GLOBAL_DAY` (it takes effect on the next deploy), or set it to 0 to
  pause AI planning while everything else keeps working.

## 8. After launch

- Put the live link at the top of the root `README.md`, marked "invite-only beta", and record the 60-second
  demo video.
- Run `npm run usage:report` daily for the first week. Replace the cost estimates in
  `docs/public-launch/README.md` with measured numbers.
- Opening to everyone: Google consent screen → **Publish app**, `INVITE_ONLY=false`, then raise
  `PLAN_LIMIT_GLOBAL_DAY` gradually while watching costs.

## Terms to keep in mind

Vercel Hobby and Open-Meteo's free tier are for non-commercial use. Ads, payments or client work would mean
moving to their paid plans. Check Geoapify's free-plan terms for public sites when you sign up, and keep its
attribution in the footer.
