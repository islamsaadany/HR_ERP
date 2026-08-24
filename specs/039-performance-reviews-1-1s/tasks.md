---
description: "Task list for spec 039 — Performance Reviews & 1:1s"
---

# Tasks: Performance Reviews & 1:1s

**Input**: Design documents from `/specs/039-performance-reviews-1-1s/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/server-interface.md](./contracts/server-interface.md),
[quickstart.md](./quickstart.md)

**Tests**: No test tasks. Per Principle V there is no testing regime here — protection is structural
(one derivation per rule, guards on every path). The two privacy behaviours that must be *proved* are
verified by hand against a throwaway Postgres per [quickstart.md](./quickstart.md); those checks are
tasks T059–T061, not a test suite.

**Organization**: Grouped by user story so each is independently deliverable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this serves (US1–US5)

---

## Phase 1: Setup

**Purpose**: Dependencies and the release switch.

- [ ] T001 Add `unpdf` to dependencies in `package.json` (verified in Phase 0 against both sample Gallup reports; Node runtime only — never Edge)
- [ ] T002 Add `{ key: "reviews", label: "Reviews & 1:1s", href: "/reviews" }` to `MODULES` in `src/lib/modules.ts` so the module has a release switch like every other
- [ ] T003 Snapshot the sidebar/nav component into `ui-versions/<component>/2026-08-24_before-reviews-module.tsx` **before** editing it (Principle II — mandatory for every existing UI file touched)

---

## Phase 2: Foundational (blocks every user story)

**Purpose**: The schema and the rules. Nothing renders until these are right.

**⚠️ CRITICAL**: T008 is the single most important task in this feature. Every other guard depends on it.

### Schema

- [ ] T004 Add 8 models and 4 enums to `prisma/schema.prisma` per [data-model.md](./data-model.md): `ReviewSheet`, `ReviewSheetItem`, `ReviewOutcome`, `JournalEntry`, `OneOnOne`, `OneOnOneNote`, `StrengthsTheme`, `StrengthsProfile`, `StrengthsProfileTheme`; enums `ReviewJournalSection`, `ReviewItemSource`, `StrengthsDomain`, `StrengthsProfileSource`
- [ ] T005 Write `prisma/sql/067_performance_reviews.sql` — **idempotent** (`CREATE TABLE IF NOT EXISTS`, `DO $$` guards for enums/indexes), including the **partial unique index** on `ReviewSheetItem (sheetId, authorId, questionKey, sourceKind, sourceId) WHERE sourceId IS NOT NULL`, and the 34 `StrengthsTheme` rows as an idempotent upsert. Commit in the **same commit** as T004
- [ ] T006 Add the 34 CliftonStrengths themes to `prisma/seed.ts` (code, name, domain, sortOrder) so a fresh local database matches a migrated one
- [ ] T007 Apply `067` twice to a throwaway Postgres and confirm it is a clean no-op the second time; confirm 34 theme rows and the exact spelling of `Self-Assurance`

### The rules — one derivation each

- [ ] T008 Create `src/lib/reviews/access.ts` with `requireRealUser()` — resolves the **auth session user only**, never the impersonation cookie, and refuses while impersonating (research R1). This is the module's single entry point
- [ ] T009 Add to `src/lib/reviews/access.ts`: `sheetForRead`, `oneOnOneForRead` (authorised against the **stored** pair, never the live org chart — research R2), `isOpen`, `myHalf`, `canEditHalf`, `visibleItemsWhere` (scopes the **query**, so a sealed half never reaches the client)
- [ ] T010 [P] Create `src/lib/reviews/quarters.ts` — `quarterOf(date)`, `quarterRange(year, quarter)`, `previousQuarter(year, quarter)`. Calendar quarters; no cycle table (research R4)
- [ ] T011 [P] Create `src/lib/reviews/agenda.ts` — THE question registry (key, section, prompt text, which half authors it, whether it is a strengths picker), following the `campaign-fields.ts` precedent. Wording is the supplied template with "this year" → "this period" (FR-010)
- [ ] T012 [P] Create `src/lib/reviews/gallup.ts` — the fixed 34-theme vocabulary and `parseGallupReport(bytes)`: page 1 only, numbered rank lines, resolve against the vocabulary, stop at the first gap; also return `printedName` and `assessmentDate` from the footer. Returns a failure result rather than throwing (FR-027)
- [ ] T013 Extend `src/lib/workdays.ts` / `src/lib/leave-queries.ts` with a **quarter-range** taken count that reuses `countWorkingDays` and the existing holiday set — never a second counter (research R6)
- [ ] T014 Create `src/lib/reviews/pack.ts` — the system pack (working days taken, onboarding status while in progress, learning activity) built from the existing derivations. Facts only: no score, rating, or comparison (FR-037)

### Shell

- [ ] T015 Create `src/app/(app)/reviews/layout.tsx` (or a shared guard) that calls `requireRealUser()` and renders the impersonation refusal explanation instead of any data when impersonating
- [ ] T016 Add the sidebar/nav entry for Reviews & 1:1s, honouring `getDisabledHrefs()` (snapshot taken in T003)

**Checkpoint**: `requireUser` appears nowhere under `src/app/(app)/reviews`, `src/lib/reviews`, or `src/app/api/reviews`.

---

## Phase 3: User Story 1 — The quarterly review sheet (P1) 🎯 MVP

**Goal**: A pair completes a full quarter review on the platform and opens the next quarter carrying
their agreed priorities forward.

**Independent test**: Two accounts fill their halves, submit, both confirm the meeting, watch both
halves open and lock, agree an outcome, and see it on the next quarter's sheet.

- [ ] T017 [US1] Create `src/app/(app)/reviews/page.tsx` — your own review plus the reviews you hold as a manager, derived from the current org chart. No completion percentage and no chaser (FR-032)
- [ ] T018 [US1] Create `src/app/(app)/reviews/actions.ts` with `openSheetForQuarter` — creates the sheet if absent, refuses unless the two are manager↔report **today**, then **stores** the pair
- [ ] T019 [US1] Create `src/app/(app)/reviews/[sheetId]/page.tsx` — loads the sheet through `sheetForRead`, items through `visibleItemsWhere`, and renders the four-step progress bar
- [ ] T020 [P] [US1] Build the sealed-half panel component in `src/components/reviews/` — a plain padlock card. No preview, no summary, no word count, no per-question completion state (FR-008)
- [ ] T021 [US1] Add `saveItem` / `deleteItem` to `src/app/(app)/reviews/actions.ts` — author is always the caller (never from input); refused once `openedAt` is set
- [ ] T022 [US1] Add `submitHalf` — stamps my `…SubmittedAt` and **opens nothing**
- [ ] T023 [US1] Add `confirmMeetingHeld` — stamps my `…MetConfirmedAt` and, when all four timestamps are present, stamps `openedAt` **in the same transaction under a `SELECT … FOR UPDATE` row lock** on the sheet, so two simultaneous confirmations cannot both read "not yet complete" and leave it sealed
- [ ] T024 [US1] Render the open state: both halves side by side, both read-only, locked-date chip on each
- [ ] T025 [US1] Add `writeOutcome` — refused unless `openedAt` is set (FR-009a); editing **clears both acknowledgements**
- [ ] T026 [US1] Add `acknowledgeOutcome` — stamps my ack and stamps `finalAt` when both are present
- [ ] T027 [US1] Render the carry-forward band at the top of the sheet from the previous quarter's `finalAt`-stamped outcome via `previousQuarter`. A non-final outcome never carries
- [ ] T028 [US1] Handle US1 edge cases: employee with no manager (no sheet, journal only); a manager with several reports (one sheet each); the reporting line changing mid-quarter (a second sheet for the new pair; the old one stays with the old pair); a party who has left (sheet stays readable to the remaining party)

**Checkpoint**: US1 is a usable MVP on its own.

---

## Phase 4: User Story 2 — The private running journal (P2)

**Goal**: Capture entries across the quarter and pull chosen ones onto the sheet.

**Independent test**: Write entries over a quarter, promote some, confirm the rest are invisible to everyone else.

- [ ] T029 [P] [US2] Create `src/app/(app)/reviews/journal/page.tsx` — dated entries with optional section tags. Every read is `where: { authorId: me.id }`
- [ ] T030 [US2] Create `src/app/(app)/reviews/journal/actions.ts` — `addJournalEntry`, `editJournalEntry`, `deleteJournalEntry`, each scoped `where: { id, authorId: me.id }` (never `findUnique` then compare)
- [ ] T031 [US2] Add `promoteJournalEntry` to `src/app/(app)/reviews/actions.ts` — **copies** `body`, sets `sourceKind=JOURNAL` and `sourceId`; idempotent via the partial unique index
- [ ] T032 [US2] Show promoted-entry provenance on the sheet and an "already on your Q_ sheet" state in the journal list
- [ ] T033 [US2] Confirm by inspection that no action, route, page, or export accepts another user's id for a journal read (FR-016)

---

## Phase 5: User Story 3 — 1:1 records (P3)

**Goal**: Hold a 1:1 any time, agree its outcome, and bring it to the quarterly review.

**Independent test**: A pair holds a 1:1 outside any cycle, both acknowledge, and it is offered on their next sheet.

- [ ] T034 [P] [US3] Create `src/app/(app)/reviews/one-on-ones/page.tsx` and `[id]/page.tsx` — notes from both parties, nothing sealed
- [ ] T035 [US3] Create `src/app/(app)/reviews/one-on-ones/actions.ts` — `createOneOnOne` (refuses unless manager↔report today, then stores the pair — FR-019), `addOneOnOneNote`
- [ ] T036 [US3] Add `writeOneOnOneOutcome` (editing clears both acks) and `acknowledgeOneOnOne` (stamps `finalAt` when both present; record becomes read-only)
- [ ] T037 [US3] Add `promoteOneOnOneOutcome` to the sheet actions — only final 1:1s belonging to the caller's pair; one item **per half**, so both parties promoting the same outcome get one each
- [ ] T038 [US3] Offer the quarter's 1:1 outcomes beside the sheet; none appear on the sheet unless promoted (FR-022)

---

## Phase 6: User Story 4 — Gallup strengths (P4)

**Goal**: An employee's own themes power the two strengths questions.

**Independent test**: Upload both report formats, confirm the themes, see them offered on that person's sheet.

- [ ] T039 [P] [US4] Build the strengths panel on `src/app/(app)/admin/employees/[id]/` — dropzone, then proposal, then confirm
- [ ] T040 [US4] Add `parseStrengthsUpload` (admin action) — uploads to the **private** Vercel Blob store, calls `parseGallupReport`, returns `{ themes, printedName, assessmentDate, warnings }`. **Writes nothing** to the profile (FR-026)
- [ ] T041 [US4] Render the confirmation banner showing the name and assessment date **printed in the report**, shown for a human to check and never used to match an employee automatically (FR-028)
- [ ] T042 [US4] Add `confirmStrengthsProfile` — the only path that persists a profile; replaces the theme rows; records `confirmedById`/`confirmedAt`
- [ ] T043 [US4] Add manual entry / reorder, and route a failed parse straight into it with a plain one-line explanation (FR-027). An unresolved rank is reported as a gap, never guessed
- [ ] T044 [US4] Add `clearStrengthsProfile`; confirm past `ReviewSheetItem`s are untouched because they store the theme **name as text** (FR-030)
- [ ] T045 [US4] Create `src/app/api/reviews/strengths/[profileId]/route.ts` — `streamPrivateBlob`, allowed for the profile's own employee and HR/Super User, **404 (not 403)** for everyone else, permission re-asked on every request (FR-035, research R7)
- [ ] T046 [US4] Add `setStrengthsPicks` to the sheet actions — codes must exist in the **caller's own** profile; stores the theme **name** as `body`; free text when the caller has no profile (FR-029)
- [ ] T047 [US4] Render the strengths picker on the sheet from the caller's own themes

---

## Phase 7: User Story 5 — The system pack (P5)

**Goal**: Both parties start the conversation from the same picture.

**Independent test**: Open a sheet and see this quarter's facts without either party typing them.

- [ ] T048 [P] [US5] Render the pack on the reviews home and on the sheet from `src/lib/reviews/pack.ts` — plain tiles
- [ ] T049 [US5] Confirm the pack shows facts only — no score, rating, ranking, or comparison (FR-037)
- [ ] T050 [US5] Verify the pack's working-days figure matches what Time-Off reports for the same dates; a mismatch means a second counter was written (research R6)

---

## Phase 8: Polish & Cross-Cutting

- [ ] T051 [P] Confirm every date **displays** as dd/mm/yyyy via `formatDate` (house standard, spec 029/033) — screens and any export
- [ ] T052 [P] Empty and edge states everywhere: no manager, no reports, no journal entries, no 1:1s, no strengths profile, first-ever quarter (no carry-forward), a party who has left
- [ ] T053 [P] Error copy for every refusal in the contract table — not one of the pair (not found), impersonating, writing to a frozen sheet, confirming before both submitted, a 1:1 with a non-pair, a strengths pick outside the caller's profile
- [ ] T054 Keep the reviews home fresh with the existing `AutoRefresh` pattern — it is a page people sit on waiting for a counterpart to submit or confirm
- [ ] T055 Accessibility pass on the sheet: the error banner gets `role="alert"`, `tabIndex={-1}`, and scroll-into-view + focus; every fault reported at once (house rule, 2026-08-20)
- [ ] T056 [P] Snapshot every UI file changed into `ui-versions/` and confirm the built screens match the approved mockup `design-mockups/reviews/2026-08-24_reviews-and-1-1s.html`
- [ ] T057 Update `PROJECT_DETAILS.md`, `IMPLEMENTATION_PROGRESS.md`, `IMPLEMENTATION_PLAN.md` and `CLAUDE.md` in the **same commit** as the implementation (Principle IV)
- [ ] T058 `npx tsc --noEmit` and `npm run build` clean

### Verification against a throwaway Postgres (quickstart)

- [ ] T059 Quickstart A + B — the seal holds at each of the four steps, opens and freezes only at the fourth, and a quarter with no meeting produces nothing at all
- [ ] T060 Quickstart C — direct retrieval as Super User, **Super User impersonating**, HR Admin, an unrelated employee, and a **new** manager all fail; the previous manager still reads their own sheet. Plus `grep -rn "requireUser" src/app/\(app\)/reviews src/lib/reviews src/app/api/reviews` returns nothing
- [ ] T061 Quickstart D + E + G — promotion copies rather than links; both Gallup formats parse from one code path and a non-Gallup PDF falls back to manual entry; no money term appears anywhere in the module
- [ ] T062 Report the deploy's `[apply-sql]` result for `067` in one line, and state plainly what was verified here versus what cannot be tested from a session (the live Neon database)

---

## Dependencies

```
Phase 1 (Setup)
   ↓
