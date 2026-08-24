# Implementation Plan: Team Communications

**Branch**: `039-team-communications` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/039-team-communications/spec.md`

## Summary

An admin surface for sending email to employees: **announcements** to a chosen audience, and
**personal congratulations** for birthdays and joining anniversaries that the platform prepares
but a manager sends.

The technical shape, in one paragraph: one email builder function produces every message, taking
the recipient's business unit as data, with the text colour derived from that unit's colour so any
brand stays legible. Sends go through Resend's **batch** endpoint — one separate message per
person, so nobody sees another's address and each copy carries its own branding. A **second daily
cron** prepares congratulation drafts and notifies the line manager; it never emails an employee.
The audience picker is **extracted from Learning and shared**, not copied.

## Technical Context

**Language/Version**: TypeScript 5, Node 20 (Next.js 15.5 App Router, React 19)

**Primary Dependencies**: Prisma 6.19 · `resend` 6.18.1 (`batch.send` and `domains.list` both
verified present at runtime) · Zod 4 · Tailwind v4. **No new runtime dependency.**

**Storage**: PostgreSQL (Neon). Four new tables, one new column on an existing settings row.
Migration applied at deploy by `scripts/apply-sql.mjs`.

**Testing**: No testing regime (constitution V). Pure functions — the contrast derivation, the
occasion-date arithmetic, the batch chunking — get unit tests in `tests/` because they are cheap
and exact. Everything with a database behind it is verified by a `scripts/verify-*.mts` script run
against a throwaway Postgres, as every recent feature here has been.

**Target Platform**: Vercel (serverless functions + cron), modern browsers, and — for the email
itself — Outlook/Word rendering, Gmail web and mobile, Apple Mail.

**Project Type**: Web application, single Next.js project.

**Performance Goals**: A 148-person send completes inside one function invocation (2 batch
requests). The setup page's delivery-readiness check must not block the page — it is fetched
server-side with a short timeout and degrades to "could not check just now".

**Constraints**: Email is not the web — tables for layout, every style inline, no CSS custom
properties, no `data:` images (see research D6/D7). A broadcast cannot be recalled, so the send
path is guarded by an explicit count confirmation. `CRON_SECRET` must be set or the cron route
refuses.

**Scale/Scope**: Low hundreds of employees. Two message kinds, three admin screens, one cron,
one shared library extraction.

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Note |
|---|---|---|
| **I. Align Before Building** | ✅ Pass | Shape agreed in conversation 2026-08-24; four open questions answered by the product owner before the spec was written. Nothing here was assumed. |
| **II. UI Changes Require Approval** | ✅ Pass | Design approved at `design-mockups/communications/2026-08-24_ffg-email-design-v2.html` (v2, after feedback inverted the hierarchy). `ui-versions/` snapshots required for every existing file touched — listed in Phase 1. |
| **III. Benefits Money Server-Authoritative** | ✅ N/A | This feature touches no money rule. |
| **IV. Spec-Driven & Docs Move With Code** | ✅ Pass | Spec written first. The four steering files update in the same commit as the code. |
| **V. Engineered Enough, Explicit Over Clever** | ⚠️ **Requires the extraction** | Writing a second audience picker would be the second implementation of one rule — the exact failure this codebase has hit twice. See Complexity Tracking. |

### ⚠️ Deviation requiring approval: the two-workflow email limit

The constitution's Technology & Data Constraints state:

> Email: limited to **two** workflows — [benefit claims (spec 020) and the holiday/vacation cycle
> (spec 037)]. Still **no** invitations, marketing, or other notifications outside these two.

**This feature is a third workflow, and the first that is broadcast.** That is a real deviation,
not a technicality, and it must be recorded rather than absorbed quietly:

- The rule has been widened deliberately twice before (spec 020 opened it; spec 037 widened it).
  This is the third widening and follows the same pattern: the product owner asked for it
  explicitly, on 2026-08-24.
- **The load-bearing half of the rule is untouched.** "No scheduled process emails an employee"
  (spec 037) holds absolutely here — FR-028. The new cron prepares and notifies operators only.
- What genuinely changes: employees can now receive email that is *not* about something they did.

**Action**: `.specify/memory/constitution.md` must be updated in the same commit as the code, via
`/speckit-constitution`, to say **three** workflows and to name what is still excluded (marketing,
external recipients, invitations). Shipping the code while the constitution still says "two" would
make the governing document wrong — a documentation bug by principle IV.

## Project Structure

### Documentation (this feature)

```text
specs/039-team-communications/
├── plan.md              # This file
├── research.md          # Phase 0 — 11 decisions, each verified against code or library
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/
│   └── server-actions.md  # Phase 1 — the callable surface
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # Phase 2 — NOT created here
```

### Source code (repository root)

```text
src/
  lib/
    audience/                    # NEW — extracted from Learning, shared (research D3)
      rules.ts                   #   compile choices → one Prisma where; per-choice counts
      types.ts                   #   AudienceChoice, AudienceField
    comms/                       # NEW
      brand.ts                   #   contrast derivation — pure, unit-tested (research D5)
      occasions.ts               #   birthday/anniversary dates, 29 Feb rule — pure (research D9)
      render.ts                  #   THE email builder. Preview and send both call it (D8)
      send.ts                    #   batch chunking at 100, per-recipient results (D1)
      settings.ts                #   display name, lead days, delivery-readiness readout
    email/
      client.ts                  # EDIT — add batch send + domain status (D2)
      templates.ts               # EDIT — eyebrow contrast fix, FR-042 (D11)
    learning/
      audience.ts                # EDIT — thin re-export of lib/audience, no behaviour change
  app/
    (app)/admin/communications/
      page.tsx                   # NEW — announcements list + compose
      [id]/page.tsx              # NEW — one message: edit, preview, send
      queue/page.tsx             # NEW — pending congratulations (HR sees all)
      settings/page.tsx          # NEW — display name, lead days, delivery readiness, test send
      actions.ts                 # NEW — server actions (see contracts/)
    (app)/messages/page.tsx      # NEW — a manager's own pending drafts
    api/
      cron/communications/route.ts  # NEW — daily preparation (D4)
      admin/communications/preview/route.ts  # NEW — renders via lib/comms/render.ts (D8)
  components/
    comms/                       # NEW — compose form, preview frame, queue rows
    audience/                    # MOVED from components/learning — shared picker
