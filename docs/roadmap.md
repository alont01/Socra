# Socra Roadmap — Admin Logging · Parent Support · Parent Mobile App

Living plan for the current initiative. Decisions locked with the product owner:
- **Mobile app:** Expo / React Native (native iOS + Android), sharing the existing REST API.
- **Admin logging:** audit trail (`AuditLog`) + a browsable log viewer over persisted events.
- **Parent linking:** invite code / link (student or tutor generates; parent redeems).

## Architecture note
All three workstreams reuse the existing Next.js REST API. The one foundational
backend change that unblocks the mobile app is **Bearer-token auth** — today
`verifyToken` reads an httpOnly cookie, which a native app can't use. We add
`Authorization: Bearer <jwt>` as an accepted credential alongside the cookie
(additive) when the parent/mobile backend work starts.

## Data model changes

| Model | Purpose | Status |
|---|---|---|
| `AuditLog` | Who did what, when (immutable audit trail) | Phase 0 |
| `SystemEvent` (reuse) | Persisted app errors/telemetry — feeds the log viewer | exists |
| `ParentInvite` | Link parent ↔ child via redeemable code | Phase 2 |
| `ParentDevice` | Expo push tokens | Phase 4 |
| `ParentProfile.onboardingDone` | Parent first-run flag | Phase 2 |

## Phases

- **Phase 0 — Foundations**: `AuditLog` model + migration, `recordAudit()` helper,
  instrument key mutations. (`requireAdmin()` already exists.)
- **Phase 1 — Admin logging** ✅: `/api/admin/audit` + `/api/admin/events`, admin
  **Logs** viewer (filter/search/paginate).
- **Phase 2 — Parent backend** ✅: `ParentInvite`, redemption flow, parent APIs
  (children / progress / sessions) with strict ownership guards. Bearer-token
  auth landed here.
- **Phase 3 — Parent web** ✅: parent dashboard + child progress (reuses
  `MasteryChart`, `SessionAnalysis`), `/parent/join` redemption, invite buttons
  on student dashboard + tutor roster, PARENT signup + `next` redirect.
- **Settings / profile** ✅ (added alongside phase 3): `/settings` page shows
  role (read-only), member-since, and role-specific fields (grade/goals,
  expertise/bio); edit via `/api/profile` (PATCH). Super admin codified in
  `lib/admin.ts` (isAdmin/isSuperAdmin); `requireAdmin` uses it.
- **Auth model hardening** ✅: public signup is STUDENT/PARENT only; TUTOR is
  created solely by redeeming an admin-issued invite (`/admin/tutors` →
  `TutorInvite` → `/tutor/join` → `/api/tutor-invites/redeem`). Users can't
  change their own role (self-serve `/api/profile/role` removed). Parent invites
  are tutor-only. Accessibility pass on dashboards + auth (landmarks, labels,
  focus-visible, `prefers-reduced-motion`). Dashboards restructured with stats +
  guide sections.
- **Reliability hardening** ✅: shared robust JSON extractor
  (`lib/ai/parse-json.ts` — fence-strip, prose-slice, trailing-comma/comment
  repair) wired into the analyzer + practice + live-practice generators, so a
  malformed AI response degrades gracefully instead of throwing. Pipeline now
  guards against empty sessions (no transcript/notes/whiteboard) with a clear,
  retryable "insufficient content" state instead of hallucinating. Notes
  fallback already existed. Unit tests for the parser.
- **Phase 4 — Mobile app** 🚧 scaffolded + publish-ready (`mobile/`): Expo SDK 52
  + expo-router, SecureStore JWT via `/api/auth/token` (Bearer), React Query.
  Screens: login (parent-only gate) → children list → child detail (mastery +
  session summaries). Publish config: `eas.json` (dev/preview/production +
  submit), icon/splash/adaptive-icon wired with brand placeholder PNGs. Excluded
  from the web tsconfig/eslint. _Pending: run/test on device (owner-driven),
  real icon art, `eas init` + build/submit, store accounts._
- **Phase 5 — Push + stores** (BACKLOG): `expo-notifications` + `ParentDevice`
  token registration + notification triggers, EAS build, store submission.
  Publishing is owner-driven (needs Apple/Google accounts); parked for now while
  we focus on the web experience.

## Web experience

- **Progress over time** ✅: `MasteryHistory` model + migration records a
  snapshot each time a topic's mastery changes (session concept coverage or a
  practice attempt). `buildOverallTrend` reconstructs an overall-average-over-
  time series; `MasteryTrend` area chart shows it (current % + delta since
  start) on the student progress page and the parent child-detail page.
  Existing users' trends populate as new sessions/practice happen.
- **Chat upgrade** ✅: student AI chat now persists per-user to localStorage
  (survives refresh), offers starter-prompt chips on an empty chat (a couple
  showcase inline graphs), and has a "New chat" control. Accessibility: labeled
  input, aria-hidden avatar/icon.

## Visualizations

1. **Web-native interactive plots** ✅ (shipped): expression-driven plots via an
   in-house safe evaluator (`lib/math-eval.ts` — no eval; + - * / ^, implicit
   multiplication, constants, whitelisted functions). `FunctionPlot` samples
   `expr` client-side, shows a hover crosshair with (x, y), and renders
   parameter sliders (`params`) that re-plot live. Backward-compatible with the
   old points-based specs. AI prompt updated to prefer `expr`. Robust plot-JSON
   parsing via `extractJson`. _Remaining/optional: auto-annotation
   (roots/vertex/asymptotes), reliable geometry primitives._
2. **Manim (3Blue1Brown engine) explainer videos (async, pre-rendered):**
   Manim is Python, an offline batch renderer → MP4 (needs FFmpeg/Cairo/Pango/
   LaTeX), not real-time and not a browser lib. Fit: a **separate Python render
   worker** behind a job queue, output to object storage/CDN, played async.
   Start with a **curated pre-rendered concept library** (no AI-generated code
   execution). Any dynamic AI-generated Manim code must run **sandboxed**
   (isolated container, no network, CPU/time limits) — arbitrary code execution
   risk. Treat as its own ops-aware phase after the parent/mobile work.
