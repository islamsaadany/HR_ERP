# Phase 1 Data Model — Performance Reviews & 1:1s

**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)
**Migration**: `prisma/sql/071_performance_reviews.sql` (next free number; idempotent; same commit as
the schema change).

---

## Shape at a glance

```
User ──┬─< ReviewSheet >──┬── ReviewSheetItem  (every answer is a list item)
       │   (employee,     └── ReviewOutcome    (0..1, the carry-forward)
       │    manager)
       ├──< OneOnOne >──── OneOnOneNote
       ├──< JournalEntry   (private to author; joined to nothing)
       └──  StrengthsProfile ──< StrengthsProfileTheme >── StrengthsTheme (34, reference)
```

---

## `ReviewSheet`

One per pair per quarter. **Stores the pair** — access is authorised against these two ids, never
against the current org chart (research R2).

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | |
| `year` | Int | |
| `quarter` | Int | 1–4. No cycle table — the date range is derived (research R4). |
| `employeeId` | String → User | The person being reviewed. |
| `managerId` | String → User | Their manager **at the time the sheet was created**. |
| `employeeSubmittedAt` | DateTime? | "I am ready to meet" — **not** "you may read me". |
| `managerSubmittedAt` | DateTime? | |
| `employeeMetConfirmedAt` | DateTime? | |
| `managerMetConfirmedAt` | DateTime? | |
| `openedAt` | DateTime? | Stamped once all four above are set. **The one thing every read and write consults.** |
| `createdAt` / `updatedAt` | DateTime | |

- **Unique**: `(year, quarter, employeeId, managerId)` — a mid-quarter manager change produces a
  second sheet rather than a collision, which is the correct outcome: two different pairs.
- **Indexes**: `(employeeId, year, quarter)`, `(managerId, year, quarter)`.
- **Derived, never stored**: `isOpen = openedAt != null`. Frozen and visible are the same state by
  design (research R3).

**State transitions**

```
draft ──(both submitted)──> ready ──(both confirmed met)──> OPEN (= frozen, both halves visible)
  │                            │
  └────────────────────────────┴──> quarter ends with openedAt still null
                                    → stays sealed forever; no outcome, no carry-forward (FR-009a)
```

Writes allowed only while `openedAt` is null, and only by the half's own author. There is no
un-submit after `openedAt` is stamped and no path that clears it.

---

## `ReviewSheetItem`

**Every answer on the agenda is a list** — the source template is bullets and numbered lists
throughout — so one table holds all of them, rather than a text blob per question.

| Field | Type | Notes |
|---|---|---|
| `id` | String | |
| `sheetId` | String → ReviewSheet | cascade delete |
| `authorId` | String → User | Which half this item belongs to. Must be the sheet's employee or manager. |
| `questionKey` | String | From the agenda registry in code (see below). |
| `position` | Int | Order within the answer. |
| `body` | String | The text. For a strengths pick, the **theme name** — a snapshot by construction. |
| `sourceKind` | enum | `TYPED` · `JOURNAL` · `ONE_ON_ONE` · `STRENGTH` |
| `sourceId` | String? | The journal entry or 1:1 it was promoted from; the theme code for `STRENGTH`. |
| `createdAt` | DateTime | |

- **Partial unique index** on `(sheetId, authorId, questionKey, sourceKind, sourceId)` where
  `sourceId IS NOT NULL` — promoting the same journal entry or 1:1 outcome twice onto the same answer
  is a no-op rather than a duplicate. Two people promoting the same 1:1 outcome still get one item
  each, because `authorId` differs (spec edge case).
- **`body` is a copy, always.** Editing or deleting the source journal entry or re-uploading a
  strengths profile cannot reach an item (FR-018, FR-030). This is why the snapshot is the body text
  itself and not a foreign key read at render time.

---

## `ReviewOutcome`

The only thing that outlives the meeting, and the next quarter's carry-forward.

| Field | Type | Notes |
|---|---|---|
| `id` | String | |
| `sheetId` | String → ReviewSheet | **unique** — one outcome per sheet |
| `priorities` | String | Top 3 priorities for the next period |
| `risks` | String | Key risks or concerns to watch |
| `successDefinition` | String | What would make the next review feel like a success |
| `employeeCommitments` | String | |
| `managerCommitments` | String | |
| `authoredById` | String → User | Whoever wrote it up |
| `employeeAckAt` | DateTime? | |
| `managerAckAt` | DateTime? | |
| `finalAt` | DateTime? | Stamped when both acknowledgements are present |

- Editable while `finalAt` is null; read-only after. Any edit before finalisation **clears both
  acknowledgements** — otherwise a party's agreement could be attached to text they never saw.
- May only exist when the parent sheet has `openedAt` set (FR-009a: no meeting → no outcome).
- **Carry-forward** = the previous quarter's `finalAt`-stamped outcome for the same pair, read
  through `quarters.ts`. A non-final outcome never carries.

