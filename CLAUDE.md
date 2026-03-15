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

All API routes follow: read cookie → `verifyToken()` → check role/ownership → Prisma query → `NextResponse.json()`.

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
