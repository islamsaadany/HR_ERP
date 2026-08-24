---

description: "Task list for spec 039 — Team Communications"
---

# Tasks: Team Communications

**Input**: Design documents from `/specs/039-team-communications/`

**Prerequisites**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [contracts/server-actions.md](./contracts/server-actions.md) · [quickstart.md](./quickstart.md)

**Tests**: This project has **no testing regime** (constitution V). Test tasks appear here only for
**pure functions** — the contrast rule and the occasion arithmetic — where they are cheap, exact,
and the thing they protect is a rule that will otherwise be re-derived wrongly later. Everything
with a database behind it is proved by `scripts/verify-communications.mts`, as every recent feature
here has been.

**Organization**: grouped by user story so each is independently shippable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable — different files, no dependency on an incomplete task
- **[Story]**: which user story (US1–US4); Setup, Foundational and Polish carry none

---

## ⛔ Gates — do not pass without these

Three things are **not** decided and must not be assumed by whoever implements this.

- [ ] **G1** Product owner approves the **constitution change** from "email is limited to two
      workflows" to three. Recorded in [plan.md](./plan.md) as a formal deviation. **The code must
      not ship while the governing document says two** — run `/speckit-constitution` in the same
      change as T090.
- [ ] **G2** Product owner approves a **mockup of the manager's pending-drafts screen and the
      sidebar count** (US2). These are new UI; constitution II requires a static HTML mockup and
      explicit sign-off before any component is written. Nothing in Phase 5 starts until this is done.
- [ ] **G3** Confirm each **business unit's real brand colour** is set on its record in
      Admin → Brand. The email reads `primaryColor` from there. Visual Shift is `#450059`; if the
      record does not carry it, emails will be branded with whatever it does carry. This is data
      entry, not code, and it can be done any time before the first send.

---

## Phase 1: Setup

**Purpose**: schema and migration, so everything downstream has something to build on.

- [ ] T001 Add `MessageKind`, `MessageState`, `DeliveryState` enums and the `Message`, `MessageRecipient`, `MessageAudience`, `Occasion` models to `prisma/schema.prisma` per [data-model.md](./data-model.md). Add `congratsLeadDays Int @default(3)` to `NotificationSettings`. Add back-relations to `User` and `BusinessUnit` — **no new column on `User`**
- [ ] T002 Write `prisma/sql/067_team_communications.sql` — additive and idempotent (enum creation guarded by a catalogue check, tables `IF NOT EXISTS`, column `ADD COLUMN IF NOT EXISTS`), in the **same commit** as T001
- [ ] T003 Verify the migration per [quickstart.md](./quickstart.md) Scenario 1: build the pre-feature schema on a throwaway Postgres, apply `067` **twice**, then `prisma migrate diff` against `schema.prisma` and confirm no difference beyond the house `updatedAt` lines documented in `060`

---

## Phase 2: Foundational (blocks every user story)

**Purpose**: the shared derivations. Everything after this reads them; nothing here re-decides
anything.

### The audience extraction (research D3)

- [ ] T010 Snapshot `src/components/learning/AccessSetup.tsx` to `ui-versions/AccessSetup/2026-08-24_before-extraction.tsx` **before touching it** (constitution II)
- [ ] T011 Create `src/lib/audience/types.ts` — `AudienceField`, `AudienceChoice`, moved verbatim from `src/lib/learning/access-actions.ts` with the Learning-specific naming dropped
- [ ] T012 Create `src/lib/audience/rules.ts` — move `audienceWhere`, `subjectMatchesAudience`, `bandStartDateRange` and the per-choice counting out of `src/lib/learning/audience.ts` and `queries.ts`. **Behaviour must not change**: a rule that matches nothing still returns `null` (never a widened `where`), and a tenure band still compiles to a **start-date range**, never the stored `tenureBand` column
- [ ] T013 Reduce `src/lib/learning/audience.ts` to a thin re-export of `src/lib/audience/rules.ts`
- [ ] T014 Move the picker component to `src/components/audience/AudiencePicker.tsx`, parameterised by which fields it offers; update the Learning import
- [ ] T015 Run the existing Learning verification (`scripts/verify-course-access.mts`, 17/17) and `npm test` (105/105) against a throwaway Postgres to prove the extraction changed **nothing** in Learning. A refactor that breaks a shipped module is not a refactor

