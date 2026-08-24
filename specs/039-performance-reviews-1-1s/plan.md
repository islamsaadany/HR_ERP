# Implementation Plan: Performance Reviews & 1:1s

**Branch**: `claude/team-log-reviews-1-1s-t0dugz` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/039-performance-reviews-1-1s/spec.md`

---

## Summary

A quarterly review that is filled across the quarter instead of the night before, and stays private to
the two people having the conversation.

Four objects — a private journal, ad-hoc 1:1s with an outcome both parties acknowledge, a two-halved
quarterly sheet on the supplied agenda, and an agreed outcome that carries into the next quarter.
Quarters are derived from the calendar, so the module has **no operator and no admin screen**. Both
halves stay sealed until both parties submit *and both* confirm they met; a quarter with no meeting
opens nothing and carries nothing forward.

Two findings from Phase 0 shape the build more than anything in the spec:

1. **`requireUser()` cannot be used here.** It deliberately returns the impersonation target for a
   Super User "viewing as" an employee — which would hand them another person's private journal. This
   module resolves the **real** session user through `requireRealUser()` and refuses to operate while
   impersonating (research R1).
2. **Access is authorised against the pair stored on the record**, not the live org chart — the exact
   opposite of the Time-Off approval rule, and deliberately so (research R2, and Complexity Tracking
   below).

---

## Technical Context

**Language/Version**: TypeScript 5 · Next.js 15 (App Router) · React 19

**Primary Dependencies**: Prisma · NextAuth v5 (Credentials) · Tailwind · Zod · `@vercel/blob` ·
**`unpdf`** (new — Gallup PDF text extraction, verified on both sample reports; research R5)

**Storage**: PostgreSQL (Neon). New tables per [data-model.md](./data-model.md); migration
`prisma/sql/067_performance_reviews.sql`, idempotent, committed with the schema change.
Uploaded Gallup PDFs go to the **private** Vercel Blob store.

**Testing**: No testing regime, per Principle V. `npx tsc --noEmit` and `npm run build` are the gate.
The seal and the impersonation refusal are verified by hand against a throwaway Postgres per
[quickstart.md](./quickstart.md) — those two are worth proving because a mistake in either is a
privacy failure, not a bug.

**Target Platform**: Vercel (Node runtime — the PDF parse route must not run on Edge)

**Project Type**: Web application (Next.js App Router; server components + server actions)

**Performance Goals**: Ordinary page loads. The only non-trivial work is a one-off PDF parse per
employee, which runs on upload and never in a render path.

**Constraints**:
- A sealed half must never reach the client — the **query** is scoped, not the render (research R3).
- No email, no cron, no notification of any kind in this feature.
- No monetary value on any surface (FR-034).
- Node runtime required for `unpdf`.

**Scale/Scope**: One company (tens of employees). ~4 sheets per pair per year. Roughly 5 new pages,
~20 server actions, 1 serving route, 8 new tables.

---

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | How this plan satisfies it |
|---|---|---|
| **I · Align Before Building** | **PASS** | Spec 039 agreed clause by clause; the seal rule was corrected by the requester after a rejected first version, and the correction is recorded in the spec, the checklist, and the agreed-input file. |
| **II · UI Changes Require Explicit Approval** | ⚠ **BLOCKING GATE — not yet satisfied** | All-new surfaces. **MOCKUP-FIRST is non-negotiable**: static navy/gold HTML mockups under `design-mockups/reviews/2026-08-24_*.html`, published as an Artifact, **approved before any component is written**. Editing the sidebar/nav to add the module is an edit to an existing file → `ui-versions/` snapshot required first. |
| **III · Benefits Money Server-Authoritative** | **PASS (by exclusion)** | This feature touches no benefits, payroll, or monetary record. FR-034 forbids money on the surface; data-model.md states no money column and no benefits relation. No existing money rule is affected. |
| **IV · Spec-Driven, Docs Move With Code** | **PASS** | Spec, research, data model, contracts, quickstart written before code. `PROJECT_DETAILS.md`, `IMPLEMENTATION_PROGRESS.md`, `IMPLEMENTATION_PLAN.md` and `CLAUDE.md` updated in the same commit as the implementation. |
| **V · Engineered Enough, Explicit Over Clever** | **PASS** | One derivation per rule — `access.ts` for who may read, `isOpen()` for visible-and-frozen, `quarters.ts` for the calendar, `agenda.ts` for the questions. Edge cases enumerated in the spec and carried into quickstart. |
| **Migrations are Claude's job** | **PASS** | `067_performance_reviews.sql`, idempotent, same commit; applied by the deploy-time runner; `[apply-sql]` lines checked and the result reported in one line. |
| **Email limited to two workflows** | **PASS** | No email. A reminder would in any case reintroduce the overseer this design excludes. |
| **Scheduled work** | **PASS** | No cron. Quarters are derived, not seeded (research R4). |
| **Roles** | **PASS** | No new `Role` member. The pair derives from the org chart, exactly as the `manager` capability already does — and per the house rule, per-module authority is never a new role. |
| **Secrets / PII** | **PASS** | Gallup PDFs go to the private blob store, served through an authorising route answering 404. No sample PDF is committed to git. |

**Post-design re-check**: unchanged. Principle II remains the one open gate and blocks implementation,
not planning.

---

## Project Structure

### Documentation (this feature)

```text
specs/039-performance-reviews-1-1s/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0 — 7 decisions, 2 of them load-bearing
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── server-interface.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks — NOT created by this command
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (app)/
│   │   ├── reviews/
│   │   │   ├── page.tsx                 # My reviews: as report + as manager
│   │   │   ├── actions.ts               # sheet, outcome, promotion actions
│   │   │   ├── [sheetId]/page.tsx       # The two-halved sheet
│   │   │   ├── journal/
│   │   │   │   ├── page.tsx             # Private journal
│   │   │   │   └── actions.ts
│   │   │   └── one-on-ones/
│   │   │       ├── page.tsx
│   │   │       ├── [id]/page.tsx
│   │   │       └── actions.ts
│   │   └── admin/employees/[id]/        # + strengths panel (upload → confirm)
│   └── api/reviews/strengths/[profileId]/route.ts   # 404-not-403 PDF serving
├── lib/
│   └── reviews/
│       ├── access.ts       # requireRealUser, sheetForRead, isOpen, visibleItemsWhere
│       ├── quarters.ts     # quarterOf, quarterRange, previousQuarter
│       ├── agenda.ts       # THE question registry (keys, sections, which half, strengths pickers)
│       ├── gallup.ts       # 34-theme vocabulary + parseGallupReport
│       └── pack.ts         # the system pack, built from existing derivations
├── components/reviews/     # after mockup approval, not before
└── lib/workdays.ts         # extended with a quarter range (not a second counter)

