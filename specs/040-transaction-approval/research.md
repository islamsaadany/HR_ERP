# Phase 0 Research: Bank Confirmations & Monthly Salary Runs

Only the questions the existing codebase does not already answer. Spec 039 settled money handling,
the refusal pattern, evidence serving and the access-derivation style; all of that is reused
unchanged.

---

## R1 — Who may confirm: appointment only, or appointment plus role-holders?

**Decision**: **Appointment only.** `canConfirmBatches(userId)` reads the appointment table and
nothing else. Top-level access confers the right to *appoint* (including self-appoint), never the
right to confirm.

**Rationale**: This reverses the reasoning used for Learning managers, where HR and Super Users hold
the capability implicitly so that emptying the table cannot lock anyone out. That was right there —
Learning is a job somebody must always be able to do. Here the CEO said the opposite in plain terms:
payments wait for him and nobody else stands in. If every top-level account could quietly confirm, the
product would be promising a control it does not enforce, which is worse than having no control. The
lock-out risk is real but recoverable in one click: anyone with top-level access can appoint
themselves and proceed, so the failure mode is a pause, not a wall.

**Alternatives considered**:
- *Mirror the Learning pattern (role-holders implicit)*: consistent with the house rule and rejected
  anyway, because consistency here would contradict the instruction the feature exists to serve.
- *Appointment only, with no self-appointment*: genuinely lockable. Rejected.
- *A "break glass" override for Super Users, logged loudly*: more machinery than a company of this
  size needs, and it re-creates the implicit power under a different name.

**Consequence accepted and to be surfaced in the UI**: with nobody appointed, batches accumulate.
The Finance screen must say so plainly rather than silently queueing.

---

## R2 — Is the total stored or derived?

**Decision**: **Stored**, computed once at submission, alongside the count.

**Rationale**: Everywhere else in this module a figure is derived on read, precisely so two screens
cannot disagree (`pettycash.ts` exists for that reason). This is the one place where the opposite is
correct. The confirmer acts on a number he was emailed, possibly hours earlier, and then confirms a
release of real money against it. If the total were recomputed on read, a change to a source record
between the email and the tap would silently alter what he is confirming — the exact drift the
feature exists to prevent, reintroduced at the only moment it actually matters.

Items are locked while it stands, so the stored total cannot drift from them either; the two
protections are complementary, not redundant.

**Alternatives considered**:
- *Derive like everything else*: rejected above.
- *Store the total and re-derive as a cross-check, warning on mismatch*: a warning nobody can act
  on, for a state that locking already makes impossible. Rejected as machinery.

---

## R3 — How does `PaybackStatus` gain a member mid-list?

**Decision**: `ALTER TYPE "PaybackStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_SUBMITTED' BEFORE
'REJECTED'`, run **outside** a transaction block, and guarded so a re-run is a no-op.

**Corrected during verification**: the obvious `BEFORE 'PAID'` is wrong. The type as created in 067
runs `SUBMITTED, APPROVED, REJECTED, PAID`, so inserting before `PAID` lands the new member *after*
`REJECTED` — leaving the database's order disagreeing with the order `schema.prisma` declares, and
trapping the first person who sorts by that column. Caught by querying `pg_enum` on a throwaway
database rather than trusting the statement's wording.

**Rationale**: Spec 039 wrote the enum in an order that leaves room for this and said so in the
schema comment, so the position is already agreed. The operational catch is that Postgres refuses
`ADD VALUE` inside a transaction block on older versions and the deploy runner wraps files; the
migration therefore performs the alter as its own statement with an existence check first, rather
than assuming. Verified against a throwaway Postgres before shipping, per house rule.

**Alternatives considered**:
- *A separate boolean "sent to bank" column instead of an enum member*: two sources of truth for one
  lifecycle, and every existing status check would need to remember the flag. Rejected.
- *Recreate the type and migrate values*: a rewrite of a live column to avoid one `ALTER TYPE`.
  Rejected.

---

## R4 — Where does the confirmer's screen live?

**Decision**: Its own route, `/confirmations`, reachable from the email link and from the sidebar
only for people who actually hold the appointment.

**Rationale**: The confirmer is not a Finance user. Making him enter Finance's workspace to do a
ten-second job would mean either giving him Finance's navigation or building a Finance page that
hides most of itself — and it would put payroll and expense screens in front of someone who has no
reason to browse them. A separate small surface also makes the email's promise literal: tap the link,
see what is waiting, mark it complete.

Finance sees the same batches from their own side, as a tab on the Payments page they already use,
because for them it is one more state of work they already track.

**Alternatives considered**:
- *A tab inside `/finance`*: rejected above.
- *Email-only, no screen*: the CEO chose to record completion himself, which needs somewhere to do it.

---

## R5 — What may the email contain?

**Decision**: The kind, how many transactions, the total, who submitted it, and a link. **No payee names, no individual
amounts, no salary detail.**

**Rationale**: The CEO's choice (2026-08-24), and the right default regardless: an emailed list of
who was paid what lives in an inbox forever, is forwarded by accident, and is readable by anyone who
gets at the account. The link costs one tap and keeps the detail behind the same access check as the
rest of the app. The reminder email follows the same rule.

**Consequence to test**: a payee's name appearing in an email is a defect, not a nicety — hence
SC-007 and an explicit check in the quickstart.

---

## R6 — What does the daily reminder run on?

**Decision**: A second cron route beside the holidays one, sharing `CRON_SECRET`, reading a
configurable lead in days, emailing only appointed confirmers.

**Rationale**: The pattern exists, is authenticated, and is already understood by the constitution's
scheduled-work clause. The clause names HR as the audience it may nudge; that list widens to include
confirmers, which is an amendment to record rather than a rule to bend. What does not change is the
hard part: a scheduled job may never email employees at large.

**Alternatives considered**:
- *Fold it into the holidays route*: two unrelated jobs sharing one entry point, failing together.
  Rejected.
- *No reminder at all*: acceptable, and the reason this is P3 — the send-time email does the main
  work. Built because an unconfirmed batch means somebody has not been paid and nobody is watching.