### The pure rules

- [ ] T016 [P] Create `src/lib/comms/brand.ts` — `inkFor(brandHex)` returning `{ background, ink, adjusted }`. Try white **and** dark against the brand; return the brand **unchanged** whenever either reaches 4.5:1; nudge toward the closer end in small steps only when neither does (research D5). The naive single-threshold rule is wrong — do not reintroduce it
- [ ] T017 [P] Write `tests/comms-brand.test.ts` — the six measured colours from research D5 with their expected inks and ratios, **plus** the properties: every output ≥ 4.5:1, the brand untouched whenever either ink clears, and a sweep of several hundred colours producing no failure and no adjustment above ~15%
- [ ] T018 [P] Create `src/lib/comms/occasions.ts` — `occasionsInWindow(users, from, to)` returning birthdays and anniversaries. Anniversary carries `years`; **a birthday carries `years: null`** — the model refuses to hold an age. A 29 February birthday is observed on 28 February in non-leap years. Leavers and people with no date produce nothing
- [ ] T019 [P] Write `tests/comms-occasions.test.ts` per [quickstart.md](./quickstart.md) Scenario 3

### The email builder (research D7, D8)

- [ ] T020 Create `src/lib/comms/render.ts` — `renderMessage(input)` returning `{ html, text }`. **The only place email HTML is built.** Tables for layout, every style inline, colours literal, no `<style>` block, no `var()`, no `data:` image, `color-scheme: light` declared. Header: group name small above the unit name large, unit colour behind both with ink from `brand.ts`, group hairline under it. Body black on white always. Button in the unit's colour with derived ink. Paragraphs split on blank lines
- [ ] T021 Extend `src/lib/email/client.ts` with `sendBatch(messages)` — chunk at 100, return a per-message result carrying the provider id or the error (research D1). Keep the existing single-send path untouched
- [ ] T022 Add `deliveryReadiness()` to `src/lib/comms/settings.ts` — call `domains.list`, return **ready** · **ready for you only** · **key refused** · **could not check**. Match a refused key on the **message as well as the status** — Resend answers an invalid key with 400, not 401, and mislabelling it as an unverified domain sends an operator to fix DNS for a week (research D2)
- [ ] T023 Snapshot then edit `src/lib/email/templates.ts`: change the header eyebrow from `#a8821e` (4.33:1) to `#c9a227` (6.40:1) — FR-042, research D11

---

## Phase 3: User Story 1 — HR sends an announcement (P1) 🎯 MVP

**Goal**: write once, choose who, see the count, preview, send.

**Independent test**: write an announcement, select one department, confirm the count matches that
department's active headcount, preview, send, and verify each recipient got their own copy branded
with their own unit.

- [ ] T030 [US1] Create `src/app/(app)/admin/communications/actions.ts` with `requireCommsSender()`, and `createAnnouncement` / `updateAnnouncement` (DRAFT only — a sent message is a record)
- [ ] T031 [US1] Add `setAnnouncementAudience` / `removeAudienceChoice` per [contracts](./contracts/server-actions.md) — several values per call, **every fault reported together**, and deliberately not all-or-nothing so one stale name cannot throw away the other seven choices
- [ ] T032 [US1] Add `audienceReachByChoice` to `src/lib/comms/` as a **plain function, not a `"use server"` export** — spec 038's `audienceReach` was an unguarded public endpoint. Count **per choice** through the same derivation the send uses
- [ ] T033 [US1] Implement `sendAnnouncement` with all four guards from the contract: state re-read **inside** the transaction; `confirmedCount` must still equal the server's count; empty audience refused with a reason; email-off refused plainly. Expand → one `MessageRecipient` per person (PENDING) → `sendBatch` → stamp ACCEPTED/FAILED → set SENT, `sentById`, `sentAt`, `recipientCount`. **A partial failure is still a send** — do not roll back on the people who received it
- [ ] T034 [P] [US1] Create `src/app/api/admin/communications/preview/route.ts` — renders through `renderMessage`, never a re-implementation (research D8)
- [ ] T035 [US1] Create `src/app/(app)/admin/communications/page.tsx` — the message list and a compose form, in the existing admin idiom
- [ ] T036 [US1] Create `src/app/(app)/admin/communications/[id]/page.tsx` — edit, the audience picker from `src/components/audience/`, the live total, and the preview in an `<iframe srcdoc>`
- [ ] T037 [US1] Create `src/components/comms/SendConfirm.tsx` — names the count and passes it as `confirmedCount`. The one irreversible action in the feature gets a dialog, not a button
- [ ] T038 [P] [US1] Snapshot then add a Communications card to `src/app/(app)/admin/page.tsx`