---

## `JournalEntry`

| Field | Type | Notes |
|---|---|---|
| `id` | String | |
| `authorId` | String → User | |
| `occurredOn` | DateTime (date) | The day it happened — not the day it was typed. |
| `section` | enum? | `WENT_WELL` · `DIDNT_GO_WELL` · `LEARNING` · `BLOCKER` · `EXPECTATION` — optional. |
| `body` | String | |
| `createdAt` / `updatedAt` | DateTime | |

**This table has no relation to any sheet, pair, or manager, and that is the design.** There is no
join by which another person's entry can be reached, so a query that leaks one has to be written
deliberately rather than by forgetting a filter. Every read is `where: { authorId: me.id }`.

---

## `OneOnOne` and `OneOnOneNote`

| `OneOnOne` | Type | Notes |
|---|---|---|
| `id` | String | |
| `employeeId` / `managerId` | String → User | The stored pair (research R2). |
| `heldOn` | DateTime (date) | |
| `createdById` | String → User | Either party |
| `outcome` | String? | |
| `employeeAckAt` / `managerAckAt` | DateTime? | |
| `finalAt` | DateTime? | Stamped when both acknowledge; record becomes read-only |
| `createdAt` / `updatedAt` | DateTime | |

| `OneOnOneNote` | Type | Notes |
|---|---|---|
| `id` | String | |
| `oneOnOneId` | String → OneOnOne | cascade delete |
| `authorId` | String → User | Must be one of the pair |
| `body` | String | |
| `createdAt` | DateTime | |

- Both parties read and write notes freely until `finalAt`; nothing is sealed here — a 1:1 is a shared
  working record, not a two-halved form (agreed input, mechanism 2's carve-out).
- Editing the outcome before `finalAt` **clears both acknowledgements**, same rule as `ReviewOutcome`.
- Creation is refused unless the two users are in a manager↔report relationship **at that moment**
  (FR-019); the pair is then stored and never re-derived.

---

## `StrengthsTheme` (reference data — 34 rows, seeded)

| Field | Type | Notes |
|---|---|---|
| `code` | String @id | e.g. `SELF_ASSURANCE` |
| `name` | String | e.g. `Self-Assurance` — the exact spelling printed by Gallup |
| `domain` | enum | `EXECUTING` · `INFLUENCING` · `RELATIONSHIP_BUILDING` · `STRATEGIC_THINKING` |
| `sortOrder` | Int | Alphabetical within domain, for the manual-entry picker |

Seeded by the migration, not by a screen. Domains are printed in both sample reports, so they cost
nothing and make the manual-entry fallback usable.

---

## `StrengthsProfile` and `StrengthsProfileTheme`

| `StrengthsProfile` | Type | Notes |
|---|---|---|
| `id` | String | |
| `employeeId` | String → User | **unique** — one current profile per person |
| `source` | enum | `PARSED` · `MANUAL` |
| `assessmentDate` | DateTime? | As printed in the report footer |
| `printedName` | String? | As extracted, shown at confirmation only — **never** used to match an employee (FR-028) |
| `blobUrl` / `fileName` | String? | The uploaded PDF in the private store; null for a manual profile |
| `confirmedById` | String → User | Who confirmed the themes |
| `confirmedAt` | DateTime | Nothing is saved before this (FR-026) |

| `StrengthsProfileTheme` | Type | Notes |
|---|---|---|
| `profileId` | String → StrengthsProfile | cascade delete |
| `rank` | Int | 1..34 |
| `themeCode` | String → StrengthsTheme | |

- **Unique**: `(profileId, rank)` and `(profileId, themeCode)`.
- **Ordered list of any length** — 5 and 34 are the same shape, so no "which report type" setting
  exists to get wrong.
- Replacing a profile replaces its rows. Past `ReviewSheetItem`s are untouched because they store the
  theme **name as text** (FR-030).

---

## Enums added

`ReviewJournalSection`, `ReviewItemSource`, `StrengthsDomain`, `StrengthsProfileSource`.

## Agenda question registry — code, not database

The agenda's questions live in **one** registry, `src/lib/reviews/agenda.ts`, following the
`campaign-fields.ts` / `requestable.ts` precedent: a question has a key, a section, prompt text, which
half authors it, and whether it is a strengths picker. Nothing about the agenda is editable at runtime
— there is no operator for this module (FR-002), so an admin-editable question table would be a screen
nobody is allowed to have. The wording is the supplied template with "this year" → "this period"
(FR-010).

## What is deliberately absent

- **No `ReviewCycle` table** (research R4).
- **No notification, reminder, or digest table.** No email is part of this feature.
- **No compliance, completion, or analytics view** over any of these tables (FR-032) — including no
  admin count of who has a sheet.
- **No money column anywhere**, and no relation to any benefits table (FR-034).
