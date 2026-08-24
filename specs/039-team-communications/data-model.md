# Data Model: Team Communications (spec 039)

**Date**: 2026-08-24 · Migration `prisma/sql/067_team_communications.sql` (additive, idempotent)

Nothing existing is altered except one added column on the settings singleton. No back-fill:
with no rows, behaviour is exactly what it is today.

---

## Enums

```prisma
/// What a message is. The kind decides who it reaches and who may send it —
/// an ANNOUNCEMENT goes to an audience and is written by a person; a
/// congratulation goes to exactly one person and is prepared by the platform.
enum MessageKind {
  ANNOUNCEMENT
  BIRTHDAY
  WORK_ANNIVERSARY
}

/// DRAFT is the only state that can be edited or sent.
/// MISSED is terminal and deliberate: an unsent congratulation closes rather
/// than going out late (FR-026). A late birthday message is worse than silence.
enum MessageState {
  DRAFT
  SENT
  MISSED
}

/// What the mail provider told us about ONE person's copy. PENDING exists for
/// the window between the row being written and the provider answering, so a
/// function that dies mid-send leaves evidence rather than a gap.
enum DeliveryState {
  PENDING
  ACCEPTED
  FAILED
}
```

---

## `Message`

One thing that goes to people.

| Field | Type | Notes |
|---|---|---|
| `id` | String @id | |
| `kind` | MessageKind | |
| `state` | MessageState @default(DRAFT) | |
| `subject` | String | |
| `body` | String | Plain text. Blank lines become paragraphs — the composer is a textarea, so the breaks a person typed are the only structure the message has |
| `ctaLabel` / `ctaHref` | String? | Optional link. Rendered only when `ctaHref` is absolute — a relative link is dead in a mail client |
| `subjectUserId` | String? | The person a congratulation is *about*. Null for an announcement |
| `assignedToId` | String? | Whose queue it sits in — the line manager, or HR. Null for an announcement |
| `occasionId` | String? @unique | Links back to what caused it. Null for an announcement |
| `createdById` | String? | Null when the platform prepared it |
| `sentById` | String? | **Who pressed send.** This is what the closing line is signed with (FR-023) |
| `sentAt` | DateTime? | |
| `missedAt` | DateTime? | |
| `recipientCount` | Int @default(0) | Stamped at send. What was true *then*, not a live count |
| `createdAt` / `updatedAt` | DateTime | |

**Rules that live here**

- Only `state = DRAFT` may be edited or sent. The send action re-reads the state inside the
  transaction — the disabled button is a courtesy; this is what stops two people sending the same
  draft twice (FR-032).
- `sentById` is stored rather than derived, because the manager may change roles later and the
  message was still signed by them.
- `recipientCount` is a **snapshot**. Recomputing it later would answer "who would this reach
  today", which is a different and misleading question once people have joined or left.

**Indexes**: `(state, kind)` for the queues · `(assignedToId, state)` for one manager's list ·
`(subjectUserId)`.

---

## `MessageRecipient`

One person's copy of one message. This table is why "did Karim get it?" is answerable.

| Field | Type | Notes |
|---|---|---|
| `id` | String @id | |
| `messageId` | String → Message (Cascade) | |
| `userId` | String → User (Cascade) | |
| `email` | String | **The address as it was at send time.** People change email; the record must say where it actually went |
| `businessUnitId` | String? | Which unit branded *this* copy — the reason each copy can differ |
| `state` | DeliveryState @default(PENDING) | |
| `providerId` | String? | The provider's id for this one message, for chasing a specific delivery |
| `error` | String? | Why this one failed, when it did |
| `createdAt` | DateTime | |

**Unique** `(messageId, userId)` — a person cannot be in one send twice, however the audience
choices overlap. Someone matched by both their department *and* by name gets one email.

**Index** `(messageId, state)` — "which of these failed" without scanning.

---

## `MessageAudience`

For an announcement: one row per choice, exactly mirroring how Learning stores course access.

| Field | Type | Notes |
|---|---|---|
| `id` | String @id | |
| `messageId` | String → Message (Cascade) | |
| `field` | String | `DEPARTMENT` · `GROUP` · `PERSON` · `BUSINESS_UNIT` · `TENURE_BAND` · `EMPLOYMENT_TYPE` · `REPORTS_TO` |
| `value` | String | The department name, the group id, the user id… |