**Checkpoint**: US1 alone is a shippable product — HR can announce things to chosen people.

---

## Phase 4: User Story 3 — prove email works (P3, but build it here)

**Goal**: know the design, sender and delivery are right before the first real send.

**Why out of priority order**: it is small, and it protects US1. Shipping a broadcast feature
without a way to test it first is how the first announcement goes wrong in public.

**Independent test**: open the setup page, read the readiness statement, send yourself a test,
compare against the preview.

- [ ] T040 [US3] Create `src/app/(app)/admin/communications/settings-actions.ts` — `setDisplayName`, `setCongratsLeadDays` (0–30), `sendTestToSelf()`. **`sendTestToSelf` takes no recipient parameter**, so it cannot become a way to mail an arbitrary address
- [ ] T041 [US3] Create `src/app/(app)/admin/communications/settings/page.tsx` — display name, lead days, the four-state readiness readout, and the test-send button
- [ ] T042 [US3] The display-name field **must warn in the UI** that it also re-brands the claim and holiday emails (research D10). A setting that quietly changes something else is how trust goes

**Checkpoint**: an operator can prove delivery works without sending anything to the company.

---

## Phase 5: User Story 2 — a manager sends a prepared congratulation (P2)

**Goal**: the part that runs without anyone remembering a date.

**⛔ Blocked by G2** — the manager's screen and the sidebar count are new UI and need an approved
mockup first.

**Independent test**: set a joining date three days out, run the preparation, confirm a draft
appears for the manager with the right years, edit it, send it, confirm only that employee got it.

- [ ] T050 [US2] Create `src/app/api/cron/communications/route.ts` — `Bearer $CRON_SECRET`, **refusing when the secret is unset**. Upsert `Occasion` on `(userId, kind, occasionYear)`; create a DRAFT per new occasion; assign to the line manager, falling back to HR when there is none **or when the manager is the subject**; close passed drafts as MISSED; **at most one nudge per assignee per run**. Choose work **by date**, never by "did yesterday's run happen"
- [ ] T051 [US2] **Assert in the route's own verification that no employee was emailed by it.** FR-028 is the line spec 037 drew; it is proved, not trusted
- [ ] T052 [US2] Add the second cron entry to `vercel.json`
- [ ] T053 [US2] Add `updateCongratulation`, `sendCongratulation`, `dismissCongratulation` to `actions.ts` with `requireAssignee(id)`. `sendCongratulation` guards: DRAFT re-read in the transaction · the subject is still **active** · **not past the occasion date** · email configured
- [ ] T054 [P] [US2] Add `pendingForAssignee(userId)` and `pendingQueue()` to `src/lib/comms/` as plain functions
- [ ] T055 [US2] Create `src/app/(app)/messages/page.tsx` — the manager's own pending drafts, edit and send **(after G2)**
- [ ] T056 [US2] Snapshot then add the pending count to `src/components/AppShell.tsx`, reusing the existing `navBadges` machinery **(after G2)**
- [ ] T057 [US2] Sign the sent message with `sentById`'s name in `renderMessage` — honest only because the manager rewrote the words first

**Checkpoint**: birthdays and anniversaries no longer depend on anyone remembering.

