# Quickstart — validating Performance Reviews & 1:1s

How to prove this feature works before handing it over. Three of these scenarios (A, B, C) are
privacy checks: getting them wrong is not a bug, it is a broken promise, so each is verified by
**fetching the data directly**, not by looking at a screen.

## Prerequisites

```bash
npx tsc --noEmit        # must be clean
npm run build           # must be clean
```

For anything touching the database, use a throwaway Postgres — never the user's Neon database:

```bash
initdb -D /tmp/pgdata && pg_ctl -D /tmp/pgdata -o "-k /tmp" -l /tmp/pg.log start
createdb -h /tmp hrerp_reviews
```

Apply `prisma/sql/067_performance_reviews.sql` to it **twice** — it must be idempotent, because the
deploy-time runner may retry it — then query the tables it created and confirm the 34
`StrengthsTheme` rows are present and correctly spelled (`Self-Assurance` is the one to check).

Seed at least: an employee, their manager, a second unrelated employee, and a Super User.

---

## A. The seal holds *(FR-006, FR-007, FR-008 — the core promise)*

1. Both parties fill their half. **Neither submits.** Query `ReviewSheetItem` as each party through
   the read path: each sees only their own items.
2. Employee submits. Manager has not. → Employee still cannot read the manager's items.
3. Both submit. **Nobody has confirmed a meeting.** → **Still sealed.** This is the step the requester
   corrected; if the halves open here, the implementation is wrong.
4. Manager confirms the meeting. Employee has not. → Still sealed. One party cannot unseal by
   declaring a meeting alone.
5. Employee confirms. → `openedAt` is stamped, both halves are visible to both, and **both are now
   read-only**. Attempt an edit as each party and confirm it is refused.

**Expected**: sealed at steps 1–4, open and frozen at step 5, and at no point does a sealed half
appear in the payload sent to the client — check the network response, not the rendering.

## B. A quarter with no meeting produces nothing *(FR-009a)*

Fill both halves, submit both, never confirm a meeting, then move past the quarter end.

**Expected**: both halves stay sealed permanently; no outcome can be written; the next quarter's sheet
shows **no** carry-forward; nothing is published, summarised, or closed. A review that did not happen
leaves no trace that it did.

## C. Nobody outside the pair can reach anything *(FR-016, FR-031, FR-033, FR-035, SC-004)*

Attempt each of the following **directly** — by id, through the action and the page's data path, not
by looking for a button:

| As | Target | Expected |
|---|---|---|
| Super User | Another person's journal entry | Not found |
| Super User | Any review sheet, outcome, or 1:1 | Not found |
| **Super User impersonating the employee** | That employee's journal | **Refused — the module refuses while impersonating** (research R1) |
| HR Admin | Any of the above | Not found |
| An unrelated employee | Any of the above | Not found |
| A **new** manager, after the reporting line changes | A sheet written with the previous manager | Not found |
| Previous manager | That same sheet | Readable — it is their conversation |

The impersonation row is the one most likely to be missed: it passes only if the module uses
`requireRealUser()` everywhere and `requireUser()` nowhere. Grep for it:

```bash
grep -rn "requireUser" src/app/\(app\)/reviews src/lib/reviews src/app/api/reviews
# expected: no matches
```

## D. Promotion copies, it does not link *(FR-018, FR-030)*

1. Write a journal entry, promote it onto the sheet, then **edit and delete** the original.
   → The sheet item is unchanged.
2. Promote the same entry again. → No duplicate (the partial unique index).
3. Both parties promote the same 1:1 outcome. → One item **each**, on their own halves.
4. Pick strengths on a sheet, then replace the employee's strengths profile.
   → The recorded picks are unchanged.

## E. Both Gallup formats parse *(FR-025, SC-006)*

Upload the CliftonStrengths 34 report and the Top 5 report through the admin panel.

**Expected**: 34 ordered themes and 5 ordered themes respectively, from the same code path with no
format choice offered to the uploader; the printed name and assessment date shown for confirmation;
**nothing saved** until confirmed.

Then upload a non-Gallup PDF (any other file in the repo will do).

**Expected**: a plain statement that the report could not be read, and manual entry available in the
same session (FR-027). No guessed themes, and any unresolved rank reported as a gap rather than
filled in.

Reference extraction, already verified against both real reports in Node:

```
CliftonStrengths 34 → 34 themes, Relator … Empathy
Top 5              → 5 themes, Positivity, Includer, Woo, Responsibility, Developer
```

## F. The 1:1 boundary *(FR-019)*

Attempt to create a 1:1 between two employees who are not manager and report.

**Expected**: refused. Then confirm a legitimate 1:1 requires **both** acknowledgements before it
freezes, and that editing the outcome beforehand clears both.

## G. No money, anywhere *(FR-034, SC-008)*

Walk every screen the module presents — reviews list, sheet, journal, 1:1 list and detail, strengths
panel — and confirm no pool figure, claim, guaranteed benefit, medical commitment, or salary appears.

```bash
grep -rniE "pool|claim|salary|benefit|premium|EGP" src/app/\(app\)/reviews src/components/reviews
# expected: no matches
```

## H. The system pack agrees with Time-Off *(FR-036, research R6)*

For one employee in one quarter, compare the working days shown in the pack against the Time-Off
module's own figure for the same dates.

**Expected**: identical — because both come from `countWorkingDays` and the same holiday set. A
mismatch means a second counter was written, which is the thing R6 exists to prevent.

---

## Before handing over

- `npx tsc --noEmit` and `npm run build` clean.
- `ui-versions/` snapshot saved for every **existing** UI file edited (the sidebar/nav).
- Mockups approved **before** components were built (Principle II).
- Migration `067` applied by the deploy; the build log's `[apply-sql]` lines checked and the outcome
  reported to the user in one line.
- State plainly what was verified here and what could not be (the user's live Neon database cannot be
  tested from a session).