**Deliberately NOT an expanded list of people.** A choice is a rule resolved live, the same way a
course audience is — which is what makes the count on screen today's answer rather than a stale
one. The expansion happens once, at send, and lands in `MessageRecipient`.

**No `ALL_ACTIVE` value.** "Everyone" is a choice the picker offers as its own control, exactly as
the Learning fix established — two ways to say everyone is how a restricted thing quietly reaches
the whole company.

**Unique** `(messageId, field, value)` — choosing the same department twice is a no-op.

---

## `Occasion`

A birthday or joining anniversary for one person in one year. Its only job is to make
idempotence **structural**.

| Field | Type | Notes |
|---|---|---|
| `id` | String @id | |
| `userId` | String → User (Cascade) | |
| `kind` | MessageKind | BIRTHDAY or WORK_ANNIVERSARY |
| `occasionYear` | Int | Calendar year of the occasion |
| `occasionDate` | DateTime | The observed date — 28 Feb in a non-leap year for a 29 Feb birthday |
| `years` | Int? | Years of service. Null for a birthday — an age is never stated (FR-020) |
| `preparedAt` | DateTime | |

**Unique** `(userId, kind, occasionYear)` — the constraint *is* the guarantee. A second
preparation run's insert is a no-op, not a duplicate draft, and that holds whether the job runs
once, twice, or ten times a day (FR-025).

`years` being nullable is not laziness: it is how the model refuses to hold an age.

---

## `CommunicationSettings` — extending `NotificationSettings`

No new table. One column added to the existing singleton:

| Field | Type | Notes |
|---|---|---|
| `congratsLeadDays` | Int @default(3) | How far ahead drafts are prepared (FR-018), mirroring the existing `verificationLeadDays` |

`fromName` (the display name) and `emailEnabled` (the master toggle) already exist and are reused
unchanged. Adding a second display name was rejected — see research D10.

---

## Relationships

```
User ──< Message (subject)          the person a congratulation is about
User ──< Message (assignedTo)       whose queue it is in
User ──< Message (sentBy)           who pressed send
User ──< MessageRecipient           one person's copy
User ──< Occasion                   their birthdays and anniversaries
BusinessUnit ──< MessageRecipient   which brand this copy carried

Message ──< MessageRecipient        the expansion, written at send
Message ──< MessageAudience         the choices, resolved live until send
Message ──1 Occasion                what caused a congratulation
```

Every `User` relation is a **back-relation only**. This feature adds **no column to `User`** —
the same discipline spec 038 kept. Birthdays and anniversaries come from `dateOfBirth` and
`startDate`, which the registry already holds.

---

## What is derived, never stored

- **Who an announcement reaches** — resolved from `MessageAudience` through the shared derivation
  every time it is asked, until the moment of send.
- **The per-choice count** beside each audience chip — counted per choice, through the same
  derivation the send uses. (The Learning bug this rule comes from: one combined total printed
  beside every choice, so a choice reaching nobody looked identical to one that worked.)
- **The unit's colours** — read from `BusinessUnit` at render time. A unit re-branding changes
  future emails and does not rewrite the past, because `MessageRecipient.businessUnitId` records
  *which* unit, not what colour it was.
- **The ink on that colour** — computed by `lib/comms/brand.ts` per render. Never stored;
  storing it would let it drift from the colour it is supposed to be legible on.
- **Whether a draft is overdue** — from `Occasion.occasionDate`. `MISSED` is *written* when it
  closes, but "due in 3 days" is arithmetic.

---

## Migration safety

- Four new tables, three new enum types, one defaulted column. Nothing existing altered.
- Idempotent: enum creation guarded by a catalogue check, tables by `IF NOT EXISTS`, the column by
  `ADD COLUMN IF NOT EXISTS`.
- Expect the house `updatedAt DEFAULT` diff against `schema.prisma`, as every migration here since
  `060` has — documented in `060`'s header.
- **No back-fill.** With no rows, the platform behaves exactly as it does today.