---

## Phase 6: User Story 4 — HR watches the queue (P3)

**Goal**: a manager on holiday must not mean a birthday silently missed.

**Independent test**: create drafts for two managers' reports, confirm HR sees both, send one as HR.

- [ ] T060 [US4] Create `src/app/(app)/admin/communications/queue/page.tsx` — every pending draft, whose it is, when it is due
- [ ] T061 [US4] Allow HR through `requireAssignee` so they can send any draft; the record shows HR sent it

---

## Phase 7: Verification

- [ ] T070 Write `scripts/verify-communications.mts` covering every assertion in [quickstart.md](./quickstart.md) Scenario 4 — including that overlapping audience choices produce **one** recipient row per person, that two units produce **different** `businessUnitId`s, that a second send is refused, that a stale `confirmedCount` is refused, and that the rendered HTML contains no `<style>`, no `var(`, and no `src="data:"`
- [ ] T071 Run it against a throwaway Postgres and record the pass count honestly
- [ ] T072 Run `npm test` and confirm the existing 105 still pass alongside the new pure-function tests
- [ ] T073 `npx tsc --noEmit` and `npm run build` clean

---

## Phase 8: Polish & documentation

- [ ] T080 [P] Update `PROJECT_DETAILS.md` — the module, the four tables, the shared audience derivation, the contrast rule, and both recorded constraints (private logos, the single display name)
- [ ] T081 [P] Update `IMPLEMENTATION_PROGRESS.md` with what was built and what was verified
- [ ] T082 [P] Update `IMPLEMENTATION_PLAN.md`'s decisions log
- [ ] T083 [P] Add to `CLAUDE.md` the pattern this feature establishes: **a colour an operator chooses must carry its own legibility rule** — derive the ink, leave the brand alone where you can, and never make the operator responsible for contrast
- [ ] T090 **Run `/speckit-constitution`** to change the email limit from two workflows to three, naming what is still excluded (marketing, external recipients, invitations) and keeping "no scheduled process emails an employee" intact. **Same commit as the code (G1)**

---

## Dependencies

```
Phase 1 (schema)
   └─> Phase 2 (foundational)
          ├─> Phase 3  US1  announcements ......... MVP, ships alone
          ├─> Phase 4  US3  prove delivery ........ needs T020 only
          ├─> Phase 5  US2  congratulations ....... needs T020, and G2
          │      └─> Phase 6  US4  HR queue ....... needs US2's drafts to exist
          └─> Phase 7 verification ─> Phase 8 docs
```

**Story independence**: US1 and US3 are genuinely independent of each other and of US2. US4 is the
only one with a real dependency — there is no queue to watch until US2 creates drafts.

## Parallel opportunities

- **Phase 2**: T016/T017 (contrast), T018/T019 (occasions) and T023 (the eyebrow fix) touch
  different files and can run at once. T020 depends on T016.
- **Phase 3**: T034 (preview route) and T038 (admin card) are independent of the action work.
- **Phase 8**: all four documentation tasks are separate files.

**Not parallelisable**: the extraction (T010–T015) is a single ordered sequence — moving the code,
re-pointing Learning at it, and *proving Learning still works* cannot be interleaved.

## Implementation strategy

**MVP = Gates + Phase 1 + Phase 2 + Phase 3.** That is a real product: HR writes an announcement,
picks who gets it, sees the count, previews it, sends it, and every recipient gets their own copy
branded with their own unit.

**Then Phase 4 immediately** — small, and it is what stops the first real announcement being the
first test.

**Then Phase 5** once G2's mockup is approved. Stop after any phase and what exists is coherent.

## Task count

| Phase | Tasks |
|---|---|
| Gates | 3 |
| 1 Setup | 3 |
| 2 Foundational | 14 |
| 3 US1 (P1) | 9 |
| 4 US3 (P3) | 3 |
| 5 US2 (P2) | 8 |
| 6 US4 (P3) | 2 |
| 7 Verification | 4 |
| 8 Polish | 5 |
| **Total** | **51** |