prisma/
  schema.prisma                  # EDIT — 4 models, 3 enums, 1 settings column
  sql/067_team_communications.sql  # NEW — additive, idempotent
scripts/
  verify-communications.mts      # NEW — against a throwaway Postgres
tests/
  comms-brand.test.ts            # NEW — the contrast rule, incl. the six measured colours
  comms-occasions.test.ts        # NEW — anniversary years, 29 Feb, leavers
vercel.json                      # EDIT — second cron entry
```

**Structure Decision**: single Next.js project, matching every other module here. The one
structural change is the **extraction** of the audience derivation out of `lib/learning/` into
`lib/audience/` — Learning keeps a re-export so nothing in it changes behaviour, and
Communications imports the same thing rather than a copy.

## Phase 1 — files requiring a `ui-versions/` snapshot before editing

Per constitution II, snapshot first:

- `src/components/learning/AccessSetup.tsx` → `ui-versions/AccessSetup/` (moving to shared)
- `src/components/AppShell.tsx` → `ui-versions/AppShell/` (a manager's pending-drafts count)
- `src/app/(app)/admin/page.tsx` → `ui-versions/admin-home/` (a Communications card)
- `src/lib/email/templates.ts` — not a UI file by the letter of the rule, but the eyebrow change
  is visible in production email; snapshot it anyway.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Extracting `lib/audience/` out of Learning** — a refactor of working, shipped code, inside a feature that did not ask for it | FR-012 forbids a second implementation of "who does this reach". The constitution flags repetition at **two** uses; this is the second. The derivation carries non-obvious correctness (a broken rule reaches nobody rather than everyone; tenure compiles to a date range, never the stale stored band) that a re-implementation would get wrong | **Copying it** was rejected: this codebase has been bitten twice by exactly that — the pool ceiling existing in three places, and "everyone" being expressible two ways so a RESTRICTED course reached the whole company. A copy is how the second one is born |
| **Four tables where two might do** (Message, MessageRecipient, MessageAudience, Occasion) | A send must record *per recipient* what happened (FR-034) and *which unit branded it*, which a JSON blob on the message cannot answer when somebody asks "did Karim get it?". `Occasion` exists to make idempotence structural (FR-025) rather than a check the job remembers to do | **Storing recipients as JSON on the message** was rejected: per-recipient failure is a first-class requirement, not a log line. **Deriving "missed" from the date at read time** was rejected: the state must be stored so a late send is refused at the write, not merely hidden at the read |
| **A second cron rather than extending the holidays one** | Independent failure. A holiday API outage must not stop birthdays being prepared | **One job doing both** was rejected: two unrelated jobs-to-be-done sharing a failure mode, for the saving of one file |

## Post-design Constitution re-check

Re-evaluated after the data model and contracts below were written:

- **V (repetition)** — resolved by the extraction. After Phase 1 there is exactly one audience
  derivation, one email builder, one contrast rule, and one occasion calculator.
- **II (UI approval)** — the email design is approved; the three admin screens are conventional
  list/detail/settings in the existing idiom. **The manager's pending-drafts surface and the
  sidebar count are new UI and need a mockup before they are built** — flagged as a gate in
  `tasks.md`, not assumed.
- **The email-workflow deviation stands** and is the one thing requiring the product owner's
  sign-off on the constitution edit, not just on the feature.
