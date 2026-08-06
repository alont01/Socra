# Socra — Feature Tracker

A living registry of everything Socra does today and everything planned. This is
the **high-level, product-wide** view; the initiative-specific execution plan
lives in [`roadmap.md`](./roadmap.md).

**Last updated:** 2026-08-06

## How to use this doc

- When you **ship** a feature, flip its status to ✅ and add a line to the
  [Changelog](#changelog).
- When you **start** something, set it 🚧 and note the owner/branch.
- When you **plan** something new, add it to the right area with 📋 or 💡 and,
  if it's a real initiative, expand it under [Upcoming initiatives](#upcoming-initiatives).
- Keep [Now / Next / Later](#now--next--later) honest — it's the one section a
  new contributor should read first.

### Status legend

| | Meaning |
|---|---|
| ✅ | Shipped and in production |
| 🚧 | In progress |
| 📋 | Planned & scoped (committed, not started) |
| 💡 | Idea / backlog (not yet scoped) |
| ⏸️ | Deferred or blocked (reason noted) |
| ⚠️ | Known issue / tech debt |

---

## Now / Next / Later

**Now — recently shipped**
- AI-pipeline hardening (`firstText` guard) + first real test coverage for the AI layer
- Skeleton loading states on admin + session pages
- Test/CI foundation: GitHub Actions (lint/tsc/jest), Playwright E2E against live, `npm run smoke`

**Next — the strongest candidates**
- 📋 **Live tutor-triggered visualization** (Tier A+B) — the highest-leverage new feature; ~2–3 weeks on the existing viz + sync stack. See [Upcoming initiatives](#1-live-in-session-visualization).
- 📋 **Dark mode** — deferred pending a semantic-token refactor (57 files / ~750 hardcoded color classes). See [Upcoming initiatives](#2-dark-mode).
- ⚠️ **Next.js security bump** — `next@15.1.0` has a published CVE; plan a patched upgrade.

**Later**
- Mobile app launch (device testing → store submission) + push notifications
- Animated "3Blue1Brown-feel" visualization breadth (Tier C)
- Manim async explainer library (Tier D)

---

## Feature registry

### Auth & accounts
| Feature | Status | Notes |
|---|---|---|
| Email/password signup + login (JWT cookie, 7-day) | ✅ | `lib/auth.ts` (jose) |
| Email verification (6-digit, hashed, 15-min, attempt cap) | ✅ | `EmailVerification`; unverified login blocked |
| OAuth (Google / GitHub) via NextAuth → role pick | ✅ | `auth/set-role`; auto-verified |
| Password reset | ✅ | `PasswordResetToken`, forgot/reset pages |
| Bearer-token auth (for mobile/native) | ✅ | additive to cookie; `auth/token` |
| Route protection middleware | ✅ | `middleware.ts` |

### Roles & access
| Feature | Status | Notes |
|---|---|---|
| STUDENT / TUTOR / PARENT roles | ✅ | PARENT fully active (web + API) |
| Public signup limited to STUDENT/PARENT | ✅ | enforced in `signupSchema` |
| TUTOR is invite-only (admin issues) | ✅ | `TutorInvite` → `/tutor/join` → redeem |
| Parent linking via invite code | ✅ | `ParentInvite`, tutor-issued → `/parent/join` |
| Super admin | ✅ | `lib/admin.ts` (isAdmin/isSuperAdmin) |

### Live sessions
| Feature | Status | Notes |
|---|---|---|
| Session lifecycle (schedule → active → completed) | ✅ | `tutoring-sessions/*` |
| Daily.co video (2-person, transcription) | ✅ | `VideoCall.tsx`, `lib/daily.ts` |
| Whiteboard with live sync (chunked >4KB) | ✅ | app-message channel |
| Tutor notes sidebar | ✅ | `NotesSidebar` |
| Student captured notes (handwriting OCR) | ✅ | `lib/ai/note-extractor.ts` |
| Live practice mid-session (practice / assessment) | ✅ | `live-practice`, `live-problem-generator.ts` |
| Live-practice grading + signed answers + override | ✅ | `live-practice/{answer,sign-answers,override}` |
| Session review page | ✅ | `session/[id]/review` |

### AI pipeline
| Feature | Status | Notes |
|---|---|---|
| Transcript fetch with retry | ✅ | `session-processing.ts` |
| Session analysis (summary/concepts/strengths/gaps/feedback) | ✅ | `session-analyzer.ts` (Claude) |
| Practice-set generation from gaps | ✅ | `practice-set-generator.ts` |
| Mastery update (EMA α=0.3 + concept coverage) | ✅ | `lib/progress.ts` |
| Multimodal analysis (whiteboard image) | ✅ | image block to Claude |
| Robust JSON extraction | ✅ | `parse-json.ts` (fence/prose/repair) |
| Insufficient-content guard (anti-hallucination) | ✅ | `hasMeaningfulContent` |
| Safe response-text extraction | ✅ | `firstText` — guards empty/non-text blocks |
| Retry analysis | ✅ | `retry-analysis` route |

### Practice & homework
| Feature | Status | Notes |
|---|---|---|
| AI practice sets (draft → tutor assigns) | ✅ | `PracticeSet` status flow |
| Practice workspace (progress bar, live score, celebration) | ✅ | `PracticeWorkspace` |
| Per-problem attempts | ✅ | `PracticeSetAttempt` |
| Answer checking + signed answer tokens | ✅ | `answer-check.ts`, `answer-token.ts` |
| Homework manager (tutor) | ✅ | `HomeworkManager` |

### Progress & mastery
| Feature | Status | Notes |
|---|---|---|
| Per-topic mastery (0–1) | ✅ | `StudentProgress` unique (student, topic) |
| Mastery time-series | ✅ | `MasteryHistory` (source: session/practice) |
| Overall mastery trend chart | ✅ | `buildOverallTrend`, `MasteryTrend` |
| Mastery snapshot chart | ✅ | `MasteryChart` |

### Student AI chat
| Feature | Status | Notes |
|---|---|---|
| SSE streaming chat | ✅ | `StudentChatPanel`, `useStream` |
| Per-user persistence (localStorage) | ✅ | survives refresh; "New chat" |
| Starter prompts | ✅ | showcase inline graphs |
| Inline visuals (plots / geometry) | ✅ | via `RichContent` + `visual-prompt` |

### Visualizations
| Feature | Status | Notes |
|---|---|---|
| Expression-driven interactive plots | ✅ | `FunctionPlot.tsx` + `math-eval.ts`; sliders, hover |
| Geometry / SVG figures (sanitized) | ✅ | `RichContent`, `SvgFigure`, `sanitizeSvg.ts` |
| AI emits viz specs | ✅ | `lib/ai/visual-prompt.ts` |
| Live tutor-triggered viz (push to student) | 📋 | Tier A — see below |
| AI-composed personalized viz on demand | 💡 | Tier B |
| Animated "3b1b-feel" (vectors, transforms) | 💡 | Tier C — evaluate Mafs / MathBox |
| Manim async explainer library | 💡 | Tier D — offline render worker, sandboxed |

### Marketing & lead capture
| Feature | Status | Notes |
|---|---|---|
| Public `/get-started` consultation page | ✅ | lead form → scheduler embed; `ConsultationRequest` |
| Consultation API (store + team notify + parent confirm) | ✅ | `api/consultation`, Resend emails |
| Embedded scheduler (Cal.com/Calendly) | ✅ | via `NEXT_PUBLIC_BOOKING_URL` (set to activate) |
| Landing + navbar + flyer point to `/get-started` | ✅ | `marketing/flyer.html` QR → `/get-started` |

### Parent experience
| Feature | Status | Notes |
|---|---|---|
| Parent dashboard (children list) | ✅ | `parent/children` |
| Child detail (mastery + session summaries) | ✅ | reuses `MasteryChart`, `SessionAnalysis` |
| Invite redemption | ✅ | `/parent/join` |
| Parent APIs with strict ownership guards | ✅ | children / progress / sessions |

### Admin & observability
| Feature | Status | Notes |
|---|---|---|
| Audit trail + viewer | ✅ | `AuditLog`, `admin/audit`, `/admin/logs` |
| System events / telemetry + viewer | ✅ | `SystemEvent`, `admin/events` |
| Metrics dashboard (AI calls, spend, latency) | ✅ | `admin/metrics`, `lib/metrics.ts` |
| Admin-issued tutor invites | ✅ | `admin/tutor-invites`, `/admin/tutors` |
| Health probe | ✅ | `/api/health` (commit, branch, db) |
| Skeleton loading (admin + session) | ✅ | matches parent/student pattern |

### Mobile (Expo / React Native)
| Feature | Status | Notes |
|---|---|---|
| Scaffolded app (login → children → child detail) | 🚧 | `mobile/`, parent-only gate |
| EAS publish config + icons/splash | 🚧 | placeholder art |
| Device testing, real icons, build/submit | ⏸️ | owner-driven (needs Apple/Google accounts) |
| Push notifications | 💡 | `ParentDevice` + expo-notifications |

### Infrastructure, testing & CI
| Feature | Status | Notes |
|---|---|---|
| Jest unit suite | ✅ | 144 tests; jsdom + RTL |
| Playwright E2E against live env | ✅ | `e2e/`, `playwright.config.ts` |
| Production smoke test | ✅ | `npm run smoke` (+ `--wait` readiness gate) |
| GitHub Actions CI (lint/tsc/jest) | ✅ | `.github/workflows/ci.yml` |
| Scheduled prod smoke + on-demand E2E | ✅ | `smoke.yml`, `e2e.yml` |
| Render deploy (migrate on start) | ✅ | `render.yaml` |

### Reliability & security
| Feature | Status | Notes |
|---|---|---|
| Rate limiting | ✅ | `lib/rate-limit.ts` |
| SVG sanitization | ✅ | `sanitizeSvg.ts` |
| Signed answer tokens (anti-cheat) | ✅ | `answer-token.ts` |
| Pre-commit race-condition review | ✅ | convention in `CLAUDE.md` |

### UX & design
| Feature | Status | Notes |
|---|---|---|
| Landing redesign + textured dashboards | ✅ | |
| Global UX polish (404/error, skeletons, responsive nav) | ✅ | |
| Accessibility passes (landmarks, labels, reduced-motion) | ✅ | |
| Dark mode | ⏸️ | needs semantic-token refactor — see below |

---

## Upcoming initiatives

### 1. Live in-session visualization
**Goal:** when a student is stuck, the tutor clicks and a personalized,
interactive visualization appears on both screens in real time.

**Why it's cheap:** the engine already exists — `FunctionPlot` (interactive,
slider-driven, safe `math-eval`), `RichContent` (declarative plot/geometry
renderer), `visual-prompt` (Claude already emits these specs), and a live
tutor↔student broadcast channel (Daily `sendAppMessage`, already used by the
whiteboard). This is mostly integration.

| Tier | Delivers | Effort (~1 eng) |
|---|---|---|
| **A. Tutor-triggered live viz** | Shared viz panel synced both ways; tutor picks/edits a spec, both nudge sliders | ~1–2 weeks |
| **B. AI-composed on demand** | "Visualize this" → Claude tailors a spec to the exact sticking point → renders live | +~1 week |
| **C. Animated 3b1b-feel** | Vectors, linear transforms, unit circle, Riemann sums | ~2–6 weeks, incremental (Mafs / MathBox) |
| **D. Manim (async, cinematic)** | Pre-rendered explainer clips, "review after class" | separate ops track — **not live**; needs sandboxing |

**Guardrails:** render a *constrained declarative spec* (plot JSON / whitelisted
geometry SVG); never execute arbitrary AI code client-side. Viz specs are tiny
JSON, so live sync needs no chunking.

**Recommendation:** build A+B now (~2–3 weeks); grow C by the concepts students
actually get stuck on; keep D as a separate async library, never the live path.

### 2. Dark mode
Deferred, not dropped. The app has ~750 hardcoded light-mode color classes
across 57 of 62 component files and zero `dark:` usage today. Doing it right
means a **semantic CSS-variable token refactor** (bg/surface/text/border) +
theme toggle + persistence — a dedicated effort, not a quick pass.

### 3. Mobile launch
App is scaffolded and publish-ready. Remaining is owner-driven: run on device,
real icon art, `eas init` + build/submit, Apple/Google store accounts. Push
notifications (`ParentDevice` + expo-notifications) follow launch.

---

## Known issues & tech debt
- ⚠️ **`next@15.1.0` has a published CVE** — plan a patched upgrade (surfaced by `npm install`).
- ⚠️ **GitHub Actions node-20 runner deprecation** — cosmetic annotation; bump `actions/*@v4` → `@v5` when convenient.
- ⚠️ **Component tests are class-string assertions** — brittle to restyles (already bit us once). Consider asserting behavior/roles over Tailwind classes.

---

## Changelog
Newest first. Keep to shipped, user- or dev-facing changes.

- **2026-08-06** — Public `/get-started` consultation page: parent lead form → embedded Cal.com/Calendly scheduler; leads stored (`ConsultationRequest`), team notified, parent auto-confirmed. Landing, navbar, and the printable flyer now point here.
- **2026-08** — AI-pipeline hardening (`firstText`) + AI-layer test coverage; admin/session skeletons; CI (lint/tsc/jest), Playwright E2E against live, `npm run smoke` with health-readiness gate.
- **2026-07** — Whiteboard chunked sync (mid-lesson desync fix); `/api/health` probe; live-session/grading/review hardening; email verification on signup.
- Earlier initiative history (admin logging, parent support, mobile scaffold, progress-over-time, chat/practice upgrades, interactive plots) is detailed in [`roadmap.md`](./roadmap.md).

---

## Data model reference
`User` ↔ one-to-one `StudentProfile` / `TutorProfile` / `ParentProfile`.
`TutorStudent` (roster junction) · `TutoringSession` → `Transcript`,
`SessionAnalysis`, many `PracticeSet` → `PracticeSetAttempt`.
`StudentProgress` (per student+topic) · `MasteryHistory` (time-series).
Access/ops: `AuditLog`, `SystemEvent`, `TutorInvite`, `ParentInvite`,
`EmailVerification`, `PasswordResetToken`. (Full schema: `prisma/schema.prisma`.)
