# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev              # Start dev server
npm run build            # Production build (prisma generate + next build)
npm run lint             # ESLint
npx tsc --noEmit         # Type check
npm test                 # Run all Jest tests
npm run test:watch       # Jest watch mode
npm run test:coverage    # Jest with coverage
npx prisma migrate dev   # Create and apply migrations (dev)
npx prisma generate      # Regenerate Prisma client after schema changes
```

## Architecture

**Stack:** Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind, Prisma (PostgreSQL), KaTeX, Anthropic SDK, Daily.co

**What this app does:** AI-powered scribe for live math tutoring. Tutors run video sessions with students via Daily.co. After a session ends, the app fetches the transcript, runs it through Claude for analysis (summary, concepts, strengths, gaps), generates targeted practice sets, and tracks student mastery over time.

### Roles & Access

- **TUTOR**: Creates/manages sessions, maintains student roster, takes notes during video calls, reviews AI analysis
- **STUDENT**: Joins video sessions, completes AI-generated practice sets, chats with AI assistant, views progress
- PARENT role exists in schema but has no active UI

### Auth Flow

Two auth paths converge into one JWT cookie (`token`, 7-day expiry):
1. **Email/password** — `/api/auth/signup` + `/api/auth/login` → `signToken()` → cookie
2. **OAuth (Google/GitHub)** — NextAuth v5 → `/api/auth/set-role` (pick STUDENT/TUTOR) → cookie

`middleware.ts` protects `/onboarding`, `/dashboard`, `/session`, `/student`, `/tutor`. API routes verify tokens via `verifyToken()` from `lib/auth.ts` (uses `jose`).

### Session Lifecycle

1. Tutor creates session → status `scheduled`
2. Tutor starts → PATCH to `active`, Daily.co room auto-created (2-person, 3hr expiry, transcription enabled)
3. Both join video; tutor takes notes in sidebar
4. Tutor ends → status `completed`, async pipeline fires:
   - Fetch transcript from Daily.co (retry up to 5x, 10s intervals)
   - Analyze with Claude Sonnet → summary, concepts, strengths, gaps, tutor feedback
   - Generate practice set from identified gaps
   - Update student mastery via exponential moving average (α=0.3)

### AI Layer (`lib/ai/`)

- `session-analyzer.ts` — Claude Sonnet: transcript → `SessionAnalysisResult`
- `practice-set-generator.ts` — Claude Sonnet: gaps → targeted problems
- `lib/session-processing.ts` — Orchestrates the end-of-session pipeline
- `lib/progress.ts` — Mastery calculation: `new = 0.3 * score + 0.7 * old`

### Key Data Models

- `User` → one-to-one with `StudentProfile`, `TutorProfile`, `ParentProfile`
- `TutorStudent` — junction table for tutor roster
- `TutoringSession` → has one `Transcript`, one `SessionAnalysis`, many `PracticeSet`s
- `PracticeSet` → many `PracticeSetAttempt`s (tracks per-problem answers)
- `StudentProgress` — unique per (studentId, topic), stores mastery float 0–1

### API Route Pattern

Every route handler is wrapped in `route()` from `lib/api-handler.ts` and exported as a `const`, never as a bare `export async function`:

```ts
export const POST = route('tutor/students', async (request: Request) => {
  const auth = await requireTutor()
  if (!auth.ok) return auth.response
  // ...
  return NextResponse.json({ student })
})
```

The wrapper owns the cross-cutting concerns, so handlers must **not** write their own top-level `try/catch`:

- Assigns a request id (reuses an inbound `x-request-id`), echoes it on the response, and opens the async-local request context so every log line in the request carries it
- Times the request; logs 5xx at error, slow requests at warn, 4xx at info, 2xx at debug
- Converts throws into consistent responses: `ApiError` → its own status, `SyntaxError` (malformed body) → 400, Prisma `P2002`/`P2025`/`P2003` → 409/404/400, anything else → a generic 500 that never leaks the internal message
- Records a `SystemEvent` for every 5xx
- Rethrows Next's control-flow errors (`redirect()`, `notFound()`) untouched

Conventions:

- The first argument to `route()` is the route's path minus `app/api/`, e.g. `tutoring-sessions/[id]/end`
- Throw `ApiError(status, message)` (or `badRequest`/`notFound`/`conflict`/…) from helper code that can't build a response; pass the underlying error as `{ cause }`
- Pass `{ errorMessage }` as the third argument when a generic 500 would leave the user without a next step
- Auth: `requireAuth` / `requireTutor` / `requireStudent` / `requireParent` / `requireAdmin` from `lib/api-auth.ts` (these also stamp the caller onto the request context — never re-implement `verifyToken` in a route)
- Session cookie: only `setAuthCookie` / `clearAuthCookie` from `lib/auth-cookie.ts`

### Billing

Monthly, hours-based, invoiced through Stripe. Money-safety rules — none of these are optional:

**Hours** (`lib/billing.ts`): `billableHours = min(actual, scheduledMinutes + graceMinutes)`. `endedAt` is written only when a tutor clicks End, so raw wall-clock overstates any session left open. Short sessions bill their actual length — the cap only ever reduces. A missing/absurd `scheduledMinutes` falls back to the default rather than disabling the cap.

**Abandoned sessions** (`lib/session-sweeper.ts`): an `active` session older than `config.session.staleAfterHours` is closed with `endedAt = startedAt + cap` and flagged `autoClosed`. `endedAt` is derived from the cap, never from "now", so *when* the sweeper runs can't change what a family pays. Batched at 25/run so a backlog doesn't fire every AI pipeline at once. Driven by `.github/workflows/sweep-sessions.yml` → `/api/cron/sweep-sessions` (bearer `CRON_SECRET`; Render's starter plan has no cron).

**Sending** (`lib/billing-send.ts` → `lib/stripe-invoicing.ts`):
- **Claim before Stripe.** The local `Invoice` row is inserted *first*; `@@unique([parentId, periodStart, periodEnd])` is the concurrency arbiter. Taking over an existing row is a conditional `updateMany` allowing only `failed` or a `pending` claim older than 10 minutes — two concurrent clicks cannot both charge.
- **Draft before line items.** Items are attached to a specific invoice (`invoice: draft.id`) with `pending_invoice_items_behavior: 'exclude'`. An item created without an invoice belongs to the *customer* and gets swept onto their next invoice — that's the classic double-bill.
- **Retries resume, never recreate.** The Stripe invoice id is persisted the moment the draft exists (`onInvoiceCreated`), so a retry days later resumes it. Live status is re-read before acting: already-paid/void invoices are never re-sent, and a draft that already has lines doesn't get a second set.
- **Every status write is conditional on `pending`.** A parent can pay before the send finishes; an unconditional write would clobber `paid` back to `sent`.

**Payment status** is webhook-driven (`/api/stripe/webhook`): signature verified against `STRIPE_WEBHOOK_SECRET` before anything else, duplicate events ignored by `stripeEventId`, and events older than `statusUpdatedAt` discarded so out-of-order delivery can't un-pay an invoice. Missing secret returns 503 so Stripe retries rather than dropping the event. `/api/admin/billing/sync` is the pull-based backstop for events missed during a deploy.

### Logging

`createLogger(module)` from `lib/logger.ts` is the only logging API — no bare `console.*` in `app/` or `lib/`.

- JSON lines in production (queryable by `level`/`module`/`requestId`/`userId`), human-readable in dev; `LOG_LEVEL` overrides the default (`info` in production, `debug` locally)
- Entries are automatically stamped with the active request id and authenticated user
- Values under secret-shaped keys (`password`, `token`, `secret`, `apiKey`, `authorization`, `cookie`, `codeHash`) are redacted; long strings truncated
- `logger.error(message, error, data)` takes the thrown value directly and extracts name/message/stack/code plus the `cause` chain
- Never log a credential, verification code, or reset link outside development
- Client-side crashes report to `/api/client-errors` via `reportClientError()` — browser errors reach the server log instead of only the user's console

### Component Organization

- `components/ui/` — Primitives (Button, Card, Input, Badge, LoadingDots)
- `components/dashboard/` — TutorDashboard, StudentDashboard, StudentRoster
- `components/session/` — VideoCall, NotesSidebar, AnalysisSummary, TranscriptViewer
- `components/practice/` — PracticeSetCard, PracticeWorkspace
- `components/chat/` — StudentChatPanel (SSE streaming via `useStream` hook)
- `components/MathRenderer.tsx` — KaTeX wrapper for rendering math expressions

### Import Alias

`@/*` maps to project root (e.g., `import { prisma } from '@/lib/prisma'`).

## Testing

Jest with jsdom + React Testing Library. Tests live in `__tests__/`. Coverage collects from `components/` and `lib/` only. The `jose` package must not be transformed (configured in `jest.config.ts`).

## Pre-Commit Checks

Before every commit, review changed code for **async race conditions** — especially:
- Calling methods on objects that require initialization (e.g., `sendAppMessage` before `join()` resolves)
- Exposing references (via callbacks, state, or refs) before async setup completes
- Effects or listeners that fire immediately on mount but depend on async readiness
- Missing `await` on promises where downstream code assumes completion

If a race condition is found, fix it before committing.

## Post-Commit Workflow

After every large commit (3+ files changed or significant logic changes), immediately spin up **two background agents in parallel**:

1. **Diff review agent** (`subagent_type: general-purpose`, `run_in_background: true`): Run `git diff HEAD~1` and review the changes for:
   - Bugs, logic errors, or regressions
   - Security issues (exposed secrets, injection vectors, missing auth checks)
   - Broken imports or missing dependencies
   - Inconsistencies with existing patterns in the codebase
   - Report findings as a concise summary; flag anything that needs immediate attention

2. **Test runner agent** (`subagent_type: general-purpose`, `run_in_background: true`): Run the full test suite and type check:
   - `npm test` (Jest unit tests)
   - `npx tsc --noEmit` (TypeScript type check)
   - `npm run lint` (ESLint)
   - Report pass/fail status and any failures with relevant error output

Both agents run in the background so work can continue. If either agent reports failures or critical issues, address them before moving on.

## Deployment

Render (Node.js) with managed PostgreSQL. Production start runs `prisma migrate deploy` before `next start`. Set `DATABASE_URL` in the Render dashboard to the internal Postgres connection string.