prisma/
├── schema.prisma           # 8 new models, 4 new enums
├── seed.ts                 # 34 StrengthsTheme rows
└── sql/067_performance_reviews.sql
```

**Structure Decision**: Standard module layout, matching `time-off` and `learning`: a route folder
under `src/app/(app)/` with colocated `actions.ts`, and the rules in `src/lib/<module>/`. The one
deviation worth noting is that this module's `lib` folder carries an **access** file, which most
modules do not need — because most modules can rely on `requireUser()` and this one must not.

Add `{ key: "reviews", label: "Reviews & 1:1s", href: "/reviews" }` to `MODULES` in
`src/lib/modules.ts` so the module has a release switch like every other.

---

## Build order

1. **Mockups + approval** (Principle II gate — blocks everything below).
2. Schema + migration `067` + 34-theme seed; verified against a throwaway Postgres.
3. `lib/reviews/*` — access, quarters, agenda, gallup, pack. The rules before any screen.
4. Journal (smallest surface, exercises `requireRealUser`).
5. Review sheet: halves → submit → both-confirm → open/freeze → outcome → carry-forward.
6. 1:1s and promotion into the sheet.
7. Strengths: upload → parse → confirm → picker on the sheet.
8. System pack.
9. Steering-doc updates; `tsc` + `build`; report the `[apply-sql]` result in one line.

---

## Complexity Tracking

> Two deliberate departures from established house patterns. Both are recorded so a later session does
> not "fix" them back.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **A second user-resolution helper (`requireRealUser`) alongside `requireUser`** | `requireUser()` honours impersonation by design, so a Super User viewing as an employee would read that person's private journal — the one thing FR-016 promises nobody can read. | *Reusing `requireUser()` and filtering* was rejected: it makes the privacy promise depend on remembering the exclusion in every future query, which is precisely the failure mode the pool-ceiling incident taught us to design out. |
| **Access authorised against the pair stored on the record, not the live org chart** | FR-033: a new manager must not inherit access to reviews written with a previous one. These are records of a conversation between two named people. | *Resolving against the current chart* (the settled Time-Off rule, `pendingApprovalWhere` / `canDecideLeave`) is correct there — a leave request must reach whoever can approve it **today** — and wrong here, where it would hand a new manager the previous manager's conversations. |
