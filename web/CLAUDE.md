@AGENTS.md

# Terrasse web — rules for Claude Code

- The AI may only reference places by the ids we send. `src/lib/grounding.ts` drops anything else. Never weaken this.
- The AI never computes times or totals. All arithmetic lives in `src/lib/recalculate.ts`, which must stay pure (no network).
- Every edit goes through a function in `src/lib/tripEdits.ts` that copies the trip and returns the copy.
- API keys are read only on the server (`src/lib/server/`). Never use NEXT_PUBLIC_ for them.
- Code style: plain loops and named functions over map/filter chains and inline ternaries; one comment per block explaining why.
- Design: one light warm palette defined in `globals.css` `:root`. No dark mode, no theme switcher, no dashboard panels, no all-caps labels.
- Before finishing any change: `npm run typecheck && npm run lint && npm test && npm run build`.
