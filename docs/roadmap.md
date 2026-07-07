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
  role, member-since, and role-specific fields (grade/goals, expertise/bio);
  edit via `/api/profile` (PATCH). Lossless role switching via
  `/api/profile/role` (keeps profiles, re-issues JWT). Super admin codified in
  `lib/admin.ts` (isAdmin/isSuperAdmin); `requireAdmin` uses it. Admin links
  surface in settings.
- **Phase 4 — Mobile app**: Expo app on shared APIs (SecureStore JWT), React
  Query, `ParentDevice` push tokens. ← _next_
- **Phase 5 — Push + stores**: notification triggers, EAS build, store submission.

## Future phase — Dynamic / cinematic visualizations (parked)

Two complementary layers beyond the current inline visuals:

1. **Web-native interactive plots (real-time, in-session):** expression-driven,
   client-side function evaluation (in-house safe parser), hover coordinates,
   parameter sliders, auto-annotation (roots/vertex/asymptotes), reliable
   geometry primitives. This is the primary differentiator — instant + interactive.
2. **Manim (3Blue1Brown engine) explainer videos (async, pre-rendered):**
   Manim is Python, an offline batch renderer → MP4 (needs FFmpeg/Cairo/Pango/
   LaTeX), not real-time and not a browser lib. Fit: a **separate Python render
   worker** behind a job queue, output to object storage/CDN, played async.
   Start with a **curated pre-rendered concept library** (no AI-generated code
   execution). Any dynamic AI-generated Manim code must run **sandboxed**
   (isolated container, no network, CPU/time limits) — arbitrary code execution
   risk. Treat as its own ops-aware phase after the parent/mobile work.
