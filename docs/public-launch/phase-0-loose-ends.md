# Phase 0: Close loose ends

Goal: the repository on GitHub matches what runs locally, and the automated checks are green. About one hour.

## Check

1. `git status` is clean and `git log` shows commits for:
   - the website in `web/`
   - `web/next.config.ts` with `turbopack.root`
   - the Gemini retry update (`web/src/lib/server/gemini.ts`, `web/tests/gemini.test.ts`)
   - the day map, if it was built
2. No `.env`, `.env.local` or `*:Zone.Identifier` file is tracked:
   `git ls-files | grep -E "\.env|Zone.Identifier"` prints only `web/.env.example`.
3. The root `.gitignore` contains `*:Zone.Identifier`.
4. The root `README.md` says the main app is the website in `web/`, links to `web/README.md`, and
   describes the CLI in `src/` as the original prototype.
5. A root `.nvmrc` contains `24`.
6. `.github/workflows/ci.yml` runs `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` and
   `npm run build` in `web/`, and the latest run on GitHub's Actions tab is green.

## Fix

Anything missing from the list above: do it now, one small commit each.

## Done when

All six checks pass and GitHub shows a green tick on the latest commit.
