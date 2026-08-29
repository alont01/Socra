# Testing

Five layers, cheapest first. Each proves something the one below it can't.

| Layer | Command | Proves | Needs | Runs in CI |
|---|---|---|---|---|
| Type check | `npx tsc --noEmit` | The code fits together | — | every push + PR |
| Lint | `npm run lint` | House style, obvious mistakes | — | every push + PR |
| Unit | `npm test` | Pure logic behaves | — | every push + PR |
| Model eval | `npm run eval:visualize` | The **model** produces good output | real API key, spends money | no — see below |
| E2E / smoke | `npm run e2e`, `npm run smoke` | A **deployed** app is alive | a running deployment | daily + on demand |

The first three are free, fast, and deterministic — run them constantly. The last two cost money or touch a live environment; run them deliberately.

---

## What to run when you change…

| You changed | Run |
|---|---|
| `lib/` or `components/` logic | `npm test` + `npx tsc --noEmit` |
| A renderer, parser, or calculation | `npm test` — and add a case; these are pure and cheap to cover |
| **A prompt, a model, or `config.ai.*`** | `npm run eval:visualize`. Unit tests cannot see prompt quality. |
| An API route's contract | `npm test` for the handler, then smoke the deployed route |
| Anything user-facing on a public page | `npm run e2e` |
| Billing, sweeper, or invoicing | `npm test` — and read the money-safety rules in `CLAUDE.md` first |

---

## Unit tests

Jest, jsdom, React Testing Library. Tests live in `__tests__/`, mirroring the source tree. Coverage is collected from `components/` and `lib/` only.

```bash
npm test              # all
npm run test:watch    # watch mode
npm run test:coverage
npx jest __tests__/lib/whiteboard-draw.test.ts   # one file
```

`testMatch` is `**/__tests__/**/*.test.ts(x)` — anything outside `__tests__/` is invisible to `npm test`, which is how the evals stay out of the default run.

Write unit tests for anything pure: renderers, parsers, mastery math, billing hours, validators. `lib/whiteboard-draw.ts` is the model to copy — every branch is a plain function over plain data, so the whole SVG pipeline is testable without a browser or a canvas.

---

## Model evals

**The layer that matters most for AI features, and the one that's easy to skip.**

Unit tests prove the renderer can draw a good explanation. They say nothing about whether the model will *author* one. Those are different failures, and only an eval catches the second. The lone-diagonal-line bug shipped because the renderer silently discarded a primitive the model invented — a shape no unit test was asking about.

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run eval:visualize
```

Writes to `eval-output/` (gitignored): every frame as `.svg`, the raw model JSON as `.json`, and a `report.txt` scorecard. **Look at the SVGs.** The assertions catch structural failure; only your eyes catch a diagram that is valid, renderable, and pedagogically useless.

### What it asserts

- **A usable spec came back** — `normalizeDrawSpec` returned non-null.
- **At least one frame rendered.**
- **`kept === emitted`** — every primitive the model emitted survived normalization. This is the important one. A primitive the model invents and the renderer discards is a *silent* failure: the API returns 200, a picture appears, and it's wrong. If this fails, either teach the renderer the primitive or stop the prompt from suggesting it.

The report also prints item kinds, step counts, whether the model used `clear`, and `cache_read_input_tokens` so you can confirm prompt caching is actually hitting.

### Why it isn't in CI

It costs real money per run and model output isn't deterministic, so it would produce flaky red builds on a schedule nobody trusts. Run it by hand when you touch a prompt or a model, and read the output.

### Adding an eval for another AI feature

Practice generation and assessment have no eval yet — they're the obvious next ones, and they have a sharper pass/fail signal than visualization does (is the answer key actually correct?). Copy `scripts/eval/visualize-spec.eval.ts`. Two rules:

1. **Import the prompt and config from source.** Never paste a copy of the prompt into the eval — a copy drifts, and then the eval passes while production fails.
2. **Guard on a real key, not a present one.** `jest.setup.ts` sets `ANTHROPIC_API_KEY = 'test-key'` when it's unset, so `if (!process.env.ANTHROPIC_API_KEY)` never skips — it runs and gets a 401. Check `key?.startsWith('sk-ant-')`.

Files in `scripts/eval/*.eval.ts` are picked up by the `eval:*` npm scripts and ignored by `npm test`.

---

## E2E and smoke

⚠️ **Both default to production** (`https://www.socratutoring.com`). Always set the URL unless you mean it.

```bash
E2E_BASE_URL=http://localhost:3000 npm run e2e
npm run smoke -- http://localhost:3000
npm run smoke -- --wait          # poll /api/health first, for post-deploy
```

Playwright specs live in `e2e/`. The suite deliberately sticks to signed-out public flows plus parent flows using synthetic seeded accounts, so it needs no real credentials. Seeding and cleanup:

```bash
node scripts/_seed-e2e-parent.mjs     # verified synthetic parent
node scripts/_cleanup-e2e.mjs         # removes anything matching +e2e-
```

Synthetic accounts use `+e2e-` in the email, which is what cleanup keys off. Keep that convention or cleanup will miss them.

CI runs E2E daily at 08:00 UTC and on demand from the Actions tab; smoke runs on its own schedule and after deploys.

### What E2E deliberately does not cover

**Live tutoring sessions.** Reaching the whiteboard or the Visualize panel requires a session in `active` state, which means creating a real `TutoringSession` row and a real Daily.co room. Per the billing rules in `CLAUDE.md`, an `active` session left open gets closed by the sweeper with `endedAt = startedAt + cap` and flagged `autoClosed` — which feeds hours-based invoicing. **A test session can land on a real family's invoice.**

So: test live-session features through the eval harness and unit tests, not E2E. If you genuinely must click through one, use a throwaway tutor and student with no parent attached, and end the session yourself rather than leaving it for the sweeper.

The production database is named `test-postgres`. It is not scratch.

---

## Before you commit

1. `npm test && npx tsc --noEmit && npm run lint` — all three green.
2. If you touched a prompt, a model, or `config.ai.*` — run the eval and look at the frames.
3. Review the diff for async race conditions (the checklist in `CLAUDE.md` — calling methods before init resolves, exposing refs before async setup completes, missing `await`).

## After you deploy

1. `npm run smoke -- --wait` against the deployed URL.
2. Check `/admin` — integration probes, and the AI metrics tile for latency and token spend. Every `trackedMessage` call records model, tokens, and duration, so a model or `max_tokens` change shows up there within a few real requests.

---

## Gotchas worth remembering

- **`jest.setup.ts` fakes `ANTHROPIC_API_KEY`.** See the eval section — this defeats naive skip guards.
- **`jose` must not be transformed** — configured via `transformIgnorePatterns` in `jest.config.ts`. Don't "clean that up".
- **Thinking tokens come out of `max_tokens`.** Lowering a ceiling on a reasoning model truncates the answer mid-thought instead of shortening it. `__tests__/lib/config.test.ts` asserts floors for the three reasoning paths.
- **Prompt caching is a prefix match.** One interpolated value inside a cached system block and every request misses silently. `__tests__/lib/ai/visual-prompt.test.ts` guards this for the visualizer; do the same for any new cached prompt.