Phase 2 (Foundational)  ← T008 blocks everything; T004–T007 block all data work
   ↓
Phase 3 · US1  ── MVP, deliverable alone
   ↓
Phase 4 · US2 ─┐  (journal promotion needs US1's sheet)
Phase 5 · US3 ─┤  (1:1 promotion needs US1's sheet)
Phase 6 · US4 ─┤  (strengths picker needs US1's sheet; the profile half is independent)
Phase 7 · US5 ─┘  (pack renders on US1's sheet)
   ↓
Phase 8 (Polish + verification)
```

US2–US5 do not depend on each other and can be built in any order once US1 exists.

## Parallel opportunities

- **Phase 2**: T010, T011, T012 are three independent files — parallel. T013/T014 follow.
- **Phase 3**: T020 (sealed panel component) parallel with the action work.
- **Phase 6**: T039 (panel UI) parallel with T040–T044 (the actions), since the profile side is independent of the sheet picker.
- **Phase 8**: T051, T052, T053, T056 are independent sweeps.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That alone replaces the write-it-the-night-before habit:
a pair can complete a full quarter on the platform, and next quarter opens with what they agreed.

Then add in value order: **US2** (the journal — what makes the review honest), **US3** (1:1s — what
stops the quarter being the only moment anything gets resolved), **US4** (strengths), **US5** (the pack).

Ship nothing before the Phase 8 verification tasks pass. A mistake in the seal or the impersonation
refusal is a broken privacy promise, not a bug.
