# HR_ERP — Implementation Progress (Live Tracker)

> What is built, in progress, and next. Updated every working session.

---

## Status at a glance
| Phase | Status |
|-------|--------|
| 0 — Docs & specs | 🟡 In progress (spec-kit adopted; specs 001–007 done — all v1 modules specced) |
| 1 — Foundation (+ My Documents) | 🟢 Feature-complete (auth, registry CRUD, roles, profile, My Documents, seed) |
| 2 — Team Directory | 🟢 Complete (V1) |
| 3 — Onboarding | 🟢 Complete |
| 4 — Handbook & Resources | 🟢 Complete |
| 5 — Time-Off / Leave | 🟢 Complete (**v2** — working-day counts, holidays, full cycle; spec 035) |
| 6 — Benefits (admin config) | 🟢 Complete |
| 7 — Benefits (employee selector) | 🟢 Complete → 🔵 **redesigned to claim-based allowance (spec 018)** |
| 8 — Dashboard + polish | 🟢 Complete |
| — PWA / phone | 🟢 **Usable on a phone** (spec 010 + its 2026-08-25 extension — installable, and now navigable: a slide-in menu below `md`, safe areas) |
| 10 — Finance: petty cash & payback | 🟢 **Built** (spec 040 — custodian floats, period reconciliation, evidence, payback requests; migration `068`) |
| 11 — Finance: bank confirmations & salaries | 🟢 **Built** (spec 041 — the confirmer appointment **per business unit**, submissions with a frozen total, the CEO's confirmation screen, monthly salary runs, the daily nudge; migrations `069`, `070` + `075`) |
| 9 — Learning Track (LMS) | 🟢 **Built** (spec 038 — courses, live audiences, tracked progress, video gating, renewal, Excel import, course materials + resource library, a Learning manager appointment, a three-state status ladder + access-as-setup; migrations `060`–`066`) |
| 12 — Team Communications | 🟢 **Built** (spec 039 — one door with three options: the dashboard noticeboard, email to a chosen audience, and birthday & work-anniversary congratulations drafted by the platform and sent by a human; migrations `067` + `074`) |
| 13 — Reviews & 1:1s | 🟢 **Built** (spec 042 — quarterly review sheets sealed until both sides submit and both confirm they met, ad-hoc 1:1s, a private journal, Gallup strengths parsed from the uploaded report; migration `071`) |

## Payback missing from the Modules switch (fixed 2026-08-26 — no migration)

**Reported:** *"the pay back module is not appearing in the modules admin page to turn on and off."*

**Cause.** Admin → Modules doesn't discover modules; it renders a hand-written list
(`MODULES` in `src/lib/modules.ts`), and spec 040 added Payback to the nav without adding it
there. Nothing was broken — there was simply no switch.

**Fixed.** Payback is now on the list, and the switch actually holds: `/payback` redirects home
when it's off, and the submit/withdraw actions ask again, so a form left open in a tab can't post
past it. **Finance's payback queue is deliberately unaffected** (the CEO's call): switching it off
closes the employee door only, so money already submitted can still be decided and paid.

**Verified** against a real Postgres: with no flag row the nav keeps `/payback` and the page opens;
with the row off the nav drops it and the page redirects; back on and it returns. `npx tsc --noEmit`
and `npm run build` clean.

## Incentive: correcting a cycle on screen instead of re-uploading (built 2026-08-25 — no migration)

**Asked for:** *"the incentive scheme for the 3 tables of review and validation — allow me to
edit these tables by adding rows or removing or editing cells and then I press recalculate so
the rest of the tables are generated. rather than going back to the sheets and reupload again."*

**Built.** The three sheets at the top of a cycle report (People, Assignments, Contributions)
are now editable in place. **Edit tables** in the section header turns all three into a form —
every cell editable, rows addable and removable, contribution columns addable from the People
table and removable — and one **Recalculate** saves the three sheets and re-renders the page so
every section below (Business Partner Fee, contributor detail, commission, by-person, firm P&L,
profit share, cost recovery, watch list) regenerates from the stored rows. Uploading is
untouched and still replaces a whole sheet; it remains how a cycle is first loaded.

The decisions, all signed off from the mockup
(`design-mockups/incentive-review-edit/2026-08-25_editable-review-tables.html`):
- **Recalculate IS the save** — there is no second button, so the tables below can never show
  figures the database doesn't hold. Disabled until something changes; a gold **Unsaved edits**
  chip is on screen for exactly as long as the edits are only in the browser (tracking *dirty*,
  not *saved* — the rule the announcement editor taught us). **Discard changes** confirms first.
- **Every fault at once**, in a `role="alert"` banner that is scrolled to and focused, and
  nothing is written when any check fails.
- **Status is chosen, not derived.** The importer works status out from the closure-date column
  because a sheet has only that one column; the editor shows a dropdown and takes what was
  picked — setting a closure date does not silently re-decide it.
- **A client short of 100% still saves.** That is a payout rule (flag-and-block already excludes
  it and the Total column flags it red), not a save rule, so half-finished shares are storable.
  The Total column re-adds live while typing, so a client is *seen* to reach 100% first.
- **A rename follows the person** into Lead / BD / Lead source and their contributions column,
  applied on blur rather than per keystroke.

Code: `src/lib/incentive/review.ts` (the payload model, `toDraft`, and one pure `validateReview`
reusing the importer's now-exported `parseSheetNumber`, so a figure typed into a cell and one
pasted into a CSV cannot mean two different things), `src/lib/incentive/persist.ts` (the write —
deliberately **not** in the `"use server"` actions file, where every export becomes an endpoint),
`saveReviewTables` in `src/app/(app)/incentive/actions.ts` (access check → validate → write),
`src/components/incentive/ReviewTables.tsx` (the section, read and edit modes), and
`src/components/incentive/ReportSection.tsx` (the section shell and table cell classes, extracted
from `CycleReport` so the editor and the report can't drift apart). Snapshots:
`ui-versions/CycleReport/2026-08-25_before-editable-review.tsx`,
`ui-versions/incentive-cycle-page/2026-08-25_before-editable-review.tsx`.

**Verified:** `tsc --noEmit` clean, `npm run build` green;
`scripts/verify-incentive-review-edit.mts` **44/44** on a throwaway Postgres (round trip returns
identical shares and salaries; the ±1pp tolerance; all seven faults named at once; a 93% client
still saves; a typed "95,000" stored as a number; `eligibleToLead`/`utilization` carried across a
rename; removed rows and their contributions gone; two people trading names survives the unique
index; and the real `computeCycle` over the written rows unblocks the corrected client and pays
its lead). The existing engine checks still pass (`verify-incentive` 27/27, `verify-incentive-cycle`
16/16) — the parser rename didn't disturb the CSV path. The screen itself was driven in a real
browser end to end, which is where the missing `startTransition` around the save was caught:
without it React never reported the pending state, so the button neither said "Recalculating…"
nor blocked a second click landing a second write.

**Dates read as `14-Jul 2026` (same day, two follow-ups).** First asked: *"all should follow
the dd/mm/yyyy."* Then, on seeing it: *"for the dates across this part it should show in the
format of dd-mmm yy so 14-Jul 2026 just to make sure that the entries are correct."* That second
request is the settled one, and its reason is the design: a spelled month **cannot be read the
wrong way round**, so an operator typing compensation dates in off a spreadsheet can check at a
glance that what they typed is what landed. It is a **deliberate exception** to the platform-wide
dd/mm/yyyy standard, which is unchanged everywhere else.

`src/lib/incentive/dates.ts` is the one module that both formats and parses, so the displayed
value, the typed cell, the saved value and a CSV cell cannot disagree. Three things came out of it:
- **Display.** The read-back tables printed `2021-03-01`; they now print **01-Mar 2021**, built
  from the date's **UTC** parts — a date-only value is stored at UTC midnight, and reading it
  locally in a timezone behind UTC prints the day before. Nobody's start date should move because
  of where they are sitting.
- **Entry.** The editor's date cells are **typed text stating `dd-mmm yyyy`, not a native date
  picker.** The obvious `<input type="date">` was wrong: it draws itself in the **browser's** UI
  language, and measured in a real browser it rendered 1 March as `03/01/2021` under en-GB, ar-EG
  *and* en-US. A field whose format nobody can promise is not a field you type a closure date into.
  Cells accept the spelled month (short or full, any case), and dd/mm/yyyy and ISO unstated so
  nothing pasted in is needlessly refused; a made-up month, an unreal 31-Feb, or a bare number is
  refused by name — a bare number is an Excel serial only off a **sheet**, never when typed.
- **Import.** All-numeric sheet cells are now read **day-first**, which fixed a silent misread
  nobody had noticed: `new Date("01/03/2021")` is American, so an operator's **1 March was being
  stored as 3 January** — no warning, no wrong-looking output, just an assignment closing in the
  wrong quarter. ISO cells and Excel serials are unchanged, and a legacy m/d/y sheet still reads
  correctly wherever the middle field can only be a day. The templates emit `14-Jul 2026` too, so
  download → fill → upload round-trips unchanged.

The rest of the app was audited and was already compliant with its own standard — every other date
display goes through `formatDate` or an explicit `en-GB` format. Verified: the script grew to
**71/71** (the printed form, the typed-cell round trip in every accepted spelling, each refusal,
the day-first parse including the m/d/y fallback and the typed-vs-sheet serial split, and the
template round trip); `verify-incentive` 27/27 and `verify-incentive-cycle` 16/16 still pass on the
changed parser; and the browser confirmed `14-Jul 2026` typed, saved and read back unchanged, with
`31-Feb 2026` refused by name. Snapshot:
`ui-versions/ReviewTables/2026-08-25_before-ddmmyyyy.tsx`.

## A menu on the phone (built 2026-08-25 — no migration)
*"Make the application PWA so I can use from the mobile."*

The PWA half was already done — spec 010 shipped the manifest, the icons and the worker back in
August, and the app installs from Chrome and from Safari's Share sheet. What was not done was
**being usable once installed**. The sidebar is hidden below `md`, and the only mobile chrome was a
navy bar with the company name and a Sign out link. Driving a real phone viewport against a real
Postgres, from the Time-Off page exactly **two** links were tappable: Home, and one link inside the
page itself. Benefits, the Directory, the Handbook, Knowledge, Profile, Reviews, Payback and Admin
had no door at all — the dashboard tiles are contextual and cover at most five sections.

**Built.** A slide-in panel from a ☰ button in that bar, carrying the desktop list verbatim: same
sections, same order, same badges, the appointment/admin entries grouped under an "Also yours"
heading, the gold data-request notice, and the account block with Switch account and Sign out. It
closes on a section tap, the ✕, the page behind it, Escape, and any navigation; the page behind is
scroll-locked while it is open; every target is at least 44px. The button carries **one gold dot**
when anything is waiting — summed from the same derivations the menu itself renders, so it cannot
disagree with the list behind it. Plus `viewport-fit=cover` and two safe-area rules so the navy
header stops sitting under the phone's clock and content stops running into the home indicator.

**One list, three surfaces.** Adding a phone menu would have made the appointment/admin entries a
*third* hand-written copy (the collapsed rail and the expanded sidebar were already two). They are
now one `extras` array rendered by all three, so a module added here cannot appear on a desktop
screen and be missing from a phone. The one piece of variance the old markup had — Confirmations
counting in a larger pill than Manage Learning — is **carried in the data (`bigBadge`), not tidied
away**, because tidying it would have been an unapproved visual change to desktop.

**Proof (a real browser against a real Postgres, not reasoning).**
- **Desktop did not move.** The sidebar was screenshotted and its 20 nav rows measured (position,
  size, colour, weight, font-size) before and after. Expanded `240×900` and collapsed `64×900` are
  **byte-identical PNGs**; **0 of 20** rows differ. Re-run after the last edit, still identical.
- **22 phone checks green**: two links before, thirteen-plus after; each of `/benefits` `/directory`
  `/handbook` `/knowledge` `/profile` `/reviews` `/admin` `/confirmations` `/petty-cash` `/finance`
  reachable; Escape / backdrop / section-tap all close it; scroll lock applied and released;
  **Sign out from inside the panel actually signs out** (the submit-button trap, tested explicitly).
- **8 plain-employee checks green**: no "Also yours", no admin or finance doors, no account switcher,
  no gold dot, and her whole list fits without scrolling.
- **34 page loads** across 17 routes at 1280px and 390px: all 200, no console or page errors, the
  menu button present on every phone page and absent on every desktop page.
- `tsc --noEmit` and `next build` green.

**Two things found by measuring rather than reading.**
- The tap-target sweep failed first time: the ✕ was 36px and Sign out 16px, both desktop-sized. Fixed
  to 44px — same glyph, same type, just a target a thumb can land on.
- **`mobile-web-app-capable` was never missing.** The mockup claimed we emitted Apple's tag but not
  Chrome's; the served HTML says Next 15 renders `appleWebApp.capable` as the *modern* name and does
  not emit the Apple one at all. My "fix" therefore emitted the tag **twice**. Removed, and the
  published mockup carries the correction rather than a quiet deletion.

**Known and deliberately left.** `/admin/employees` and `/finance` still scroll sideways on a phone
(59px and 20px). Measured **identically with these changes stashed** — pre-existing, those pages'
wide tables, and out of scope for a navigation change.

## Confirmations, one business unit at a time (built 2026-08-25 — migration `075`)
The CEO: *"for the transaction confirmation we need it by business unit. as every business unit
might have an account to confirm and accordingly different people. that's in general."* The feature
had shipped with one company-wide queue.

- **Three decisions taken first**, then a mockup signed off before any component was touched: the
  unit is derived from who is being paid (never typed), salaries run per unit per month, and a unit
  with nobody appointed refuses rather than falling back to anyone. He corrected one thing on the
  mockup — *"there is no forefront group transactions now as it's not a business unit"* — so only
  real units appear and the feature creates none.
- **An appointment is a (person, unit) pair.** One person may hold several. There is no row meaning
  "every unit": a unit added next month starts with nobody, visibly.
- **A submission cannot mix two units**, because Finance's screen has no list containing two —
  `payableGroups()` is the shape it is built from — and `sameBusinessUnit` re-checks it on the
  server anyway, since a form can be posted by hand.
- **Everything narrows together**: the queue, the sidebar count, the emails, the daily nudge and the
  salary file are each limited to the units a person holds, all from one derivation.
- **Somebody with no business unit** is grouped, shown and unsendable — guessing a unit would mean
  guessing a bank account.
- **A bug the checks caught, not the output.** The upgrade expands each old company-wide appointment
  into one row per unit. On the first run it produced 2 rows where 10 were expected: the old
  one-row-per-person unique index was still in place, so every extra insert violated it and
  `ON CONFLICT DO NOTHING` swallowed the lot without a word. The drop now happens **before** the
  expansion. Separately, the no-business-units case was changed from warn-and-skip to **refuse**:
  a skipped file is recorded as applied and never runs again, which would have left one database
  nullable forever while a fresh one got NOT NULL.

**Verified:** all 77 migrations applied in order to a throwaway Postgres 16; the upgrade path run
against a database seeded in the old shape (two company-wide appointments across five units → ten
rows, keeping each original appointer and date; the existing submission attributed; both columns
NOT NULL; the old unique replaced by the pair); re-applied with no change; the no-units path proven
to refuse, then apply cleanly once a unit exists. The scoping itself was read back through the app's
own derivations — two people, three units, three submissions — showing each person's queue holding
only their own, `canDecide` refusing the other two by name, and the third unit unsendable for want
of anybody appointed. `npx tsc --noEmit`, `next build` and `npm test` (201) all clean.
**Not yet run against the live database.**

## The marketing float, with its history (built 2026-08-25 — migrations `072` + `073`)
The petty cash screen shipped empty: accounts are created by Finance in the app, and nobody had
made one. Rather than open the marketing float at its closing figure alone, the whole workbook was
imported at the CEO's request.

- **12 periods, 144 lines, Oct 2024 → Aug 2026**, generated by `scripts/import-marcom-workbook.mts`.
  That script — not the 1,100-line SQL file it emits — is the reviewable artefact: it states every
  mapping and every judgement call, and it refuses to emit anything it cannot check.
- **Each past month is settled** by a real funding row dated at its close, so the ledger explains
  its own arithmetic. **Aug 2026 stays OPEN owing 9,726.26** — the confirmed figure, and the one
  the whole import has to land on. It does, read back through `periodReconciliation` and
  `accountBalance` rather than by re-doing the sums.
- **Receipts stay where they are.** The workbook's receipts are Drive links, so `ExpenseEvidence`
  gained a second location (`externalUrl`, migration `072`, exactly one of the two enforced by a
  check constraint) and the serving route redirects after making the same 404-not-403 decision.
  123 lines carry a link; 17 have none and are named in their period's missing-receipt
  acknowledgement.
- **Two decisions were put to the CEO** before anything was written: the duplicate April–May tabs
  (`JUN-JUL` kept, `April- May` dropped — loading both would have counted 3,376.29 twice), and the
  three pre-March-2025 tabs that predate the sheet's petty-cash column (read as float spending).
- **What the workbook got wrong, reported not absorbed.** Four of its SUM formulas are short by a
  row. On `April` and `JUN-JUL` it is the TOTAL EXPENSES line (4,000 and 3,400), which the import
  derives anyway. On `Oct-Nov` and `JAN` the short SUM is the only total there is, so those months
  legitimately import higher than the sheet states — 47,769.23 against 35,229.23, and 13,276.45
  against 13,136.45.
- **Two of my own bugs, caught by checking against the sheet rather than by reading the output.**
  The first run read each old tab's SUM row as another purchase and silently DOUBLED Oct–Nov and
  Dec. The second trusted `JAN`'s column headers, which are wrong — its "DESCRIPTION" column holds
  the receipt link — costing every January line its receipt. Both now fail the parse instead.

**Verified:** all 76 migrations applied in order to a throwaway Postgres 16; `072` and `073`
re-applied with no change (idempotent); the import skips cleanly and imports nothing when no
custodian matches; balance read back through the app's own derivation as *"Forefront owes Raneem
Sarhaan EGP 9,726.26"*; `npx tsc --noEmit`, `next build` and `npm test` (192) all clean.
**Not yet run against the live database.**

## Spec 041 — Bank confirmations & monthly salary runs (built 2026-08-24 — migrations `069` + `070`)
Finance creates transactions in the bank and submits them here; the CEO confirms them at the bank
and marks them **Transaction complete**. The app notifies and records; it never gates money.

**Three corrections from the CEO shaped it**, each one changing the design rather than the wording:
1. *"I don't approve payments. I confirm the transaction in the bank."* — the first draft made the
   platform look like the gate. It is not; the bank is, on two signatures.
2. *"The finance doesn't send to bank, the finance creates transaction in the bank"* — and the
   button should say the transaction is **done**. State names carried the wrong verb, so
   SENT/CONFIRMED/SENT_BACK became SUBMITTED/COMPLETE/RETURNED before anything shipped.
3. *"The employee should receive the email connected to my financial confirmation"* — which reached
   back into spec 020 and pulled benefit reimbursements into the same flow.

**What that third one cost, and why it was right.** Since spec 020 a claim became Reimbursed and the
employee was emailed the moment Finance recorded a transfer — hours or days before the bank released
it. An audit found exactly **two** emails in the whole application that announce money reaching a
person; both now fire only on the confirmer's completion. Finance's one-step confirm on the claims
queue and the pay button on the payback queue are retired.

**One documented departure from house pattern.** `canConfirmBatches` reads the appointment table and
nothing else — top-level access does **not** confer it, unlike every other appointment in the
codebase. The instruction was that transactions wait for the appointed person and nobody stands in,
and an implicit power held by every admin account would make that promise false. Self-appointment
prevents lock-out.

**Two things the database caught that reasoning had not:** inserting the new status "before PAID"
put it after REJECTED, because the live type's order is not the order the schema declares; and a
database that had applied an earlier version of migration `069` would keep the old column names
forever, since an applied file never re-runs. `069` repairs such a database and `068` guards the
statements that would abort against a half-renamed table. Verified by building both a fresh and a
deliberately stale database and applying to each, twice.

**Verified:** both migration paths converge on the declared schema; `npx tsc --noEmit` and
`npm run build` clean, all new routes present; 149 tests pass, including that the summary line used
in email never says "batch" and structurally cannot carry a payee name. **Not yet exercised in a
running app**, and the migrations have not run on the live database.

## Spec 040 — Finance: petty cash floats & payback requests (built 2026-08-24 — migration `068`)
Replaces the MARCOM Expenses workbook the marketing manager emails Finance monthly.

**What it does.** A **petty cash account** has a named custodian and a signed balance: Finance
records top-ups, the custodian logs each spend with its receipt as they pay, and a **period**
closes with one arithmetic that carries its closing balance forward as the next period's opening
balance. Separately, **anyone** can raise a **payback request** with evidence; Finance approves,
declines with a reason, or records the transfer. One surface at `/petty-cash` serves both Finance
and custodians, gated per account by a single derivation.

**What the workbook taught, and what was built instead.**
- Its *"Amount to reimburse"* is **spent − float** on the `March` tab (3,444.54) and **float −
  spent** on `JUL-AUG` (−4,617.16) — the same circumstance, opposite signs. So the balance is
  derived **once** (`src/lib/finance/pettycash.ts`, pure — no Prisma), kept **signed**, and stated
  in words: *"Forefront owes Raneem 4,617.16"*.
- Its `Oct-Nov` overspend of 229.23 is carried into December by hand as a line item called
  *"December Overbudget"*. Carry-forward is now a first-class **opening balance**.
- Its `Status` column means "receipt attached" on some tabs and "Done" on others. *Missing receipt*
  is now derived from whether evidence exists, and **closing names the specific lines** that lack
  one and records which were waved through, by whom.

**Money.** `Decimal(10,2)` in Postgres (the ledger stays readable in Neon), integer **piastres**
for every calculation (`src/lib/finance/money.ts` is the only boundary). Amounts are **refused**,
never rounded — a rounded amount no longer matches its receipt.

**The lock.** `SELECT … FOR UPDATE` on the account row for exactly two writes — closing/reopening a
period, and writing a line or funding row. Petty cash has no ceiling to breach (a float may
legitimately go negative), so what is being protected is state: no line may land in a period being
closed, and an account may never have two open periods (partial unique index as the backstop,
checked in the action first so the operator sees a sentence).

**Access.** Finance and Super User everywhere; a custodian only on their own float; HR Admin
deliberately nowhere near it. One derivation (`src/lib/finance/access.ts`) asked by the pages, the
actions, the sidebar door and the evidence route. `/api/expense-evidence/[id]` re-decides on every
request and answers **404, never 403**.

**Email.** The **third** permitted workflow (constitution amended 2026-08-24 at the CEO's request):
submitted → Finance inbox, declined and paid → the requester. Petty cash sends none.

**Verified:** migration `068` applied twice against a throwaway local Postgres (second run a clean
no-op), the partial index proven to refuse a second open period while allowing a closed one, the
check constraint proven to refuse evidence with two parents and with none, seeds landing 3 sections
and 15 categories; `npx tsc --noEmit` and `npm run build` clean; 133 tests pass, including the
workbook's own figures. **Not yet verified in the live app** — no end-to-end pass against Neon has
been run by a person.

## Benefits: two reported wrong numbers, one cause each (fixed 2026-08-23 — no migration)
Both reported from live data; neither needed a schema change, and neither had mispaid anyone.

- **A newcomer's pool was not prorated.** On a short cycle every banded employee's ceiling scales to
  the cycle, but `poolCeiling`'s **sub-6-month branch** scaled by the **mid-joiner** fraction instead
  — which is **1** whenever a person's 3-month medical mark falls on or before the cycle's first day.
  Result: an employee under six months carried the **whole annual ceiling**, roughly double their
  colleagues, and the report showed no *prorated* tag to give it away. Reproduced with the real
  functions before touching anything (6-month cycle: banded 10,000 vs newcomer 20,000). Both branches
  now use the one `poolCycleFraction`; the 3-month vs 6-month threshold still decides *whether* there
  is a pool, never *how big*. Medical keeps its own ÷12 mid-joiner reduction on the **premium**.
  Fixed in `lib/benefits/pool.ts`, with the same figure now feeding the employee's own medical-only
  view (`benefits/page.tsx`) and **both** medical clamps (`benefits/actions.ts`,
  `admin/benefits/manual-actions.ts` → `ceilingCap`) — the clamp and the affordability refusal used
  to quote different ceilings. New regression test in `tests/pool-rules.test.ts` (106 pass).
- **A Loans claim read as if it emptied the pool.** The claims queue's *"their pool after this"*
  meter summed **every** non-rejected claim, so a 90,000 salary-driven Loans request showed "EGP 0
  left of EGP 22,500" in red — on that row and every other row of that employee's. Display only:
  every write path (submit, approve, HR record entry, reopen, medical) asks `poolStateFor`, which
  counts `catalogItemId` claims alone. The meter now counts flexible claims only, a guaranteed claim
  shows **"Not from the pool"** in that column instead of a meter, and the ceiling comes from
  `poolCeiling` rather than a local copy that disagreed with the report for anyone under six months
  and ignored raised ceilings. `admin/benefits/page.tsx` + `components/admin/ClaimsPanel.tsx`
  (snapshot: `ui-versions/ClaimsPanel/2026-08-23_before-not-from-the-pool-note.tsx`).
- **Watch for:** any under-six-month employee whose committed medical exceeds their now-correct
  smaller ceiling will start showing **over pool** in Reporting. Nothing new was spent — the old
  ceiling was wrong — and a Super User can RAISE the ceiling to accept it.

## Learning: every action on the course page was 500-ing (fixed 2026-08-25 — no migration)
- **Reported as** "adding people, accessibility and publishing gives an error", with two bare 500s
  in the browser console and no message — the digest-only Server Components error a production
  build gives.
- **One exported array.** `access-actions.ts` is a `"use server"` file and also exported
  `ACCESS_FIELDS`. Next validates a page's WHOLE server-action entry the first time any action on
  that page is called, so the array made every action on `/admin/learning/[courseId]` throw before
  it ran — *A "use server" file can only export async functions, found object.* The Everyone /
  Only-certain-people switch, adding people, removing a choice and Publish all POST to the page URL,
  which is why one fault presented as three and why none of them could report anything: the failure
  is in the action entry, above any code that could catch it.
- **Nothing catches this class.** It is not a type error and `next build` compiles it happily — the
  check is generated code that runs when the action module loads. The constant moved to
  `src/lib/learning/access-fields.ts` with the rule written beside it; a sweep of every other
  `"use server"` file in `src/` found no second instance.
- **Verified in a browser against a real Postgres**: before the fix, 500 on the visibility switch
  and no access fields rendered at all; after, three actions all 200 — visibility set, a person
  assigned, the course published. `npx tsc --noEmit` and `npm run build` clean.

## Learning: renaming and deleting a course (built 2026-08-25 — no migration)
- **Mockup-approved first** (`design-mockups/learning/2026-08-25_course-edit-and-delete.html`).
- **Both actions already existed on the server and nothing on screen reached them** — `updateCourse`
  and `deleteCourse` had no caller anywhere in `src/`. So a course could never be renamed after it
  was created, and a draft could never be thrown away, which is how the list filled up with them.
- **One ⋯ menu, two places**: each row of the Learning list, and the course's own header. Both drive
  the same rename panel and the same confirmation, so a course's name is changed in one place.
- **Delete asks in the row itself**, naming the course and saying what goes with it. A course
  anybody has started is **refused before the confirmation** rather than after it, and pausing is
  offered instead — the count comes from `_count.enrollments`, exactly what the write counts, and
  the server refuses again on its own authority.
- **A course's FILES are deleted with it.** Every child row cascades, but the cover, the uploaded
  documents and any file attached to a lesson live in blob storage and would have been left with
  nothing referencing them. They are gathered before the row goes and removed after it,
  fire-and-forget — a file that will not delete is litter, but a delete that reports failure after
  succeeding is a screen nobody can trust.
- **`updateCourse` no longer wipes a field the form did not carry.** It read an absent `category` as
  an empty string and wrote null, so renaming a course would have silently thrown away the category
  the workbook importer set.
- **Verified in a browser against a real Postgres**: renamed from both places, deleted a draft
  carrying a section, a lesson, a block and an audience rule (all four rows gone with it), and the
  refusal shown for a course with one person on it. `npx tsc --noEmit` and `npm run build` clean.

## Learning: course status ladder + access as a setup (built 2026-08-22 — migration `066`)
- **Mockup-approved first** (`design-mockups/learning/2026-08-22_course-access-setup.html`). The
  Excel template was deliberately left alone — who takes a course is set on the course, not in a
  sheet.
- **Three statuses**: Draft → Published → **Paused**. A pause stops everybody including anyone
  partway through, keeps all their progress, and reads as "Paused" rather than "Draft" in every
  list. Un-pausing re-runs the publish completeness check. Behaviourally identical to returning to
  draft — bought for the clarity, and that was said plainly before building it.
- **The Access tab is now a form**, not a routes table: Everyone / Only certain people, then seven
  named fields with multi-select tick-lists (searchable where the list is long), staged before Add.
  The word "route" is off the screen; the table is gone (the People tab already lists individuals).
- **Three defects fixed**, all found while reading the panel rather than reported:
  - a second "Everyone" lived in the audience dropdown, so a RESTRICTED course could reach the whole
    company — the form cannot create one, and existing ones are flagged with a one-click fix;
  - **every choice showed the same count** (everyone matched by ANY rule), so a choice reaching
    nobody looked identical to one that worked — now counted per rule through the same derivation
    the access check uses;
  - `audienceReach` was queried on every page load and never used.
- **Four dead public endpoints removed** — `addAudience`, `removeAudience`, `assignToUser`,
  `assignToGroup` were unused exports from a `"use server"` file, which makes each a live POST route.
- **Verified**: migration `066` applied twice on a throwaway Postgres 16 (`ADD VALUE IF NOT EXISTS`),
  `prisma migrate diff` reports **no difference**, and `scripts/verify-course-access.mts` **17/17**
  against a real database — including that an empty department counts 0 rather than widening, that
  the total is distinct people (4) and not the sum of the chips (6), and that a pause stops a
  mid-course learner while keeping their tick and their 42 watched seconds. `npm test` 105/105;
  `npx tsc --noEmit` and `npm run build` clean.

## Learning: a settings gear on the module page (built 2026-08-22 — no migration)
- **Mockup-approved first** (`design-mockups/learning/2026-08-22_learning-settings-menu.html`).
  *Who runs Learning* and *Manage groups* were grey text links between the page description and the
  buttons — reported as unfindable, and fairly: unadorned, no border, no icon, sitting where a page
  puts prose. They now live behind a gear at the top right, each with a line saying what it is.
- The grey links are **removed**, not kept alongside — two doors to one page would leave the same
  confusion. Menu closes on an outside click and on Escape; nothing else on the page moved.

## Congratulations seen ahead (2026-08-25 — no migration)
- **Asked for**: a list of upcoming congratulations with a period filter, and messages written
  early and scheduled to send. Mockup approved first
  (`design-mockups/communications/2026-08-25_congratulations-ahead.html`).
- **Scheduling was put to the CEO as a conflict and he declined it.** Automatic sending crosses the
  rule he set: nothing reaches an employee's inbox unless a person presses send. So the writing
  moved earlier and the sending did not.
- **Three periods** — due now, this month, this quarter — on both HR's screen and a manager's own,
  from ONE loader, so the two cannot drift about who may see what. Nothing is stored: the
  look-ahead is the existing occasion derivation asked with a wider window.
- **Write it now** creates a draft on demand for any future occasion. It does not bring the send
  forward.
- **Two bugs of mine, both found by driving the browser rather than by reading the code**: the "Due
  now" window pointed backwards, so a birthday two days away fell outside it; and the tab filtered
  to written drafts, so a birthday happening TODAY that nobody had written simply vanished — the
  exact case the screen exists to catch.
- **Verified**: `scripts/verify-communications.mts` **78/78**, including the send window at both
  ends and the look-ahead per role; `npm test` 188/188; all 21 scripts green (467 checks); `tsc`
  and `build` clean; and a real browser run through all three tabs and the write-early flow.

## Communications, combined (2026-08-25 — migration `074`)
- **Announcements folded into Communications** at the CEO's request: one door, three options split
  inside, each with its own settings and its own requirements. You choose by **where the message
  lands** — the dashboard noticeboard, chosen people's inboxes, or one person's. Mockup approved
  first (`design-mockups/communications/2026-08-25_communications-combined.html`).
- **Three options, not two, and it was a judgement call** — congratulations are written by the
  platform and sent by a manager to one person, which is not what an announcement is. Flagged for
  the CEO to overrule.
- **The old address redirects.** A bookmark that 404s teaches an operator the feature was deleted.
- **The email header said the wrong name, and my mistake was the interesting part**: the group line
  read `BrandSettings.companyName`, which names the PLATFORM. Reusing a field rather than adding one
  is usually right — but only when it is the same fact. Two ideas that merely look alike now have
  two columns, and the group name touches nothing outside these emails.
- **The audience panel is one button** instead of seven stacked sections. Shares the tick-list with
  Learning and nothing else; Learning's Access tab, where those seven ARE the subject, is untouched
  and re-verified (18/18 access, 21/21 audiences).
- **"Saved" was lying.** The reported symptom — a preview showing less than was typed — was not a
  stale preview. The green chip was set on a write and never cleared while the operator kept typing,
  so the screen claimed the draft was stored when it was not, and the preview was faithfully
  rendering the last thing actually saved. Saving and refreshing are one button now, and the chip
  tracks whether the screen matches the record.
- **The preview fits, and fixing it introduced a second fault worth recording**: removing the
  vertical scrollbar clipped the right-hand edge, because the email is a 600px table in a narrower
  panel. Caught by driving a real browser, not by reading the code. It now scales to fit — and the
  frame's own border had to move to the wrapper, because it ate 2px of the inner width and clipped
  the edge again, small enough to miss.
- **Verified in a real browser**, not only compiled: signed in, opened all four screens, typed,
  saved, and read the rendered iframe. The preview reports no overflow in either direction, the chip
  goes Saved → Not saved yet → Saved, both paragraphs reach the preview, and the header carries the
  group name and cannot carry the platform's.
- **Also**: migration `074` applied twice to a pre-074 schema (idempotent, no schema difference);
  `npm test` 179/179; all 21 verification scripts green (432 checks); `tsc` and `build` clean.

## Spec 039 — Team Communications (built 2026-08-24 — migration `067`)
- **Announcements** to a chosen audience and **personal congratulations** for birthdays and joining
  anniversaries. The third email workflow and the first BROADCAST one.
- **Specced, planned and tasked first** (spec → plan → tasks → implement), design approved as a
  mockup before any component was written.
- **The unit leads, the group endorses**: one template, the unit's colour on the header and button,
  the group above it in small caps and a gold hairline below. Body always dark on white.
- **Contrast is derived**: `surfaceFor` tries both inks and leaves five of six real brands
  untouched. The naive rule is kept as a failing-case test — it puts white on a coral at 3.44:1.
- **Nothing sends itself**: a second daily cron prepares drafts and nudges the line manager; it
  never emails an employee, and that is asserted rather than intended. A missed congratulation
  CLOSES rather than going out late.
- **The audience derivation is SHARED with Learning**, extracted to `src/lib/audience/` — not
  copied. Learning re-verified after the move (17/17 access, 35/35 materials, 26/26 manager).
- **Two constitution-level changes**, both recorded: email widened to three workflows (v1.3.0), and
  a second daily cron. The load-bearing half — no scheduled process emails an employee — untouched.
- **The manager self-serves** (G2 approved 2026-08-24,
  `design-mockups/communications/2026-08-24_manager-messages.html`): `/messages` shows only the
  drafts assigned to the person asking (`assignedToId: me.id`), so it needs no admin gate — and
  Communications is deliberately **not** a `MODULES` entry, because a listed module puts a nav
  door in front of everybody. The sidebar count renders only when something is actually waiting.
- **Verified**: migration `067` applied twice on a throwaway Postgres, diffed against the schema
  (only the house `updatedAt` line); `scripts/verify-communications.mts` **51/51**; `npm test`
  136/136; `npx tsc --noEmit` and `npm run build` clean.
- **Three test failures were real findings**, not noise: one caught a genuine bug (`surfaceFor`
  returned the input string rather than a normalised hex, so `#036` and `#003366` compared
  unequal); two were my own assertions testing the fixture rather than the rule, and were rewritten.
- **A fourth finding was a collision, not a failure**: this script's fixture ids (`alice`, `bob`)
  matched `verify-learning-us1`'s, and each script cleans only its own `@x.test` addresses — so the
  suite passed or failed depending on the order it was run in. Namespaced to `comms-*`, and both
  orders re-run clean.
- **Still the user's own**: gate **G3** — confirm each business unit's real brand colour is on its
  record in Admin → Brand (Visual Shift should read `#450059`). The email reads `primaryColor` from
  there, so a wrong record brands the mail with whatever it carries. And a **real test send** to a
  real inbox before the first announcement: how the HTML renders in Outlook, Gmail and Apple Mail
  is observed, not derived.

## Learning: a direct "Manage Learning" door (built 2026-08-22 — no migration)
- **Mockup-approved first** (`design-mockups/learning/2026-08-22_manage-learning-nav.html`). A
  learning manager now reaches the module in ONE click from a gold sidebar entry carrying the
  suggested-resources count, instead of passing through an admin home that held a single row.
- **HR's sidebar is untouched** — the two doors are mutually exclusive, so nobody ever sees both.
  Proven, including the odd case of an HR Admin holding a stray appointment row.
- **The dead end is closed**: `/admin` redirects a manager to the module, `/admin/learning` drops
  its "← Admin" link for them, and the one-section admin home was **retired** rather than left
  unreachable.
- **The icon is new, not reused** — the Admin shield with a mortarboard inside. `AppShell` already
  carried a comment about what a lookalike nav glyph cost once before.
- **Verified**: `scripts/verify-learning-manager.mts` **26/26** against a real database, using the
  same expressions the layout uses so the test cannot drift from the door it checks. `npm test`
  105/105; `npx tsc --noEmit` and `npm run build` clean.

## Learning: a manager who runs the module and nothing else (built 2026-08-22 — migration `065`)
- **Mockup-approved first** (`design-mockups/learning/2026-08-22_learning-manager.html`), option
  **A** chosen: **HR oversees, it does not gate.** A learning manager publishes their own courses;
  nothing waits for approval. The alternative (a publish approval queue) was drawn and declined —
  you appoint someone precisely so training stops queueing behind HR.
- **An appointment, not a role.** `LearningManager` is a table; the person stays an `EMPLOYEE`. No
  new `Role` member means no new value for Benefits, Time-Off or the salary guard to be right
  about — which is why this cannot leak into them, structurally rather than by care.
- **ONE derivation**: `canManageLearning` (role OR appointment) is asked by every Learning admin
  page and action, the Admin door in `(app)/layout.tsx`, the draft-preview route inside
  `courseAccessFor`, and the document-serving route. Nothing reads `isAdmin` for Learning any more.
- **HR cannot be locked out**: HR Admins and Super Users hold Learning with no row at all, and are
  shown on Setup as "always" with no Remove button.
- **A manager cannot appoint another manager** — `settings-actions.ts` is `requireAdmin()`. They see
  the list read-only.
- **Their admin home shows one section**, and the other modules' counts are not fetched at all —
  not merely unrendered.
- **Verified**: migration `065` applied twice on a throwaway Postgres 16, `prisma migrate diff`
  reports **no difference** against `schema.prisma`, and `scripts/verify-learning-manager.mts`
  **20/20** against a real database. Every other admin page re-checked for its own guard (all
  `requireAdmin`/`requireSuperUser`; the two guard-less ones are pure redirects). `npx tsc
  --noEmit` and `npm run build` clean.

## Learning: course materials, resource library & rating (built 2026-08-22 — migration `064`)
- **Mockup-approved first** (`design-mockups/learning/2026-08-22_materials-v2.html`), then built.
  Four surfaces: a **Materials** tab on the course builder, the employee **Materials & resources**
  curriculum entry, the **finish panel** (rating + suggest a resource), and HR's **suggestions
  queue** on `/admin/learning` with a gold badge on Admin home.
- **Three fixed document slots** — outline, expanded outline, slides. **Only the slides reach
  employees**, and that rule is written once (`EMPLOYEE_VISIBLE_SLOTS`) and re-decided by
  `/api/learning/documents/[id]` on every request, answering 404 (not 403) for an HR-only slot so
  it does not confirm the file exists. A PDF **previews in the page**; a .pptx cannot in any
  browser, so it gets a download button and the admin slot says so rather than showing an empty
  viewer.
- **Employees grow the library.** Anyone with course access may suggest a resource — from the
  course page at any time, or from the finish panel. It lands PENDING and is invisible to every
  employee until HR approves it; HR may fix the name or link first, and **declining is silent**.
  An approved suggestion shows as "suggested by a colleague", never a name.
- **Rating is anonymous and never blocks.** 1–5 on completion, optional. `userId` is stored only so
  one person is one score and nobody is asked twice; no screen attributes a rating. A renewal
  UPDATES the row, so retaking cannot skew an average. Skipping is durable
  (`ratingPromptDoneCount`), and a renewal asks again by itself — no flag to reset, no job.
- **Verified**: migration `064` applied twice on a throwaway Postgres 16 (idempotent), the resulting
  schema diffed against `schema.prisma` (only the house `updatedAt DEFAULT` difference documented in
  `060`), and `scripts/verify-course-materials.mts` **35/35** against a real database. `npx tsc
  --noEmit` and `npm run build` clean.
- **Deliberately not built**: categorising resources by type. With three items it would be
  scaffolding; worth doing once a course carries more than a handful.

## Spec 038 — Learning Track: courses, assignment & tracked progress (built 2026-08-21 — migrations `060` + `061`)
- **Phase 9 built for real**, adapted from `ahmedgalal-lang/FFLMS` (confirmed ours to reuse). HR
  authors courses (course → **CourseSection** → lesson → blocks), publishes behind a completeness
  gate that names the first specific gap, and routes them to people; employees work through them
  with tracked progress. Aligned first: **HR/Admin authors only** (no instructor role), **both**
  registry-derived audiences and ad-hoc groups, core learning loop only for v1.
- **Audiences are RULES, not expansions** — a `CourseAudience` row stores "the Consulting
  department" and is resolved live, so a new joiner is picked up with nobody re-running anything.
  A **tenure** audience compiles to a `startDate` RANGE, never the stored `tenureBand` column,
  which is derived and can be stale. Rules union; a broken rule reaches nobody rather than everyone.
- **One access derivation** (`src/lib/learning/access.ts`) across four routes — direct assignment,
  group, live audience, and **being mid-course**. Grandfathering is *derived*, never a flag, so none
  of the six paths that can remove a route has to remember to set anything. Assignment ≠ enrollment:
  the enrollment is created on **first open**, which is what makes "never started ⇒ lose it
  immediately" expressible at all.
- **Reopening (Q1-C)**: an edit raising a published course's required set re-counts affected people
  *inside* the write and **refuses** without an explicit choice — the dialog is an affordance, the
  refusal is the guarantee. Completions are superseded, never erased (`firstCompletedAt` kept).
- **Video is linked, not hosted** (unlisted Vimeo/YouTube or a direct file). Blob is private here
  and `blob-serve.ts` implements no HTTP Range, which seeking needs. Google Drive plays but cannot
  be measured, so a gate or checkpoint on one is **refused**, not silently ignored.
- The watch gate is decided server-side from stored watched/duration seconds. **Stated limit**: the
  duration originates from the player, so it stops people clicking past training, not someone
  determined to forge it. Closing that means calling Vimeo/YouTube — deliberately not in this release.
- Rich text is **markdown via react-markdown** (as Knowledge already does), so the module needs no
  HTML sanitiser and no `dangerouslySetInnerHTML`.
- Verified: **75/75** unit tests (progress, audience incl. a cross-check that the SQL and in-memory
  forms select the same people, and the 4-route access matrix); **22/22** US1 and **21/21** US2–US4
  against a throwaway Postgres 16; **5/5** on the watched-seconds `GREATEST` incl. the two-tab race.
  Migrations `060`/`061` applied twice (second run a no-op), zero drift beyond the house-standard
  `updatedAt` default. `tsc` + `build` green.
- **Manager team view** added same-day on request: `/learning/team`, gated on the org chart
  (`isManager`), showing current direct reports and their progress. Read-only, no route
  information — that stays with HR. Verified 14/14 (direct reports only, not the tree below;
  reporting-line moves take effect immediately both ways; leavers drop off).
- **Optional per-course renewal** added same-day on request (migration `062`): a course may fall
  due again after 6/12/24/36 months, defaulting to never. Lapsing is DERIVED from the completion
  date — no flag, no cron — so a period change re-evaluates everyone instantly and nothing can be
  missed or run twice; ticks clear only when the learner returns, and their first completion and
  completion count survive. HR sees how many people would lapse immediately before saving.
  Verified 12/12 + 15 unit tests.
- **SC-005 scoped honestly** on user decision: the watch gate measures honest engagement, not
  cheating. It is server-decided from stored seconds, but the duration comes from the player;
  querying Vimeo/YouTube for the true length was considered and declined.
- **Deferred and named in the spec**: quizzes, gradable assignments, certificates (incl. the
  Arabic-capable PDF), discussions, notifications, analytics, roster export, learning paths.

## Spec 037 — Official holidays: verification, bridges & team announcements (built 2026-08-19 — migration `057` applies on deploy)
- **The log grew up.** `PublicHoliday` moved from a single unique date to two date **ranges** —
  `original*` (announced, frozen) and `actual*` (observed, what every count reads) — plus a
  `TENTATIVE | VERIFIED | MOVED` status, `FETCHED | MANUAL` source, and verification stamps. A
  multi-day holiday like Eid is **one entry**. `lib/workdays.ts` (the one counting engine) is
  untouched; `getHolidaySet` expands ranges into its day-key input.
- **Fetch, don't type.** HR pulls a year from Nager.Date as **suggestions only** — grouped so
  consecutive days of one holiday arrive as a single entry — and confirms what's real. A re-fetch
  whose prediction moved offers "apply as move". Actual ranges may never overlap (server-enforced).
- **Verification.** A daily **Vercel Cron** (`/api/cron/holidays`, `CRON_SECRET` — the app's first
  scheduled job) reminds HR once per holiday inside a configurable lead (default 14 days, set on
  Admin → Notifications). It can never email employees.
- **Announcements.** Deterministic bilingual drafts (English then Arabic, warm, with bridge and
  long-weekend callouts) that **only a human sends**. Each send snapshots its dates, which flags
  "announced with an outdated date" and makes the next draft a correction. Bulk, fire-and-forget.
- **Employees.** A live dashboard banner (visible to people who joined after the email, clears
  itself once past) and a one-click CTA that opens the normal request form prefilled with the
  bridge — normal manager approval, normal counting. An already-booked range shows its status
  instead of inviting a duplicate.
- **Care for the edges.** Moving a holiday onto someone's booked leave emails them the day was
  returned; past-dated edits need explicit confirmation; a holiday landing on the weekend is
  described honestly rather than inviting a break that doesn't exist.
- Verified: migration `057` proven on a throwaway Postgres (legacy rows backfill, old column
  dropped, re-run idempotent, **zero drift** vs `schema.prisma`); cron exercised live (401 without
  the secret, `{"reminded":1}` then `{"reminded":0}`); fetch + grouping checked against the real
  2026 Egypt data; drafts rendered for bridge / multi-day / weekend-only / correction cases.
- **Deployment:** `057` is applied automatically by `scripts/apply-sql.mjs` in the Vercel build —
  verified by replaying a production-shaped database (legacy rows + a ledger through `056`) through
  the real runner: it applied exactly `057`, backfilled the legacy holidays, and a second run
  applied nothing. **Action required:** set `CRON_SECRET` in Vercel so the daily job can run.

## Claims: HR can reopen a rejected claim (2026-08-19, built — no migration)
- A rejection was terminal. HR Admin / Super User can now **Reopen** a rejected claim from the
  ledger with a **required reason**: it returns to the review queue (never straight to Approved —
  money keeps flowing through request → approve → pay), the reason lands in the ledger trail, and
  the employee is emailed that the decline no longer stands (they had already had the decline mail).

## Time-Off badge liveness fix (2026-08-19)
- The nav badge only re-checked on mount, tab focus and a 45s timer, so it sat on a stale number
  while the page below already showed the truth. The page now signals it the moment its request
  state changes (submit/approve/decline/cancel, and after marking a decision seen); it also
  re-checks on `visibilitychange` for returning to the app on mobile.

## Post-036 live-testing round (2026-08-18, built — no migration)
- [x] **Essam bug**: a granted sub-3-month (or no-start-date) employee saw only the service-gate notice — a grant now overrides EVERY gate: the granted band renders beneath the notice (with a pointer sentence), fully requestable. Verified end-to-end (no-grant control unchanged; granted card at the typed amount; request accepted).
- [x] **"Exceptional releases" tab** on Benefits Management (user request): the Release Guaranteed Benefit sheet moved off its standalone page into the tab (old URL redirects; header button removed; picker switches client-side over the new `buildReleaseSheet` lib), with the **Individual grants** panel underneath it (SU-only; Amounts is config-only again). Claim-guard, granted markers, and releasing verified inside the tab; HR Admin gets the sheet without the grants panel. Grant removal now also refused after a **release** (auditability).
- [x] **Dashboard cleanup** (user request): Quick links section removed (duplicated the cards + nav); cards are **Benefits · Time-Off · Approvals (managers only) · Onboarding (while in progress)**; Team Directory card dropped (nav item remains).
- [x] 22/22 production checks across the three changes.

## Spec 036 — Per-person guaranteed-benefit grants (built 2026-08-18 — Neon migration `056` applied)
- [x] Aligned (any blocking reason; typed amount pre-filled where derivable; open cycle only; Super-User managed), mockup **signed off** (`design-mockups/benefit-grants/2026-08-18_grants.html`), spec at `specs/036-guaranteed-benefit-grants/`. Replaces the same-day-reverted Release-sheet override.
- [x] `GuaranteedBenefitGrant` (user × benefit × plan year unique, amount, grantor, date) — `prisma/sql/056_benefit_grants.sql`.
- [x] **Individual grants panel** (Admin → Benefits → Amounts, SU-only): per-benefit grants table (reason chip, amount, grantor · date, Remove / *requested — can't remove* lock), add-row with block-reason-labelled employee picker + pre-filling amount; server actions `addGrant`/`removeGrant` (duplicate + zero-amount + salary-driven + non-active refused; removal refused over a non-rejected claim).
- [x] **Normal-channel honor**: `claim-actions` (grant passes eligibility, granted figure = allocation, never re-prorated, wins over band); the employee page serves granted people every path — full board (amount overridden/appended), the under-6-months medical-only view (guaranteed band added), and a new **grants-only** view for people with no employment type; `manual-actions` + `release-actions` + the Release sheet honor granted amounts (gold *granted* marker); once-per-cycle guard + state chips unchanged and verified for granted people.
- [x] **Verified against a production build**: **27/27** — reasons in the picker (part-time / no type / under 6 months / already eligible), prefill, disabled-without-amount, typed-amount storage, HR-Admin sees no panel, the under-6-months and no-type request journeys end-to-end (request → normal HR queue approve → paid → ✓ Received), removal lock and unused removal, sheet marker + release at granted amount + claim-guard block.
- [x] Neon migration `056` applied (user-confirmed 2026-08-18) — grants live in production.

## Live-testing round (2026-08-18, built — no migration)
- [x] **Guaranteed cards show the true state**: employees who already requested / were paid / were released see a chip (gold *Requested — in review*, green *✓ Received* / *✓ Received — released by HR <date>*) instead of a Request button the server would refuse; PROOF benefits keep the button while a remainder is genuinely claimable. 7/7 production checks.
- [x] **Release sheet renamed "Release Guaranteed Benefit"** (page + entry button). A typed-amount Super-User override shipped and was **reverted the same day** on user feedback — the real need is ineligible employees getting the benefit through the normal request→approve→pay flow, which the sheet (a payroll record) can't provide; per-person **eligibility grants** are the planned solution (next spec).
- [x] **Time-Off**: the request form's day-count chip switched gold → **navy** (informational; gold stays for the overlap notice — user-approved), and HR can **Remove any request** from `/admin/time-off` (mistaken entries; confirm-guarded, admin-only hard delete; derived counts adjust automatically).
- [x] **Guaranteed benefits — once-per-cycle guard**: the Release sheet skips (server-side, with a named count) anyone already holding a non-rejected claim for that benefit this cycle and marks their rows unselectable (*Claim submitted / Approved / Reimbursed*); the employee claim path and HR Record-entry now count `BenefitRelease` rows as consumed allocation, so nothing can pay the same guaranteed benefit twice (the Summer-allowance double). All three paths verified in a production build, incl. a DOM-forced bypass attempt refused server-side.
- [x] **Data-request popup**: **Finish → Submit**, which only closes when every listed field is confirmed/filled — otherwise a red message counts what's left ("2 fields are still waiting…" → "1 field…"); Later still dismisses. Verified end-to-end (confirm-one/fill-one flow, answers on the profile).
- [x] 24/24 production checks across the three fixes.

## Spec 035 — Time-Off v2: working-day counts + complete cycle (built 2026-08-18 — Neon migration `055` applied)
- [x] Preceded by a **full module audit** (17 automated checks on the spec-005 cycle — all passed; gaps documented) and alignment: **no limits, count only, per calendar year; Fri+Sat weekend; HR-managed public holidays (+ Excel bulk upload, added at approval); no leave types; count visible to employee/manager/HR**. Mockup signed off (`design-mockups/timeoff-v2/2026-08-18_timeoff-v2.html`); bridge/long-weekend suggestions deferred to a later round at the user's request.
- [x] `src/lib/workdays.ts` (pure, UTC-day): `countWorkingDays` / `workingDaysInYear` / `takenInYear` — shared verbatim by the server and the client form preview. `PublicHoliday` table + `LeaveRequest.cancelledAt` in **`prisma/sql/055_timeoff_v2.sql`**.
- [x] `src/lib/leave-queries.ts`: current-org-chart approval queue (`pendingApprovalWhere` — orphans go to every Super User), `canDecideLeave` (current manager or HR/SU fallback; snapshot is history), `closeLeaverPending` (reconcile-on-read), `takenByUserForYear`, `timeOffBadgeCount`.
- [x] Employee page: year-count card, live working-day preview with breakdown, self-overlap warning (warn, not block), zero-working-day refusal (client + server), Cancel on pending + **Cancel trip** on approved-future (frees the count; "was approved — cancelled" trail). Manager cards: working days + requester's year chip; overlap pool now includes reports' approved trips.
- [x] Live nav badge both directions: `/api/time-off/badge` + `TimeOffBadgeSync` (poll on mount/focus/45s → `hrerp:timeoff-count` → AppShell), layout paints the first frame via `timeOffBadgeCount`; dashboard Approvals tile uses the same query.
- [x] Admin: Working-days + **Taken <year>** columns, current-manager approver label on pending rows, cancelled-by-employee annotation, **Public holidays** page (list by year, add/remove, pre-filled Excel template + bulk upload with bad-row reporting), decider recorded on `approverId`.
- [x] **Verified against a production build** + throwaway Postgres: **34/34** checks — 4-working-day preview breakdown (7 calendar − 2 weekend − 1 holiday), template round-trip + upload (2 imported, 1 bad row reported, no duplicates), live badge appear/clear without reload, re-route on reporting-line change (old manager loses it, new manager decides, decider recorded), orphan → every-SU queue, leaver auto-close, year-boundary split (4 of 6 days in 2026), cancel-approved trail, employee refusals (holidays page + template route).
- [x] Neon migration `055` applied (user-confirmed 2026-08-18) — public holidays + cancel-approved live in production.

## Spec 034 — Benefits Reporting (built 2026-08-18 — no migration)
- [x] Aligned (engine-identical pool math incl. pending; cycle picker; HR Admin + Finance + Super User; popup detail; formatted Excel; leavers behind a filter; "No pool" rows kept visible), mockup **signed off** (`design-mockups/benefits-reporting/2026-08-18_reporting-page.html`), spec at `specs/034-benefits-reporting/spec.md`.
- [x] `src/lib/benefits/report.ts` — the one report builder (page + Excel share it): per employee, ceiling via `deriveTenureBand` + ceiling table + `poolCycleFraction`/`prorate` (sub-6-month employees get their medical-only entry ceiling at the 3-month mid-joiner fraction, exactly as their own page does), medical via the bulk equivalent of `getMedicalCommitment` + `medicalCycleCharge`, flex used = non-rejected catalogue claims (pending kept in and ALSO split out), guaranteed = releases + guaranteed claims (never pool), per-cycle `flexCapEnabled`, status chip (No pool / No activity / Active / Pending review (n) / Pool exhausted). Nothing denormalised.
- [x] Page `/admin/benefits/report` (gated `requireBenefitsReporting` — HR Admin/Finance/Super User; Finance gets a back link to Payments instead of Benefits Management) + client `BenefitsReportTable` (cycle picker defaulting to the open cycle, department/status/search/leavers filters, sortable columns, tiles = the VISIBLE table's sums, row-click popup with ceiling derivation / medical people / guaranteed items / claim-by-claim incl. rejected history + proof links). Read-only throughout.
- [x] Excel export `/api/admin/benefits/report/export` in the house workbook style (navy header, frozen panes, autoFilter, sized columns); the page passes its CURRENT filters on the URL and the route re-applies them, so the workbook always matches the visible table.
- [x] Entry points: **Reporting** button on Admin → Benefits; **Benefits report** link on Finance → Payments.
- [x] **Verified against a production build** + throwaway Postgres: 46/46 checks — row figures equal the employee's own Benefits page (SC-001: 30,000 / 9,600 cross-checked in the same run), tiles follow every filter, leaver hidden/included, rejected claim counts nowhere but history, popup totals reconcile, Excel figures + prorated-from note + leavers param, Finance access, employee refused (page redirect + export 307).

## Finance payments sub-tabs (2026-08-18, built — no migration)
- [x] `/finance` split into two sub-tabs via the house `AdminBenefitsTabs`: **Payments confirmation** (gold badge = APPROVED awaiting) and **Medical recoveries** (red badge = OPEN recoveries). Toasts stay above the tabs; snapshot `ui-versions/finance-page/2026-08-18_before-subtabs.tsx`. Browser-verified in the same 46-check run (badge counts, tab switch, queue + recoveries panels).

## Data-request tracker liveness fix (2026-08-18)
- [x] Reported: tracker showed **Pending** while the freshly downloaded Excel said **Complete**. Root cause: both read the SAME query (`campaignTracker`) — the tracker in the browser was a **stale render** (answers landed after the page was drawn; the download link always hits the server fresh). Same family as the dead-badge bug: a server page never re-renders on its own.
- [x] Fix: `src/components/AutoRefresh.tsx` (router.refresh on window focus + every 30s, only while visible) dropped into the tracker page and the campaigns list. Snapshots in `ui-versions/data-request-tracker/`. Verified end-to-end: settle a field in the DB while the tracker sits open → chip flips to Confirmed and the counter to 1/1 on a focus event, **no reload**.

## Admin Benefits management views (2026-08-16, built — no migration)
- [x] Mockups built and **signed off** before any component was touched: `design-mockups/medical-commitments/2026-08-16_management-view.html` and `design-mockups/benefits-claims/2026-08-16_claims-queue.html` (rail revised on review to counts-first: Eligible · Committed · Needs attention · Committed premium last).
- [x] **Medical commitments** → `components/admin/MedicalCommitmentsPanel.tsx`: rail, filter chips + search + click-to-sort, one row per person, per-cycle split behind the opened row, **Manage** panel with per-person age→band working and a live "was X → Y" delta, and a **Not committed** chase list naming DOB-blocked employees. Every figure/wording/action from the old always-expanded list is kept.
- [x] **Claims** → `components/admin/ClaimsPanel.tsx`: review queue (waiting time, **pool-after-this-claim** meter, proof, Approve/Reject, **bulk approve**) + searchable, totalled **ledger** of decided claims. New `approveClaims` action shares `approveOne` with the single-claim path, so the bulk bar saves clicks and never checks.
- [x] Page rewired (`admin/benefits/page.tsx`): new eligibility/not-committed query, per-claimant pool context, `reviewedBy`/`paidBy` for the ledger, dependant DOBs for the Manage preview. Dead imports removed. **UI snapshot** saved to `ui-versions/admin-benefits-page/2026-08-16_before-commitments-and-claims-redesign.tsx`.
- [x] **Verified**: `npx tsc --noEmit` + `npm run build` green; `scripts/verify-benefits-admin-panels.mts` **22/22** against a throwaway Postgres 16 (eligibility incl. LEFT/new-joiner/no-DOB, premium = summed age bands, carry-over + this-cycle = premium, over-charge quantified, cancelled charge never counted as carried, prorated ceiling on a 6-month cycle, rejected claim releases allowance, cap detection, queue/ledger split, and `approveClaims` refusing without an admin session). Both panels also SSR-rendered with the no-DOB and no-pool-ceiling edge rows — no NaN/undefined.
- [x] **Admin attention signals** (same mockup round): Benefits & Time-Off promoted to the first admin-home section; needs-attention pill + breakdown tags on the Benefits, Time-Off and Change Requests cards; red badge on the **Medical** tab, gold on **Claims** (renamed from "Submissions & Claims" per the mockup). Shared predicate in `src/lib/benefits/attention.ts` so card, badge and row chip agree by construction. UI snapshots saved for the admin home, the benefits page and `AdminBenefitsTabs`.
- ⚠️ **Not verified from here**: the rendered screen in a browser (the page is admin-gated), so the visual pass is still owed on review.
- [x] Special events note: **maternity removed** — now "Newborn · compassionate" in `prisma/sql/003_seed_benefits.sql` and `specs/012-benefits-coverage/concept.md`. The live row was changed by the user directly; no migration written.

## Spec 026 — Password-less linked-account switching (built; no migration)
- [x] Spec-kit run: `specs/026-passwordless-account-switch/` (spec, plan, research, data-model, contracts, quickstart, tasks — 30/30 tasks done; requirements checklist 16/16).
- [x] **Supersedes spec 025's password-per-switch decision** — marked in place in `specs/025-…/spec.md` and above, so the two specs never silently disagree.
- [x] `src/lib/switch-account.ts` — the shared `isLinked` predicate (both ACTIVE, not self, **trimmed non-empty** Employee IDs equal) plus 60-second HMAC ticket mint/verify over `AUTH_SECRET`. **No new dependency, no new env var, no migration.**
- [x] `switch-account` credentials provider in `src/lib/auth.ts` — verifies the ticket **and re-reads both employee records**, re-running `isLinked` before issuing a session (its callback route is publicly POST-able, so nothing it receives is trusted). Fails closed on any error, incl. an un-migrated DB.
- [x] `switchAccountAction` rewritten: clears impersonation **first**, verifies session + link, mints the ticket, signs in as the target. Refusals are indistinguishable (never reveals whether an account exists); self-switch is a silent no-op.
- [x] Sidebar list in `(app)/layout.tsx` filtered through the **same predicate**, so what is offered can never exceed what is permitted — this closed a latent gap where a **whitespace-only** Employee ID counted as a link.
- [x] **No UI change** (the switcher's markup is untouched), so no `ui-versions/` snapshot was owed.
- [x] Verified: `npx tsc --noEmit` + `npm run build` green; `scripts/verify-switch-account.mts` **27/27** against a throwaway Postgres 16 — forged ticket, tampered target, correctly-signed **expired** ticket, unlinked target, LEFT target, and a **link revoked after the ticket was minted** all refused; the happy path issues the target's session.
- [x] Session lifetime **unchanged** (NextAuth default 30 days) — reviewed and deliberately kept.
- ⚠️ **Accepted residual risk** (product decision 2026-08-15): a **mistyped shared Employee ID links two different people** and now grants password-less access between them; an unlocked device reaches every linked account; an **elevated-role** linked account is reachable with no password. A role-gated password step was offered and declined for the simpler flow — it remains the named mitigation. See `specs/026-…/spec.md` *Residual Risks*.
- [ ] Depends on spec 025's **`040_employee_id.sql`** already being applied to Neon (no new migration of its own).

## Spec 025 — Employee ID + linked-account switching (built, pending Neon migration `040`)
- [x] Spec `specs/025-employee-id-account-switch/` (aligned; checklist passes). Interim toward spec 022.
- [x] Schema: `User.employeeId` (nullable, **non-unique**, indexed). Migration `prisma/sql/040_employee_id.sql` — verified on a throwaway Postgres (additive, idempotent; two accounts share an Employee ID; linked-accounts query returns only same-ID actives).
- [x] Field on employee **form + grid + CSV** (export/import); link-confirm guard on the form (`employeeIdLinkGuard`), inline grid blocks a linking duplicate.
- [x] **Account switcher** in the sidebar (`switchAccountAction`). Suppressed while impersonating; never lists unlinked/inactive accounts. ⚠️ The password-per-switch step described here was **superseded by spec 026** (2026-08-15) — switching is now password-less.
- [x] `npx tsc --noEmit` + `npm run build` green. AppShell snapshot saved. Docs updated (this file, PROJECT_DETAILS, spec 025).
- [ ] **Apply `040_employee_id.sql` to Neon**, then set the same Employee ID on the dual-contract person's two records to link + enable switching.

## Spec 024 — Multi-brand by business unit (built, pending Neon migration `039`)
- [x] Spec-kit run: `specs/024-multi-brand-business-units/` (spec, plan, research, data-model, contracts, quickstart, tasks).
- [x] Schema: `BusinessUnit` model + `User.businessUnitId` FK + index. Migration `prisma/sql/039_business_units.sql` (table + FK `ON DELETE SET NULL` + seed 3 units) — **verified on a throwaway Postgres**: applies to a pre-039 schema, idempotent, assignment round-trips, SET NULL works.
- [x] Lib: `src/lib/business-units.ts` (list, usage counts, name normalize/dedupe, brand lookup). `getBrand()` made **viewer-aware** (effective/impersonated user's unit brand, per-attribute merged over default; pre-auth/no-unit/error → default).
- [x] US2 admin: `/admin/business-units` (Super User) + `BusinessUnitsManager` (reuses `BrandColorField`) + actions (add/update-brand/rename/remove-blocked-while-in-use) + per-unit logo route `/api/business-units/[id]/logo` + admin home card.
- [x] US3 assignment: employee form select, registry grid column, CSV export/import column (matched by name; unknown flagged, blank left unchanged). US4: impersonation shows the target's unit brand (free via `getBrand`).
- [x] `npx tsc --noEmit` + `npm run build` green (incl. `/signin` pre-auth). UI snapshots in `ui-versions/`; mockup approved. Docs updated (this file, PROJECT_DETAILS, spec 024).
- [ ] **Apply `039_business_units.sql` to Neon** — *done by user 2026-08-14.* Then assign employees to units and set each unit's colors/name at Admin → Business Units. Live click-through of the per-unit look + impersonation remains.

## Platform rename + admin impersonation (2026-08-14, shipped)
- [x] **Renamed Forefront HR → Forefront People** across code defaults (brand, schema, AppShell, emails, README) + `036_rename_brand_forefront_people.sql` for the live row (or Admin → Brand). `tsc`/`build` green.
- [x] **Admin impersonation "View as employee"** (act-as-them): `/admin/impersonate` (Super User), effective-user resolution in `requireUser()`, pinned exit banner, cookie cleared on sign-out; security guards (no escalation, admin blocked while impersonating). `tsc`/`build` green.
- [x] **Hex color entry** in Admin → Brand (`BrandColorField`) — paste a code like `#0F2C69`.
- [x] **Demo persona** Ahmed Ali seed `037` / cleanup `038` (verified on throwaway Postgres) — user seeded and is keeping him.

## Spec 021 — Unified catalogue: FT/PT eligibility + medical split (built, pending Neon migration)
- [x] Spec `specs/021-benefit-eligibility-medical-split/spec.md`.
- [x] Schema: `GuaranteedBenefit` → one row per benefit (`eligibleFullTime`/`eligiblePartTime`, `ftBand*`/`ptBand*`; dropped `employmentType` + `band*`); `BenefitCatalogItem` + `eligibleFullTime`/`eligiblePartTime`/`medicalScope`; new enum `MedicalScope`. Migration `prisma/sql/032_benefit_eligibility_and_medical_split.sql` — **verified on a throwaway Postgres across the full 000→032 chain**: 8 guaranteed rows folded to 5 (Marriage/ProfDev/Special-events carry FT+PT amounts; Summer/Loans FT-only), old columns dropped, medical split into Personal+Family, no orphaned rows, columns match schema.
- [x] Lib: `amountForBand(employmentType, band, row)`, shared `isSalaryDriven`/`isEligibleFor`/`eligibilityWhere`/`medicalScopeFor` in `config.ts`.
- [x] Server (authoritative): eligibility enforced in `createClaim` (guaranteed + catalog) and `commitMedical` (Personal-only rejects dependants); `release`/`manual`/`release-actions` updated to per-type amounts + eligibility.
- [x] Admin UI (mockup-approved): unified **Benefits Catalogue** table (Type chip + FT/PT `EligibilityToggles` + claim requirement), **Amounts** tab stripped to numbers only; `setEligibility` action.
- [x] Employee UI: benefits filtered by eligibility; single medical section with Personal/Family behaviour (dependant pickers only when Family-eligible).
- [x] `npx tsc --noEmit` + `npm run build` green. UI snapshots in `ui-versions/`. Docs updated (this file, PROJECT_DETAILS, spec 021).
- [x] Follow-up: **inline-edit Catalogue grid** (`CatalogueGrid`, mirrors the employee registry — click-to-edit cells via `updateCatalogueCell`, click-to-sort, drag-reorder columns persisted, frozen header row + Benefit column); **guaranteed `category`** added (migration `033`, verified on throwaway Postgres) with the note kept as a description. `tsc` + `build` green.
- [ ] **Apply `032_*.sql` then `033_*.sql` to Neon** (paste after `031`). Clear any existing medical commitments first (Danger-zone reset on the employee page), then set FT/PT eligibility per benefit in the Catalogue.

## Spec 023 — Age-banded per-person medical rate card (built 2026-08-11; pending Neon migration `034`)
- [x] Spec + plan + tasks + implement (`specs/023-medical-age-rate-card/`). Mockup approved (`design-mockups/medical-age-rate-card/2026-08-11_*`).
- [x] Decisions confirmed: per-person by age; Tier 1 only; DOB-based (spouse becomes a `Dependant kind=SPOUSE` entered like kids); age at **commit date**; over-75 → top band + HR flag; **cents dropped (truncate), not rounded**; employees see whole EGP, admin keeps the operator's two-decimal figures.
- [x] Schema: `MedicalRateBand` (age bands, tier, Decimal premium), `Dependant.kind` (CHILD/SPOUSE), `MedicalCoveredPerson` commit snapshot; legacy `MedicalCommitment` count columns nullable; `MedicalRateCard` dropped. Migration **`prisma/sql/034_medical_age_rate_card.sql`** + Tier-1 seed — **applied cleanly on a throwaway Postgres (000→034); 12 bands with exact decimals, old card dropped, kind default CHILD, snapshot table + nullable legacy columns verified.**
- [x] Core: pure `src/lib/benefits/rates.ts` (`ageAt`/`bandFor`/`annualPremiumForPerson`/`sumMedicalPremium`/`proratedPremiumEGP` — truncate). `getMedicalRateBands` in `config.ts`; `computeMedicalPremium`/`MedicalRate`/`MedicalConfig` removed from `rules.ts`.
- [x] Server (authoritative): `commitMedical` (DOB gate, selected dependant IDs, age-band sum → spec-019 proration → truncate → pool cap → `MedicalCoveredPerson` snapshot); HR override `editMedicalCommitment` re-selects dependants + re-prices; `updateMedicalRateBand` edits a band.
- [x] UI (mockup-approved): employee `MedicalModal` selects existing dependants with per-person age→band→whole-EGP breakdown + missing-DOB block; committed `MedicalRow` from snapshot; admin **Amounts** 12-band editor; admin Submissions cover + dependant-checkbox re-price; **EmployeeForm** dependant Child/Spouse type selector; profile shows spouse tag. Snapshots in `ui-versions/`.
- [x] **Verified end-to-end via `tsx` against the seeded local DB**: family 32+29+10 → **16,879**; mid-cycle 4/12 → **5,626**; over-75 → top band+flag; commit write + `MedicalCoveredPerson` read-back OK. `tsc --noEmit` + `npm run build` green.
- [ ] **Apply `034_medical_age_rate_card.sql` to Neon** (paste after `033`). Then **HR fills employee + spouse DOBs** (medical commit is blocked without them). The 12 Tier-1 figures are seeded; HR can adjust on the Amounts tab.

## Spec 019 — Proration (built; **revised 2026-08-11 to cycle-length for pool/Prof-dev**; pending Neon migration)
- [x] Spec + `/speckit-plan` + `/speckit-tasks` + `/speckit-implement` (`specs/019-mid-year-proration/`).
- [x] **Revision 2026-08-11 — cycle-length proration.** Flexible pool + Professional development now scale to the **plan-year cycle length** (`cycle whole months ÷ 12`) for **every** eligible employee, not just mid-year starters (fixes: a half-year cycle left the basket at full annual). Mid-cycle joiner = same cycle fraction (no extra reduction); 6-month threshold still gates eligibility. **Medical unchanged** (mid-joiner ÷12 from its 3-month date). New helpers `cycleWholeMonths`/`cycleFraction`/`poolCycleFraction`; `createClaim` + `benefits/page.tsx` switched from `poolEligibility.fraction` → `poolCycleFraction`. Copy reworded (mockup `design-mockups/proration/2026-08-11_*`, approved). **Verified with the real functions via tsx: half-year → 10,000 of 20,000; joiner 10,000; not-yet 0; no-window → full; medical 3/12 unchanged (12/12 checks pass).** `tsc --noEmit` + `npm run build` green.
- [x] Schema: `PlanYear.startDate`/`endDate` + `GuaranteedBenefit.prorated`; migration `prisma/sql/027_plan_year_window.sql` (**applied cleanly on a throwaway local Postgres, 000→027; profdev flag + entry-tier ceilings verified**). *(No schema change in the 2026-08-11 revision — cycle length is derived from the existing window dates.)*
- [x] Core: pure `src/lib/benefits/proration.ts` (`classifyEligibility`/`prorate`/`remainingWholeMonths` + **`cycleWholeMonths`/`cycleFraction`/`poolCycleFraction`**); `config.ts` `planYearWindow` + `poolCeilingFor` (entry-tier fallback); `derive.ts` `addMonths`.
- [x] Server (authoritative): `createClaim` prorates the pool ceiling + Professional-development allocation **by cycle length**; `commitMedical` 3-month gate + **mid-joiner** prorated premium + entry-tier fallback; `createPlanYear`/`editPlanYearWindow` accept dates. **Compiled module validated against the quickstart figures via tsx (5000/1333/2375, FULL/NOT_YET, fallbacks) and the 2026-08-11 cycle-length cases.**
- [x] UI (mockup-approved): `PlanYearDialog` date inputs + edit-dates; admin window display + “proration off” warning; employee “Prorated · N of 12 mo” pool + prof-dev indicators; **medical-only view** for sub-6-month employees with prorated premium preview. Snapshots in `ui-versions/`.
- [x] `npx tsc --noEmit` green (build's `apply-sql` step needs the live DB, not runnable from a session). Docs updated (this file, PROJECT_DETAILS, IMPLEMENTATION_PLAN decision log).
- [ ] **Apply `027_*.sql` to Neon** (paste after `026`), then **set each open plan year's start/end dates** in the Plan-year dialog to switch proration on. Medical premium figures stay placeholders until the operator's prorated rates are confirmed.

## Spec 018 — Benefits claim-based living allowance (built, pending review + Neon migration)
- [x] Spec + `/speckit-clarify` + `/speckit-plan` + `/speckit-tasks` (`specs/018-benefits-claim-allowance/`).
- [x] Schema: dropped `BenefitSelection` + `SelectionLine`; added `MedicalCommitment`; migration `prisma/sql/025_claim_based_allowance.sql` (**validated on a throwaway local Postgres**).
- [x] Rules: `evaluateClaim` (50%-per-benefit for FT+PT + pool ceiling); cost = exact receipt value (no rounding); `COUNT_LIMIT_ENABLED=false`; `evaluateBasket`/`STEP`/`coerceAmount` removed.
- [x] Server: `commitMedical`, claim-as-you-go `createClaim` (no basket requirement, computes covered), admin `editMedicalCommitment`/`removeMedicalCommitment`, manual-release + export + dashboard updated; admin catalog 0% guard.
- [x] UI: new `MedicalCommitmentCard`, `BenefitClaims` full-price entry + covered preview, rewritten benefits page + orientation + `/benefits/policy`; removed `BenefitsSelector`/`BenefitsTabs` (snapshots in `ui-versions/`).
- [x] `npx tsc --noEmit` + `npm run build` green. Docs updated (this file, PROJECT_DETAILS, CLAUDE.md, constitution).
- [ ] **User review of the new UI** + apply `025_*.sql` to Neon (destructive clean-wipe of selection data — confirmed test data).

## Phase 0 — Docs & specs
- [x] Repo access to `islamsaadany/HR_ERP` confirmed and cloned.
- [x] Four-file system authored in repo (`CLAUDE.md`, `PROJECT_DETAILS.md`, `IMPLEMENTATION_PLAN.md`, this file).
- [x] **Spec-kit adopted** (`.specify/` + `/speckit-*` commands); `product-specs/` retired in favor of `specs/`.
- [x] **Constitution** authored (`.specify/memory/constitution.md`, v1.0.0) from the house rules.
- [x] Role model settled: Employee / HR Admin / Super User (+ org-chart manager capability).
- [x] Module list settled: Onboarding · Benefits · Team Directory · HR Documents · Dashboard · **Handbook/KB** · **Time-Off/Leave** · Learning Track (placeholder).
- [x] Team registry data cleaned (19 people; PII kept out of git; real emails pending).
- [x] Onboarding fully discovered (timeline stages · Policy/Action types · common core + Consulting track).
- [x] Real Benefit Scheme Policy mined from the Onboarding Kit; **pool ceilings confirmed** (FT 20/30/45/65k · PT 14/21/30/42k EGP).
- [x] **Spec 001 — Foundation (Employee Registry & Roles)** written + clarified. Ready for `/speckit-plan`.
- [x] **Spec 002 — Onboarding (Role-Aware Journey)** written + clarified. Ready for `/speckit-plan`.

### Specs written
| ID | Feature | Status |
|----|---------|--------|
| 001 | Foundation — Employee Registry & Roles | ✅ clarified, plan-ready |
| 002 | Onboarding — Role-Aware New-Joiner Journey | ✅ clarified, plan-ready |
| 003 | Team Directory (V1) | ✅ complete, plan-ready |
| 004 | Handbook & Resources | ✅ clarified, plan-ready |
| 005 | Time-Off / Leave Management (V1) | ✅ complete, plan-ready |
| 006 | Dashboard (Home) | ✅ complete, plan-ready |
| 007 | Benefits — Flexible Benefits Selection | ✅ complete, plan-ready |
| 008 | Knowledge Base — Consulting References & Reads | ✅ implemented (V1) |
| 012 | Benefits — Company Coverage Rates (co-funding) | ✅ implemented (branch — migration `023`) |
| 013 | Benefits — HR Bulk-Release + configurable sheet | ✅ implemented (in `main`) |
| 014 | HR-Managed Departments (add/rename/remove) | ✅ implemented (branch — migration `022`) |
| 015 | Consistent Admin Back Navigation | ✅ implemented (branch) |
| 016 | Admin Benefits redesign + manual claim/release | ✅ implemented (branch) |
| 017 | Benefits orientation tour | ✅ implemented (branch — migration `024`) |

## Next up
Autonomous build to the approved specs. Done: ALL 7 v1 modules (Foundation · Directory · Onboarding · Handbook · Time-Off · Benefits · Dashboard).
1. Build complete. Remaining: your setup actions in HANDOFF.md (Neon SQL, env, Google OAuth), then deploy + smoke test; optional polish (benefits visual fidelity, HR config-editing UI).
2. Hand-off items accumulate in `HANDOFF.md` (Neon SQL, env, Google OAuth, team-seed file) — delivered at the end.

## Build log
- **2026-08-13 — Admin/Finance UX: amounts-save toast + editable reimbursed record (branch `claude/benefits-eligibility-display-d36tez`, no migration):**
  Two follow-ups on the same branch, no schema/seed change. (1) **Amounts-tab save feedback** —
  every save form on Admin → Benefits → **Amounts** (pool ceilings, guaranteed FT/PT amounts,
  each medical rate-card row) was submitting silently; now wrapped in a shared `ToastForm`
  (`components/admin/ToastForm.tsx`) that keeps the same server action but fires the employee-claim
  **green `ff-toast`** on success (red on failure), so the operator knows it saved before pressing
  Done. (2) **Finance reimbursed-record dates + edit** — the Finance **Payments** table now shows the
  **Approved** date and a dedicated **Reimbursed on** column, and each reimbursed row is
  **Finance-editable** (`ReimbursedCell` → `editPayment` in `finance/actions.ts`) to fix the
  transferred amount and/or reimbursement date. Guarded to Finance/Super-User, validates (positive
  amount, valid non-future date, still REIMBURSED), leaves status + `paidBy`/`paidAt` unchanged, and
  **sends no email** (the employee was already notified at reimbursement — it's a bookkeeping fix).
  Mockup-approved (`design-mockups/finance-payments/2026-08-13_reimbursed-dates-edit.html`); UI
  snapshots under `ui-versions/`. Docs synced (PROJECT_DETAILS + spec 020). `tsc`/`build` green.
- **2026-08-13 — Guaranteed-benefit salary-fallback fix + release-table display (branch `claude/benefits-eligibility-display-d36tez`, no migration):**
  Two changes, no schema/seed change. (1) **Salary-fallback correction (money + display).**
  A guaranteed benefit with **no per-type band amount set** (e.g. Part-time Summer
  allowance — part-timers get no summer/loans) was falling back to the employee's
  **monthly salary** in two places: the employee Benefits card (showed the salary as the
  benefit amount — a wrong figure **and** a salary leak) and, critically, the
  **server-side claim check** (`claim-actions.ts` authorized a claim up to the salary — a
  real over-claim risk). Now the monthly-salary fallback is guarded by `isSalaryDriven`
  and applies **only** to genuinely salary-driven Loans; a band-based benefit with no
  amount for the viewer is **not available** — its card is omitted from the Benefits page
  **and** the orientation "what you already get" summary, and a claim is **blocked**
  ("no amount set for you yet — contact HR"). Matches what the bulk-release sheet already
  reported ("no part-time amount set"). Fixed in `benefits/page.tsx` + `benefits/claim-actions.ts`;
  UI snapshot `ui-versions/BenefitsPage/2026-08-13_before-hide-unset-guaranteed.tsx`.
  (2) **Release-table display refinements** (mockup-approved,
  `design-mockups/benefits-release-table/2026-08-13_pt-ft-column-status.html`): a **Type**
  column (FT/PT badge — navy FT, gold PT) after Tenure; the **Status** column drops the
  "Needs attention —" prefix and shows only the real reason; **"Not released"** in **red**;
  the full-row amber tint on attention rows removed. Display-only (`ReleaseManager.tsx`,
  snapshot `ui-versions/ReleaseManager/2026-08-13_before-pt-ft-column.tsx`); CSV export
  unchanged. Docs updated same-branch (PROJECT_DETAILS + specs 013/021). Verified: `tsc --noEmit`
  clean + `npm run build` green.
- **2026-08-12 — Incentive report restructure + tips + benefits catalogue scroll (spec 009, branch `claude/incentive-reports-templates-fse4oe`, no migration):**
  On-screen cycle report rebuilt (`CycleReport.tsx` now a client component): collapsible
  sections + Expand/Collapse-all; a **Review & validation** section (the 3 uploaded sheets)
  that auto-opens on a data issue, with a **Contributions Total-% column** flagging any
  client ≠ 100% (amber row + red total + ⚠ on the name). **Firm P&L** rebuilt as
  `Item | Value | %` (whole-EGP values, hover calc note per %, **Direct cost** rename,
  **Scheme cost** expands in place to BP fees / contributor / commission). 0 cells carry a
  hover reason (below the 70% gate). **Watch list** grouped General/clients then per person
  (`compute.ts` now attributes each note). Full-height tables via new `.ff-hscroll`
  (horizontal-only); non-clipping tooltips (`HoverTip` + `tipPosition`), which also fixes
  the config ⓘ clipping (`InfoDot`). **Excel** (`calc-export.ts`) gained header term-tips +
  zero-reason cell notes. **Benefits admin** page pinned registry-style (single-scroll) so
  the catalogue table scrolls internally, not the whole page (`AppShell` route lists,
  `AdminBenefitsTabs`, `CatalogueGrid`). Verified: `tsc` + `build` green; verify-incentive
  27/27 + verify-incentive-cycle 16/16; xlsx builder valid with notes. Mockups under
  `design-mockups/incentive-report/` and `design-mockups/incentive-icon/`.
- **2026-08-12 — Incentive reports & templates (spec 009, branch `claude/incentive-reports-templates-fse4oe`, no migration):**
  Four changes, no schema/seed change. (1) **Eligible-to-lead retired** from the People
  template, parser use, and the report ⚠ — the Assignments sheet already decides who leads;
  DB field left inert at `true`, verified engine untouched. (2) **Pre-filled templates** —
  the template route is now cycle-aware (`?cycleId=`): People seeds from the registry
  (Consulting Department + Data Management Unit); Assignments/Contributions carry the client
  list + lead/bd from the most recent prior cycle; money/date columns blank
  (`src/lib/incentive/prefill.ts`). (3) **Per-person .xlsx export** — "Download calculation"
  on the by-person section streams a workbook (Summary + one sheet per consultant with their
  full derivation) via `exceljs` (`src/lib/incentive/calc-export.ts`, `load.ts`,
  `/api/incentive/[id]/calculation`). (4) **Distinct nav icon** — Incentive was reusing the
  Benefits gift icon; now a coins icon (mockup-approved). Verified: `tsc` + `build` green;
  throwaway run of the .xlsx builder on the Appendix-A sample reconciles (Galal → Imtenan lead
  fee 15,209.73), 1 summary + N person sheets, valid workbook re-opened by exceljs.
- **2026-08-07 — Benefits orientation tour (spec 017, branch `claude/hr-erp-benefits-coverage-rates-hnaox1`, migration `024`):**
  A personalized, first-run, skippable, re-openable **stepped-cards** walkthrough (`BenefitsOrientation`)
  on the employee Benefits page. 4 steps in the employee's own numbers (welcome + first name → pool/band;
  guaranteed benefits with band amounts; how the flexible basket works; the rules — coverage 100/80/50,
  50% cap with **medical exempt**, claims = request-or-proof → covered portion, link to `/benefits/policy`).
  **Auto-opens** only when the selector is available and the employee hasn't submitted and hasn't seen it;
  **"How it works"** button re-opens any time. New `User.benefitsOrientationSeenAt` flag (migration `024`) +
  `markOrientationSeen` action (set once). No selector/money-rule change; reuses existing page data.
  Verified: `tsc` + `build` green; throwaway Postgres — migration idempotent, flag set-once (2nd attempt a
  no-op). UI mockup approved (final wording: medical-only 50% exemption; request-or-proof claims). Snapshot
  saved. **Neon: `prisma/sql/024_benefits_orientation.sql` (auto-applied by the deploy runner).**

- **2026-08-07 — Admin Benefits redesign + manual claim/release (spec 016, branch `claude/hr-erp-benefits-coverage-rates-hnaox1`):**
  `/admin/benefits` recomposed into **three tabs** — **Submissions & Claims** (default) · **Benefits
  Catalogue** · **Amounts** — retiring the old Configuration + Claim-requirements tabs. **Catalogue** is
  one table (Name · Category · Order · Claim requirement · Coverage %) + hide/show/add, absorbing the
  per-item claim-requirement and coverage-% editing. **Amounts** groups ceilings, guaranteed amounts,
  guaranteed claim-requirements, and the rate card. All config tables are **view-first** via a shared
  `EditableSection` (read-only → Edit → Done), toggling independently. **Manual entry** (`manual-actions.ts`
  `recordManualRelease` + `ManualReleaseForm`): HR/Super User back-fills an already-approved claim as a
  **RELEASED** `BenefitClaim` with the entered approval date + actor, not queued, counted against the
  allocation; server-guarded (future date, allocation target required, amount ≤ remaining, covered terms).
  **No schema change.** Verified: `tsc` + `build` green; throwaway Postgres **9/9**
  (`scripts/verify-manual-release.mts`: released state + back-dated decision + reviewer, allocation cap for
  guaranteed & catalog, future-date + no-target rejection). UI snapshots saved. Preserves plan-year popup,
  submissions, claims queue, CSV export, reopen/reset. Future: everyone × benefits filterable master view.

- **2026-08-07 — Benefits company coverage rates / co-funding (spec 012, branch `claude/hr-erp-benefits-coverage-rates-hnaox1`, migration `023`):**
  Each flexible benefit now carries a **coverage rate**. The employee enters the **full cost**; the
  **covered (company) share = cost × rate/100** draws from the pool, and they pay the rest. **All money
  rules run on the covered amount** (pool total, over-pool, FT 50% cap). Selection limits raised to
  **FT 5 / PT 3**. Medical unchanged (single 100%-covered rate-card item, cap-exempt). Claims reimburse
  the **covered portion** against proof of full spend.
  - Schema: `BenefitCatalogItem.coverageRate` (default 100) + `SelectionLine.cost` (`amount` stays the
    covered pool draw). Migration `023_benefits_coverage.sql` — seeds 80%/50% rates, backfills `cost = amount`.
  - New `src/lib/benefits/coverage.ts` (`coveredAmount`/`outOfPocket`) — single source shared by the
    server rules (`rules.ts`, now covered-based; FT5/PT3) + `saveBasket` and the client selector.
  - Selector (approved mockup): per benefit **Cost · Company pays (r%) · You pay**, a `r% covered` badge,
    and the meter tracks the **company share**; "Selected" panel headlines the company share. Admin
    Configuration catalog editor gains a **Coverage %** field (medical locked at 100). Policy page +
    claims wording updated to covered terms.
  - Verified: `tsc` + `build` green; **19/19** coverage/rules checks (`scripts/verify-coverage.mts`:
    80/100/50 math, DC-2 non-1,000, FT 50% cap on covered, over-pool, PT exempt, FT5/PT3, medical);
    throwaway Postgres — migration idempotent, rates seed (gym 80 / mobile 50 / medical 100), `cost`
    backfill correct + idempotent. UI snapshot saved. **Neon: `prisma/sql/023_benefits_coverage.sql`
    (auto-applied by the deploy runner).** The admin-Benefits tab redesign + manual claims is the next
    spec (016).

- **2026-08-07 — Consistent admin back navigation (spec 015, branch `claude/hr-erp-benefits-coverage-rates-hnaox1`):**
  Added a shared `BackLink` component (`components/admin/BackLink.tsx`, the existing muted "←" style) to
  every admin page except the Admin home. Each links to its **structural parent** (section → Admin home;
  nested create/edit/import/release → its section list) — explicit path, not browser history — per the
  parent map in `specs/015`. Replaced the scattered ad-hoc back links (Modules, CSV Import, Release a
  benefit, Knowledge new/edit, Departments) with the one component; removed now-unused `Link` imports.
  20 admin pages wired. Verified: `tsc` + `build` green; grep confirms no stray ad-hoc back links.
  UI snapshots of all admin pages saved before editing (`ui-versions/admin-back-nav/2026-08-07/`).

- **2026-08-07 — HR-managed departments (spec 014, branch `claude/hr-erp-benefits-coverage-rates-hnaox1`, migration `022`):**
  Replaced the hard-coded `DEPARTMENTS` constant with a managed `Department` lookup table HR maintains
  at **Admin → Departments** (HR Admin + Super User). Department stays a **text label** on `User`
  (Option A); **rename cascades** to every employee in that department (one transaction); **remove is
  blocked** while anyone is assigned; names trimmed, duplicates rejected case-insensitively. New
  `getDepartments()`/`getDepartmentsWithUsage()`/`unionDepartments()` in `lib/departments.ts`; every
  department **choice/filter** now reads the managed list (employee create/edit form, grid filter,
  directory filter, CSV-import unknown-department flag), while display-only surfaces keep the stored
  label. `DepartmentsManager` client component (read-first list, Add, per-row Edit/Remove). Seeded the
  original five (`022_departments.sql`, idempotent, runner-applied). Verified: `tsc` + `build` green;
  **throwaway Postgres 13/13** (`scripts/verify-departments.mts`: add/dedup/trim, rename cascade with
  zero stale + case-only self-rename, rename-to-other-name rejected, remove-guard block/allow) + the
  migration applies idempotently (2nd run inserts 0). UI snapshots saved for the edited components.
  **Neon: `prisma/sql/022_departments.sql` (auto-applied by the deploy runner).**

- **2026-08-07 — Credentials auth + forced temp-password change (branch `claude/hr-erp-credentials-auth`, spec 001 FR-001/002/021/022/023/024):**
  Product decision: drop Google for now, use email + password, force a temp-password change on first login.
  - **Login:** removed the "Sign in with Google" button (provider still env-gated so it can return); **lifted the
    company-domain restriction** on password sign-in (`auth.ts` authorize) — any registered ACTIVE employee may
    sign in. HR gets a **non-blocking warning** in the employee form when an email isn't on `ALLOWED_EMAIL_DOMAIN`.
  - **Forced change:** new `mustChangePassword` flag (**migration `021_must_change_password.sql`** — renumbered from
    the parked branch's `020` to avoid colliding with `020_benefit_release.sql`). Admin-issued passwords (single or
    bulk) set the flag; the `(app)` layout redirects flagged users to a standalone **`/set-password`** page (outside
    the shell, no redirect loop) until they choose their own. Cleared on set (there or on Profile).
  - **Policy:** `validatePasswordPolicy` — ≥ 8 chars + uppercase + number + special — enforced server-side on
    `/set-password` and Profile; temp passwords exempt.
  - **Bulk temp passwords:** `TempPasswordsPanel` + `generateTeamPasswords` on Admin → Employees — generate for
    everyone missing a password (or Super-User "Reset ALL", excluding the actor) → **one-time CSV** (name · email ·
    password); stored only as scrypt hashes. No emails in v1 → HR reset is the only recovery.
  - Verified: `tsc` + `build` green; **throwaway Postgres** — migration idempotent, column `NOT NULL default false`,
    flag set-on-temp / clear-on-own, bulk missing-target correct; password-policy cases 7/7. Reuses the parked
    `team-credentials` work, adapted to these decisions. **Neon: run `prisma/sql/021_must_change_password.sql`.**

- **2026-08-05 — Consolidation branch `claude/hr-erp-benefits-consolidation`:** compiled the separate benefits
  branches into one mergeable unit off `main` (which already had spec 013). Bundles, verified together (`tsc` +
  `build` green):
  - **Selection guards (spec 007 FR-035/036, code):** over-selection prevented at the max (4 FT / 2 PT — unselected
    items dim); claimed benefits locked on reopen (can't deselect/under-fund below what's claimed); enforced in
    `saveBasket`. Verified earlier on Postgres (claimed-lock 6/6).
  - **Self-service reopen (FR-038, code):** employee reopens their own submitted basket ("Update my basket" →
    `reopenOwnSelection`), guarded to own+open+submitted. Verified earlier (reopen 5/5).
  - **Benefits guide de-confidentialized (FR-037, code):** `/benefits/policy` no longer exposes the pool-ceiling
    matrix / guaranteed amounts / rate card; rules-in-words + how-to-claim only.
  - **Salary confidential (spec 001 FR-018, code):** monthly salary is Super-User-only — hidden from HR Admin in
    the employee grid/form/inline-edit and never sent to a non-Super-User client (`canSeeSalary`).
  - **Spec 012 (Company Coverage Rates)** authored + clarified (docs only; **not built** — the next task).
  - Note: FR-035 caps FT at **4** today; spec 012 raises it to **5** when built (planned-vs-built, not a conflict).

  New **`/admin/benefits/release`** (linked "Release a benefit" from admin Benefits). `ReleaseManager` (client):
  benefit picker (fixed-allowance only — **Loans/salary-driven excluded**), employee table with **per-person
  release** (checkbox + **Select all/none** → `setReleased`), a **Status** column, a **column picker** (default
  `# · Employee · Tenure · Allowance value · Status` + optional non-confidential fields; **no salary**), and a
  client-side **CSV download**. New `BenefitRelease` model + **migration `020_benefit_release.sql`** (per employee ×
  benefit × plan year; presence = released; snapshots amount + date + actor). Amounts are band-derived
  (`amountForBand`); no-band employees flagged. **HR sees no salary anywhere in this feature.**
  Verified: `tsc` + `build` green; throwaway Postgres **9/9** (eligible filter excludes Loans; population = active +
  matching type; amount snapshots; no-band/PT/LEFT excluded; idempotent re-release; unrelease; unique constraint) +
  the migration SQL applies idempotently. **Neon: run `prisma/sql/020_benefit_release.sql`.** Docs updated.

- **2026-08-04 — Admin Benefits restructure, slice 1 (branch `claude/hr-erp-benefits-admin-config`):**
  `/admin/benefits` moved from a long scroll to **three tabs** (`AdminBenefitsTabs`, mirroring the
  employee `BenefitsTabs`): **Configuration · Submissions & claims · Claim requirements**. Plan-year
  management moved into a **top-right popup** (`PlanYearDialog`) — the year list with open/close toggles +
  create-new-year, all server-action forms (revalidate, popup stays open). The **Configuration** tab ships
  its first editable section — the **pool-ceilings grid** (type × band, `updatePoolCeilings`, one Save).
  No behaviour change to claims/submissions/requirements (markup relocated into panels). Verified on a
  throwaway Postgres (6/6: update, blank-skip, negative-clamp, create-missing, rounding, untouched).
  `tsc` + `build` green. UI snapshot saved.
- **2026-08-04 — Admin Benefits, slice 2 (Configuration editors):** the Configuration tab now also edits
  **guaranteed amounts** (FT/PT tables per band; Loans stays salary-driven/null), the **basket catalog**
  (edit name/category/order, **hide instead of delete**, add item with a derived unique key), and the
  **flat medical rate card** (self · spouse · child<18 · child18+). New actions in `config-actions.ts`.
  Verified on a throwaway Postgres (10/10: per-field guaranteed save with FT/PT isolation + salary-driven
  untouched; catalog edit/hide/create-unique/order; rate-card create + partial update). `tsc` + `build`
  green.
- **2026-08-04 — Admin Benefits, slice 3 (policy page):** new **`/benefits/policy`** — a read-only
  "How the benefits basket works" explainer generated from the **live config** (rules, pool ceilings,
  guaranteed amounts, active catalog by category, rate card, worked example) with a **Print / Save-as-PDF**
  button (`PrintButton` + `@media print` isolation so only the doc prints). Readable by any employee; linked
  from the employee Benefits page ("How the benefits basket works →") and the admin Benefits header
  ("Policy page"). `tsc` + `build` green; UI snapshots saved. **Benefits-admin restructure complete** across
  the 3 slices.
  Reference `benefitsselector_3.html` checked against seed: ceilings, guaranteed amounts, and catalog match
  exactly; the medical rate card is the only real gap (HTML is tiered Standard/Silver/Gold, ours is a single
  flat card — kept flat per decision, made editable in a later slice).

- **2026-08-03 — Benefits sticky tabs + claims table + Directory list-only sort (branch `claude/hr-erp-benefits-directory-ux`):**
  - **Benefits sticky tab bar (spec 007 · FR-034):** the "Your benefits / Claims & reimbursement" tab bar
    now stays pinned just beneath the sticky page header while scrolling either tab. `BenefitsTabs` measures
    the header (`#benefits-header`, via `ResizeObserver`) so the two frosted bands sit flush on every width;
    the header's own compact-on-scroll behavior is untouched.
  - **Benefits claims redesigned to a table (spec 007 · FR-033, supersedes the 2-column cards):** the claims
    tab is a table — **# · Benefit · Allocated · Reimbursed · Pending · Left to claim · Status**, one row per
    benefit with an at-a-glance status pill (Not started / Pending review / Partially reimbursed / Fully
    claimed / Rejected). Each row expands to its claim history + the file-a-claim form (Proof: amount + note
    + mandatory upload; Request: full-amount request + optional note). All prior capability preserved
    (multiple partial claims, notes, proof upload, tracker). `BenefitClaims` is now a client component.
  - **Directory list-only + sortable columns (spec 003 · FR-014/FR-015):** the card view + card/list toggle
    were retired; the Directory is the list/table alone, with **clickable Title / Department headers** that
    sort A→Z / Z→A (blanks last), layered on the existing search + department filter.
  - A clickable HTML mockup of the claims table was approved before implementing. UI snapshots saved for
    `DirectoryBrowser`, `BenefitsTabs`, `BenefitClaims`, and the benefits page. `tsc --noEmit` + `next build`
    both green. (Specs 003/007 + PROJECT_DETAILS updated in the same commit.)

- **2026-08-03 — Benefits claims: tabs + 2-column + human wording (spec 007 · FR-033):** the submitted
  benefits page splits into two tabs ("Your benefits" summary / "Claims & reimbursement", the latter
  badged with the pending-claim count) instead of one long scroll; claim cards lay out in two columns.
  Claim actions read by type — Request: "Request your benefit" / "Confirm request"; Proof: "Request
  your payback" / "Submit request". Verified in-browser (both tabs, 2-col, per-type wording); tsc green.

- **2026-08-03 — Benefits submitted-state view (spec 007 · FR-032):** once the basket is submitted the
  editable selector is replaced by a read-only **"Your selections"** summary (chosen benefits + amounts);
  the running-total box stays on the right (sticky, read-only); **Terms & conditions** move to a
  full-width two-column band below; the guaranteed band stays at top and the claims section follows.
  Draft state is unchanged (full editable selector). Verified in-browser: summary card renders, editable
  toggles gone. UI snapshot saved; `tsc` green.

- **2026-08-03 — Benefits claims refinement + employee salary (spec 007, branch `claude/hr-erp-dashboard-pwa`):**
  - Fixed the admin claim-type dropdown appearing to revert after **Set** (it saved; the uncontrolled
    field reset — keyed it by value).
  - Refined claim policy (migration `019`): **Medical = Automatic**; all guaranteed = **Request** except
    **Professional development = Proof**; basket = Proof. **Request** claims are **note-only** (no amount)
    and take the full allocation; **Proof** claims keep amount + upload.
  - Added `User.monthlySalary` (HR-private; employee form + grid): the **Loans** benefit now shows the
    employee's salary as its figure instead of "Available". Medical shows under "Paid automatically".
  - Verified on a throwaway Postgres: migration 019 applied + idempotent with correct defaults; Loans
    showed EGP 50,000; a note-only Request claim on Marriage auto-claimed the full 30,000 (Pending →
    fully claimed); Professional development = proof-required. `tsc` + build green.

- **2026-08-03 — Benefits claims & reimbursement + page polish (spec 007, branch `claude/hr-erp-dashboard-pwa`):**
  - **Page fixes:** submit confirmation banner (F1); the running-total meter now sticks on desktop
    while scrolling (F2, was broken — the whole aside was sticky but taller than the viewport); sticky
    page header (F3); guaranteed cards aligned on one baseline with reserved 2-line subtitles (F4).
  - **Claims/reimbursement (Phase-2, now built):** migration `018` adds a per-benefit `claimType`
    (None/Note/Proof) + a `BenefitClaim` model. Employees file **multiple partial claims** up to a
    benefit's allocation (note or mandatory proof-upload to Blob); a per-benefit tracker shows
    allocated / reimbursed / pending / left. Admin → Benefits gains a **Claims to review** queue
    (Release / Reject-with-reason), a **Claim requirements** editor (per benefit), and a full **Reset**
    (blocked when claims exist) beside Reopen. All server-authoritative.
  - Verified on a throwaway Postgres: migration 018 applied + idempotent with correct defaults;
    full Playwright flow — employee filed a claim → Pending → admin review queue (·1) → Release →
    tracker showed Reimbursed 4,000 / Left 6,000; Reset blocked when claims exist. `tsc` + build green.

- **2026-08-03 — Branding / white-label (spec 011, branch `claude/hr-erp-dashboard-pwa`):**
  - Single-row `BrandSettings` (migration `017`): company name, short name, logo, primary + accent
    colors. Super-User **Admin → Brand** screen (name, logo upload to Blob, two color pickers, reset).
  - The two base colors are expanded into full tint/shade scales and injected as a `:root` override of
    the theme CSS variables — **re-themes the entire UI with no per-component changes**. When colors
    equal the Forefront defaults, **no override is injected** (byte-for-byte identical to today).
  - Company name/logo applied to the sidebar, mobile header, sign-in, browser title, and the PWA
    manifest (name + theme color follow the brand). Data stays single-tenant per deployment.
  - Verified on a throwaway Postgres: a maroon/teal brand re-themed the whole app (styled screenshot);
    admin save changed the name to "Globex Inc" and reset restored "Forefront HR"; manifest + `<title>`
    reflect the brand. `tsc` + `next build` green. (Full multi-tenant data isolation is a separate,
    future spec — this is branding only.)

- **2026-08-03 — Home + PWA + grid polish (branch `claude/hr-erp-dashboard-pwa`):**
  - **Admin grid filters persist** (spec 001 · FR-020): the employees grid now remembers the filter
    selections (search, department, type, status, role) in localStorage, like it already did for
    column show/hide + order. Proven: set a filter + hid a column, reloaded → both restored.
  - **Module-aware dashboard** (spec 006 · FR-004/FR-004a): disabled modules contribute no tile and
    no quick link (fixes Onboarding showing after being switched off); the Benefits tile hides once
    submitted; Time-Off + Team Directory are the always-on primary cards (added a Directory card).
  - **PWA / installable** (spec 010): web manifest, navy/gold "F" icons (192/512/maskable + Apple),
    a minimal service worker (no auth-content caching), and head meta (theme-color, manifest,
    apple-touch-icon, mobile-web-app-capable). SW registered+activated in a real browser; installable
    on the HTTPS deploy. `tsc` + `next build` green.

- **2026-08-03 — Benefits: submissions CSV export (release scope #2):** `Export CSV` on
  Admin → Benefits downloads the open plan year's submissions via `/api/admin/benefits/export`
  (HR/Super-User only), one row per selected benefit line (employee · email · status · submitted ·
  benefit · category · medical · amount). Verified on a throwaway Postgres with a seeded submission:
  authenticated fetch returns HTTP 200 `text/csv` attachment with correct rows; `tsc` + build green.

- **2026-08-03 — Time-Off release additions (spec 005 · branch `claude/hr-erp-directory-benefits`):**
  - **HR central leave view** (FR-013): `/admin/time-off` lists every request (status filter);
    HR/Super User can approve or decline a pending request as a fallback. Admin card added.
  - **In-app decision badge** (FR-014): gold nav badge counts decided-but-unseen requests, cleared
    when the employee opens Time-Off (`decisionSeenAt`, migration `016`, idempotent). No email.
  - **Overlap warning** (FR-011, previously unimplemented): manager queue + HR view flag date
    clashes with a teammate's approved/pending leave (wires the existing `overlaps()` helper).
  - **Bug fixed:** decisions were carried on a submit-button `value`, which React/Next does not
    reliably include in a server action's FormData (manager approve/decline was silently no-op).
    Reworked to dedicated `approveLeaveRequest`/`declineLeaveRequest` actions via `formAction`.
  - Verified: `tsc` + `next build` green; migration `016` applied + idempotent on a throwaway
    Postgres; live Playwright — badge shows `1` and clears after viewing, both overlap warnings
    render, and an admin approve flipped a request to APPROVED in the DB. UI snapshot saved.

- **2026-08-03 — Directory grid + benefits polish (branch `claude/hr-erp-directory-benefits`):**
  - **Admin editable employees grid** (spec 001 · FR-020): `/admin/employees` is now an
    inline-editable power-grid — typed cells (text/email, date pickers, enum + Manager dropdowns),
    column show/hide + drag-reorder (localStorage), and filters (search + department/type/status/role).
    New server action `updateEmployeeField` validates one field with the full-form's per-field rules
    and enforces the same governance (Super-User-only role, email uniqueness, self/cycle guards, no
    self role/status change); optimistic UI with revert-on-error. The employee `/directory` is unchanged.
  - **Directory card/list toggle** (spec 003 · FR-014): read-only list (table) view alongside the
    cards, remembered per user; public fields only, same filters.
  - **Benefits polish** (spec 007): guaranteed benefits render as single-line rows; a pinned mobile
    floating summary bar keeps the running total/actions visible while scrolling (desktop keeps the
    sticky panel).
  - Verified: `tsc` + `next build` green; `scripts/verify-grid-writes.mts` 16/16 against a throwaway
    Postgres (text, enum→null, date coerce/clear, status, email-uniqueness, self/cycle guards); live
    Playwright pass — bootstrap login, inline title edit persisted through reload, Columns toggle,
    and screenshots of the grid, directory list, and benefits desktop + mobile. UI snapshots saved.

- **2026-07-27 — Phase 1 Foundation scaffold:** Next.js 15.5 + React 19 + TS + Tailwind v4 +
  Prisma + NextAuth v5 (Google, domain-locked, JWT, no auto-provision). Prisma schema for the
  registry (User/Dependant/PersonalDocument + enums). App shell (navy/gold), /signin, /dashboard,
  /profile (real registry read + derived age/tenure), and coming-soon stubs for every module route.
  `npm run typecheck` and `npm run build` both green. `prisma/sql/000_initial_schema.sql` generated
  for Neon.
- **2026-07-27 — Foundation complete:** HR registry admin CRUD (/admin/employees list/new/edit) with
  zod validation, email-uniqueness + reporting-line self/cycle guards, Super-User-only role grants;
  My Documents (Vercel Blob upload + authorized download route + delete); team seed SQL generated
  (`prisma/sql/seed_data_team.sql`, gitignored — 19 employees + dependants, delivered to user).
  Minor gap deferred: HR view/upload of another employee's personal docs from the admin record
  (FR-026 — download route already authorizes admins; admin upload UI to add later).

- **2026-07-27 — Onboarding complete:** schema (OnboardingActivity/ActivityCompletion + enums);
  employee journey (/onboarding) grouped by stage with live progress % and self-attested toggles;
  track assignment (common core + Consulting by department); HR authoring (/admin/onboarding CRUD);
  seeded 25 activities (`prisma/sql/001_seed_onboarding.sql`, committed) with cross-module deep links.
  Build green.

- **2026-07-27 — Handbook & Resources complete:** schema (HandbookSection, Resource); employee
  /handbook (searchable native sections + downloadable resources) + /handbook/[slug] reader;
  authorized resource download route; HR /admin/handbook (section CRUD + resource upload/delete
  via Vercel Blob); seeded 10 sections from the kit (`prisma/sql/002_seed_handbook.sql`). Build green.

- **2026-07-27 — Time-Off complete (V1):** schema (LeaveRequest + LeaveStatus); employee /time-off
  (request full-day range + note; my-requests list with status; cancel pending); direct-manager
  approval queue (approve/decline + comment); no-manager falls back to a Super User; date validation.
  Single generic type, no balances, full days. Build green.

- **2026-07-27 — Benefits complete:** schema (PlanYear, PoolCeiling, GuaranteedBenefit,
  MedicalRateCard, BenefitCatalogItem, BenefitSelection, SelectionLine + enums). Server-authoritative
  rule engine (`src/lib/benefits/rules.ts`): pool ceiling, FT 50% single-benefit cap, FT max-4 / PT
  max-2, medical rate-card premium (self always + spouse/children by bracket) exempt from 50% but
  ceiling-capped, steps of 1,000. Employee /benefits: guaranteed panel + ported navy/gold selector
  (toggles, steppers, live meter, medical modal) with save-draft/submit-lock; window-gated. HR
  /admin/benefits: plan-year open/close + create, submissions view + reopen. Seeded confirmed config
  (`prisma/sql/003_seed_benefits.sql`). Deferred: HR editing UI for ceilings/guaranteed/rate-card
  (values seeded & authoritative); selector visual polish vs the HTML reference. Build green.

- **2026-07-27 — Dashboard complete + build complete:** Announcement model; composed /dashboard
  (onboarding progress, benefits status, time-off, manager approvals tile, announcements, quick
  links — role-adaptive); HR /admin/announcements. All 7 modules build green (typecheck + next build).

- **2026-07-28 — Auth bridge + CSV employee import:**
  - **Temporary username/password sign-in** (NextAuth Credentials provider) so HR can use
    the app before Google OAuth is configured. Validated against a single bootstrap admin
    (`BOOTSTRAP_ADMIN_*`, defaults `Islam`/`1234`), upserted as an active SUPER_USER on first
    login — no seed/SQL. Google provider is now optional (shown only when `AUTH_GOOGLE_ID`/
    `_SECRET` set); signin page swapped to a username/password form (UI snapshot saved).
  - **Bulk employee import** at `/admin/employees` → **Import CSV**. Dependency-free CSV/TSV
    parser + tolerant date parser (long-form, dotted, `d-Mon-yy`, slash formats; ambiguous
    numeric dates read **day-first** per HR decision; unreadable/annotated dates left blank &
    flagged). Tenure band **derived from hire date**. Upsert by email (never changes an
    existing role); external-domain emails imported (directory-visible, can't sign in yet);
    kids → dependants when a DOB parses. Per-row on-screen review report. Verified against the
    real 19-row sheet. Replaces the gitignored `seed_data_team.sql` handoff. Build green.

- **2026-08-03 — Incentive Scheme (spec 009), super-user only:** a hidden partner-compensation
  engine implementing "Team Benefits System v1.5" — Business Partner Fee, Commission, Profit
  Share (proposed), 70% gate, `eligible_to_lead` utilisation gate, contributor tiers/floor/cap,
  firm P&L, cost recovery, watch list. Pure engine in `src/lib/incentive/` (banker's rounding),
  per-cycle model (`013`), CSV upload with downloadable templates + flag-and-block validation,
  reports at `/incentive` (requireSuperUser; nav entry for super users only). Proven against
  Appendix A: `scripts/verify-incentive.ts` 27/27 and `scripts/verify-incentive-cycle.ts` 16/16.

- **2026-08-03 — Email + password sign-in + admin/self-service (auth):** employees sign in with
  their Forefront email + password or Google, both to the dashboard. `passwordHash` (scrypt, no
  new dep; migration `014`); admin set/reset per employee (temp password shown once); self-service
  change on Profile. Bootstrap admin retained as fallback.

- **2026-08-03 — Module release switch (super user):** Admin → Modules toggles each module on/off
  (`ModuleFlag`, migration `015`); off = hidden from nav + route redirects home. Guards on all six
  module root pages; nav filtered via `AppShell.hiddenNav`.

- **2026-07-30 — Knowledge Base deck attachments (spec 008 FR-009):** a KB topic can now carry one
  **PDF deck** so slide-heavy training topics keep a short, searchable blurb + the real deck instead of
  re-typing it as Markdown. Added `attachmentUrl/Name/Type/Size` to `KnowledgeArticle`
  (`012_knowledge_attachments.sql`, idempotent, auto-applied). Admin editor gains an "Attach deck (PDF)"
  field (upload / replace / remove), reusing the existing Vercel Blob `put()` pattern; server validates
  PDF-only ≤25MB and cleans up the old blob on replace/remove/delete. Employee reader renders the blurb
  first, then embeds the deck (`<object>`) with a Download link. Build green (typecheck + next build);
  migration `012` applied to a throwaway local Postgres and verified (columns added, idempotent, deck
  row reads back). UI snapshots saved before editing `KnowledgeExplorer`/`ArticleForm`.

- **2026-07-28 — Benefits catalog + shell polish:**
  - **Benefits selector rebuilt to `benefitsselector_3.html`:** catalog grouped into 5 display
    categories (Health & protection · Wellbeing · Life & family · Personal growth · Lifestyle &
    flexibility) with their items; category headers + "Selected" + "Terms & conditions" panels,
    navy/gold. Added `category` to `BenefitCatalogItem`; reseeded (`003`) + migration
    (`004_benefits_categories.sql`). Medical unchanged (Personal = self only; dependants separate
    in the modal). All money rules still server-side. Also fixed the `003` apostrophe bug.
  - **Collapsible sidebar:** chevron collapse → narrow icon rail with reopen; remembered in
    localStorage; **Handbook auto-collapses** it. Shell is now a client component; sign-out moved to
    a server action.
  - **Handbook & Resources → Vercel-style master–detail:** left list of sections + Resources group,
    content opens on the right, active item bold + navy underline, search retained. Removed the old
    card `HandbookBrowser`. Excluded `ui-versions/` snapshots from `tsc`.
  - Build green (typecheck + next build). UI snapshots saved before each edit.

- **2026-07-28 — Knowledge Base module (spec 008):** split the Handbook. The 3 consulting sections
  (Strategy Consulting, AI-Strategy Consulting, Assignment Phases) moved into a new **Knowledge Base**
  of admin-authored "reads." New `KnowledgeArticle` model; `/knowledge` employee master–detail
  (Vercel-style, search) with a Markdown renderer supporting GFM **tables**, `[!KEY/TIP/NOTE/WARNING]`
  **callouts**, and **mermaid** diagrams; `/admin/knowledge` CRUD with a **copyable Claude prompt** +
  paste-to-parse front-matter authoring flow. Nav gains "Knowledge Base" (auto-collapses the sidebar
  like Handbook). Seeded 9 starter articles mined from the Onboarding Kit PDF. DB: table added to
  `000`; 3 sections deactivated in `002`; `005_knowledge_base.sql` migrates existing DBs (table +
  deactivate + seed). Added deps: react-markdown, remark-gfm, mermaid. Build green.

- **2026-07-29 — Migration runner + onboarding v2 + handbook policies:**
  - **Deploy-time migration runner** (`scripts/apply-sql.mjs`, wired into `build`): applies pending
    `prisma/sql/NNN_*.sql` on each deploy, tracked in `_sql_migrations`; baselines the hand-applied
    000–005; no more pasting SQL into Neon. Skips cleanly when no DB URL (local builds).
  - **Onboarding v2:** stage is now **free-text** (group order from `order`) — no more enum
    migrations to add weeks. Redistributed into **Week 1–8 + Check-ins** (front-loaded foundation,
    consulting from Week 1, Real Case Sessions Momen/Omar/Galal/Islam in Weeks 3–6, split 30/60/90).
    New items: buddy, HR/Marketing/3× BU-head sessions, know-the-Time-Off-tool, 4 reading blocks,
    read case studies, own a deliverable. Policy items now deep-link to Handbook sections; actions to
    modules. (`006_onboarding_8week.sql`)
  - **Handbook policies:** added Office & Workplace · Time Off · Expenses · Code of Conduct ·
    Confidentiality · IT/Data-security sections (as points), plus optional **policy→tool buttons**
    (`actionLabel`/`actionHref`) — Time Off → Time-Off tool, People Governance → Benefits, rendered in
    both the reader and the explorer. (`007_handbook_policies.sql`)
  - All verified on a local Postgres (fresh + existing paths); typecheck + build green.

- **2026-08-10 — Admin home hover cards + per-benefit claim status (UI polish, mockup-approved):**
  - **Admin home cards** are title-first: title leads (larger, semibold), description reveals on
    hover, card lifts (shadow + navy border), "Open →" removed. Touch shows details by default,
    focus reveals them, reduce-motion disables the animation (`.ff-adcard*` in `globals.css`).
  - **Benefits** card renamed **"Benefits Management"** with an always-visible gold **"N pending"**
    pill (pending claims in the active plan year; guarded for unmigrated DBs).
  - **Your benefits** — each collapsed flexible-benefit row shows a compact **claim-status summary**
    (chips with counts, app claim-pill colors: gold pending / navy reimbursed / red rejected; "No
    claims yet." when empty). Guaranteed tiles unchanged; no money-rule change.
  - No schema change. UI snapshots saved; typecheck + build green.

- **2026-08-14 — Branding: single "Make default" button (branding follow-up):**
  - Retired the separate **Default brand** section on Admin → Branding. Each business unit now
    carries a **Default** badge or a **Make default** button; the default unit is the fallback brand
    for unassigned users, the sign-in page, and the app icon. At most one unit is default (the
    action clears the others in a transaction). `BusinessUnit.isDefault` added; `getDefaultBrand()`
    prefers the default unit, then the `BrandSettings` singleton, then hard Forefront defaults.
  - Migration: `043_default_business_unit.sql` (additive, idempotent). Verified on a throwaway
    Postgres (add column twice → idempotent; Make-default leaves exactly one default). tsc + build green.

- **2026-08-14 — Employees grid: account-level column layout + Business Unit filter:**
  - **Column layout follows the user across devices.** Which columns are open and their
    drag order now save to the account (`User.uiPrefs` JSON, namespaced key
    `employees.columns`) via a fire-and-forget server action — not just this browser.
    localStorage stays as an instant same-browser cache; the account layout is the source
    of truth and seeds the grid at render (SSR-safe, no flash). Cosmetic only — never
    touches data access or money rules.
  - **New Business Unit filter** in the grid toolbar (shown only when units exist),
    persisted alongside the other filters.
  - Migration: `044_user_ui_prefs.sql` (additive, idempotent — adds `User.uiPrefs jsonb`).
    Verified on a throwaway Postgres (add column twice → idempotent; namespaced read works).
    tsc + build green. UI snapshot saved.

- **2026-08-14 — Admin home grouped into categories (mockup-approved):**
  - The HR Admin home cards are now grouped under four section headers — **People**,
    **Benefits & Time-Off**, **Content & Communications**, and **Platform** (Super User
    only). Header = a gold dot + navy uppercase label + hairline rule + a subtle count.
  - Cards, colors, the "N pending" pill, and the hover-to-reveal behavior are **unchanged**
    — only the category headers are new (static HTML mockup approved before building;
    saved under `design-mockups/admin-home/`). No schema change; tsc + build green; UI
    snapshot saved.

- **2026-08-14 — Admin home grouped into categories (mockup-approved):**
  - The HR Admin home cards are now organised under four category headers — **People**,
    **Benefits & Time-Off**, **Content & Communications**, and **Platform** (Super-User-only).
    Header style: a gold dot, an uppercase navy label, a hairline rule, and a subtle count.
    The cards, navy/gold palette, and hover-to-reveal behavior are **unchanged** — grouping
    is the only new device. Static HTML mockup approved before building
    (`design-mockups/admin-home/2026-08-14_categorized.html`). tsc + build green; UI snapshot saved.

- **2026-08-16 — Reset passwords for a chosen set of employees (mockup-approved):**
  - The registry's **Passwords ▾** menu gains a third item, **"Reset selected employees…"**,
    between the existing "Generate for employees without a password" and the Super-User-only
    "Reset ALL passwords". It opens a picker (`ResetSelectedPasswordsModal`) listing ACTIVE
    employees with search, select-all-shown, and a **Has password / No password yet** chip per
    row, so resetting someone who already has a working password is a deliberate act.
  - Closes the gap between "one employee" (their edit page) and "everyone": HR can now reset an
    arbitrary set in one pass and download the one-time CSV. Server side it is a new `selected`
    mode on the existing `generateTeamPasswords` — the result panel, CSV, and
    `mustChangePassword` behavior are reused unchanged.
  - **Any admin may run it** (it is N single resets, already open to HR one at a time); the
    acting admin is excluded and the posted ids are intersected with `status: ACTIVE`
    server-side, so a tampered list can't widen it. No schema change, no migration.
  - Static HTML mockup approved before building
    (`design-mockups/password-reset-selected/2026-08-16_reset-selected-modal.html`).
    tsc + build green; UI snapshot saved; the server filter and hash round-trip were proven
    against a throwaway local Postgres (16 checks, all passing).

- **2026-08-16 — Fixed: the Passwords menu actions never ran (pre-existing, found in testing):**
  - Reported symptom: clicking **"Generate for employees without a password"** (and the new
    "Reset selected employees") produced **no CSV and no result panel**, with
    `Form submission canceled because the form is not connected` in the browser console.
  - Root cause — **not** the new picker. Both existing menu items closed the dropdown from the
    submit button's `onClick` (`setOpenMenu(null)`). React flushes click updates synchronously,
    so the `<form>` was removed from the DOM **before** the browser dispatched `submit`; the
    browser cancelled it and the server action was never called. The new picker inherited the
    same shape via `onClose()`. So **"Generate for employees without a password" and
    "Reset ALL passwords" have been dead since the dropdown refactor** — silently, because the
    failure is console-only.
  - Fix: a `runAndClose` wrapper on the form's `action` that dispatches **then** closes; the
    `onClick` handlers now only ever `preventDefault()` to cancel. Behaviour-only, zero visual
    change. House rule added to `CLAUDE.md` §3b so it can't recur.
  - Verified in a real Chromium against a local Postgres: all three actions produce the panel and
    a correct CSV, and reverting just the fix reproduces the reported console error exactly.

- **2026-08-16 — Benefits: pool total, medical gate, and partial reimbursement (mockup-approved):**
  - **Pool no longer counts guaranteed benefits.** `benefits/page.tsx` summed *every* non-rejected
    claim into `poolUsed`, including summer/marriage/loans/professional-development — which have
    their own budget outside the pool. The employee's "Your pool" figure was understated by
    whatever they'd claimed there. Display only: the server has always built its allowance context
    from `catalogItemId` claims alone, so no claim was ever wrongly refused.
  - **Claims clamp instead of refusing (`clampCovered`).** Reimbursement is now the smallest of the
    coverage share, the benefit's 50%-cap remainder, and the pool remainder. A 10,000 receipt at 80%
    with 7,000 left pays 7,000 — an effective 70%, with the **50% cap overriding the coverage rate**.
    The employee keeps entering the full receipt value (it must match their proof) and the preview
    states the clamped figure before submitting. Only a fully-used benefit or pool refuses.
  - **`BenefitClaim.fullCost`** (migration `045`, nullable, no backfill) records the receipt next to
    the covered amount, and the admin Claims list shows "Receipt X · covers N% = Y · capped to Z" so
    a clamped payout reconciles against its proof instead of reading as a wrong number.
  - **Medical shows locked under 3 months** rather than offering a "Set up" button that the server
    then refuses at commit. **Narrower than first diagnosed:** the benefits page always *derives* the
    tenure band from the hire date, so a manually-set band can't reach the main board path — the
    reachable route is a **plan year left OPEN past its end date**, which makes a recent joiner's
    3-month date fall beyond the window. Verified against exactly that scenario.
  - Mockup approved before building (`design-mockups/benefits-fixes/2026-08-16_…html`); UI snapshots
    saved. Verified with 19 rule/DB checks (the operator's own 30k/15k/8k/7k example) plus a real
    Chromium pass over the Benefits page; `045` applied twice from the file to prove idempotency.

- **2026-08-16 — Summer allowance → Travel allowance, pool-funded (spec 028, migration 046, mockup-approved):**
  - The guaranteed **Summer allowance** (own budget, outside the pool, notionally Jul–Sep) becomes a
    year-round **Travel allowance** in the flexible basket's Lifestyle category: same band amounts,
    paid 100% with **no receipt**, requested in one action, and **drawn from the pool**.
  - Introduces a benefit shape the catalogue lacked: a **fixed allowance**. Four per-band amount
    columns on `BenefitCatalogItem`; any one set makes the item an entitlement rather than a
    coverage-rate claim. **One set of figures for both employment types** — the pool ceilings
    already differ, and a second set would only be a chance for the two to drift apart.
  - The seasonal Jul–Sep window was **never enforced in code** — it existed only as descriptive
    text — so "make it year-round" was a copy change, not a rule change.
  - Migration **copies the amounts off the existing Summer row** rather than hardcoding figures, and
    **retires** that row via cleared eligibility flags rather than deleting it:
    `BenefitClaim.guaranteedBenefitId` is `ON DELETE CASCADE`, so a delete would take every
    historical summer claim with it.
  - HR edits amounts at Admin → Benefits → **Amounts** → *Flexible fixed allowances*, in the same
    table shape as the guaranteed amounts above it.
  - Verified: 26 rule/DB checks with `046` applied twice from the file against a database seeded
    with a configured Summer row **and** a historical claim (both survived); then a real Chromium
    pass — request the allowance, pool 30,000 → 25,000, no price field, no proof upload, second
    request refused, and HR's new Amounts section showing the copied figures.

- **2026-08-16 — Spec 027 MVP built: medical policy year with per-cycle charging (migration 047):**
  - The insurance term (1 Jun – 31 May) no longer shares the benefits cycle's window. A premium is
    committed once for the whole term but **charged to each cycle by month overlap** — 7/12 to the
    year it starts in, 5/12 carried to the next, applied automatically when that cycle opens.
  - **The 2026 transition year is the money**: an employee with a 40,000 premium keeps **21,667** of
    flexible budget instead of 5,000. From 2027 the model **settles** — each calendar pool carries 5
    months of the expiring policy plus 7 of the new, exactly twelve months — which is the check that
    it is right rather than merely different.
  - A leaver's carried charge is **cancelled, not owed**: the advance premium comes back from the
    insurer. Recording it as outstanding would have overstated liabilities on every leaver.
  - **A money bug avoided while fixing an arithmetic one**: `remainingWholeMonths` capped at 12 via a
    loop bound, and `poolCycleFraction` silently depended on that. Uncapping it — the obvious fix for
    a long term — would have made a 13-month cycle yield 13/12 and hand everyone 108% of their
    ceiling. Policy terms get their own uncapped helper; the pool fraction now clamps explicitly.
  - Verified: 40 pure-function checks, 18 database checks (split, cycle-open, leaver cancellation,
    steady state, no-policy-year fallback), migration `047` applied twice from the file against a
    real commitment with its premium unchanged, and a Chromium pass on the pool card. tsc + build
    green; UI snapshot saved; mockup approved before building.
  - **US2 built too** — spec 027 is complete. HR manages the term in a **Medical policy** dialog beside
    Plan year (mirroring it deliberately: adjacent concepts shouldn't look like unrelated features),
    and each commitment carries a **per-cycle breakdown** — months, charge, status, and a total that
    says "reconciles" or turns red. Editing a premium re-splits it across cycles still open, never
    touching a charge already applied to a closed one.
  - **A case that cannot reconcile, by nature**: dropping a premium below what closed cycles already
    absorbed leaves the charges totalling that larger frozen amount — a shut pool can't be
    un-charged. The platform shows the mismatch in red rather than writing a negative charge.

- **2026-08-16 — Spec 030 built: medical premium recoveries for Finance (migration 048):**
  - Spec 027 stopped charging a departed employee's pool; nothing followed the money already paid
    to the insurer for cover after their last day. **/finance** now carries that list.
  - **The feature exists because the product owner challenged the figure** — *"who are we helping
    with that data?"* Shown to HR it was trivia; shown to Finance it is an item with an owner and a
    closing state. The residual after recovery is a real cost of leaving; the point is that it
    becomes a **known** number rather than an invisible one.
  - **The trap, written into FR-002**: the recoverable amount is computed from the leave date, not
    the cancelled charge. 26,000 premium, left 30 Nov → **13,000**, not the 10,834 cancelled —
    December sits inside a charge already applied to the 2026 pool. Building it the obvious way
    would have under-claimed on every leaver.
  - Finance records what actually came back, so the **shortfall** is captured; one partial refund is
    noise, a column of them is a short-paying insurer. Write-offs keep their reason.
  - Verified: 22 checks (expected amount, sync idempotency, settling, frozen figures), `048` applied
    twice from the file, and a Chromium pass settling partially and seeing the shortfall land.

- **2026-08-16 — Spec 029 built: profile change requests (migration 049):**
  - My Profile was read-only in full, so a stale emergency contact travelled through HR's inbox and
    got retyped. Employees now propose a correction; **HR decides field by field, and approving IS
    the edit** — one click writes that column, nothing is re-keyed.
  - **Phone became directly editable** (no request, no review). The decisions log already granted
    it; it had never been built. Nothing reads it for eligibility or money, so review would add a
    person to a change nobody depends on.
  - **The decision lives on the field, not the request** — one request can be part approved and
    part declined, so HR can accept the emergency contact while querying the date of birth, and the
    employee never resubmits what was already right. A request is "open" while any field is
    PENDING; there is no request-level status column to drift out of step.
  - **The "current" value is read at review time, never stored on the request.** Storing it would
    let an approval silently revert an edit HR had made while the request sat in the queue.
  - Values are stored as **text against a field registry** (`src/lib/profile/requestable.ts`), so
    adding a requestable field later is a registry entry rather than a migration plus three edited
    screens.
  - **Dependants deferred** (research R3): an add/remove/edit set rather than a before/after value,
    and the carrier of the medical-commitment warning (US3/FR-015). The contact and personal fields
    deliver the feature; dependants are the next slice.
  - Verified: 40 checks on a throwaway Postgres; `049` applied to a **fresh** DB through the SQL
    runner with `prisma migrate diff` then reporting no drift; and a Chromium pass through the real
    auth-guarded actions (submit → approve one → decline one → close out), 0 console errors.
  - **Flagged, untouched**: the My Documents upload form on the same page logs a pre-existing React
    warning (`encType` on a form with a function action, from commit `c8ef16f`). Not spec 029's, and
    not fixed without a say-so.

- **2026-08-16 — Spec 031 built: per-cycle 50% cap switch (migration 050):**
  - The product owner spotted the compounding: proration shrinks the ceiling, and the 50% cap then
    takes half of the smaller number. A cycle opening 1 Aug leaves any single benefit at 6,250 of a
    12,500 pool — a rule meant to encourage variety stops the employee using the pool at all.
  - **The flag lives on the cycle, not in config.** A global setting would mean flipping it today
    changes the rules a closed cycle's claims were judged under.
  - **The rule change is one line**: `flexCap(ceiling, capEnabled)` returns the **full ceiling**
    when off — deliberately not `Infinity`, so `benefitRemaining` stays finite, the pool keeps
    binding, and `clampCovered` still names the right limiting rule.
  - **Nothing retroactive, and the arithmetic says why the round trip is safe**: with the cap off
    the pool itself is the most one benefit can hold, so an extension that at least doubles the
    ceiling always lands the claim back under cap. Where it doesn't, a past-cap benefit still has
    zero remaining, never a negative.
  - **The mockup caught its own gap**: the first draft only showed a cycle already switched off, so
    the turn-off button never appeared — a state the sign-off would have missed. Revised to show
    on, off, and closed.
  - Verified: 36 checks importing the shipped rule engine; `050` on a fresh DB with no diff drift;
    and a Chromium round trip claiming 9,000 on one benefit with the cap off, then re-enabling and
    seeing it stand unchanged.
  - **Follow-up, approved and shipped**: after an over-cap claim the pool card reads "Used 9,000"
    beside "Per-benefit cap (50%) 6,250" — accurate, but the two numbers together look like a
    contradiction. A focusable `?` beside the cap label now explains it, naming the benefit and
    leading with *the claim stands, nothing is taken back* (the employee's actual worry) before the
    consequence. It renders **only** when a benefit is genuinely over the cap in force, so an
    ordinary cycle carries no permanent question mark inviting a question nobody has.
    - Two positioning attempts: anchored to the 15px marker the bubble ran off the card's right
      edge, because the marker sits two-thirds along the label. It is now sized and placed against
      the card ROW (the marker is deliberately not `relative`), so it can't overflow at any width.

- **2026-08-17 — Unified profile attributes + legal name (spec 029 amendment, migration 051, mockup-approved):**
  - My Profile spoke three ownership dialects at once — grey "Managed by HR" text on Employment, a
    navy pill on Emergency contact, nothing on Personal — and the request form lived in a panel at
    the bottom, far from the data it corrects. Now one language: HR-only cards (Contact, Employment)
    carry the same navy pill; self-edit fields carry a gold "You edit" tag; and the Personal and
    Emergency-contact cards carry their own scoped "Request a change" button — the button IS the
    tag (a request path already says "not self-edit"), so those cards drop the pill.
  - **Legal name** (`User.legalName`, migration `051`) — the full official name as on the national
    ID — is the second direct self-edit field after phone (FR-002b): typed by the employee on the
    Contact card, correctable by HR on the admin employee form, never in the Team Directory.
    `SelfEditField` replaced `PhoneEditor` (one component for both, per the DRY rule).
  - The bottom panel is now the **receipt only** (pending rows, withdraw, HR's per-field
    decisions); while a request is open the card buttons give way to an "Awaiting HR" chip — one
    open request at a time is unchanged. The scoped form sends only its card's fields, which the
    server action already honoured (absent fields are not proposals).
  - **Dependants render as one row each** (name · spouse/child tag · DOB · derived age) instead of
    a comma-joined line.
  - Verified: `npx tsc --noEmit` + `npm run build` clean; `051` applied to a throwaway Postgres 16
    holding the pre-051 schema, a row inserted and read back through `legalName`, and
    `prisma migrate diff` then reporting **no drift** against the new schema.
  - **Follow-up, same day (mockup-approved):** after the user tried it live —
    - Self-edit fields now **rest closed**: a light-gold **Edit** button opens the input and turns
      into a navy **Save**; saving (or pressing Save unchanged, which skips the server) locks the
      field again. The "You edit" tag is retired — the button is the tag. Request-form **Cancel is
      solid red**.
    - **Dependant changes became requestable**, closing the R3 deferral. The Personal card's form
      carries a dependants editor (fix a name/DOB, add, remove — new rows highlighted gold); the
      list travels as ONE `dependants` registry field in canonical JSON text (no schema change),
      HR decides the set in one click, and approval **replaces** the list exactly as the admin
      form writes it. `MedicalCoveredPerson` snapshots survive a removal (link nulls). Same rules
      as the HR form: real non-future DOB, one spouse max.
    - **US3/FR-015 built**: a dependant request from an employee with a committed medical premium
      shows HR a gold warning naming the covered people before any decision.
    - Verified end to end in Chromium: employee saved a legal name through the toggle, proposed a
      dependant addition (send button counted one change), HR saw the medical warning naming
      "Omar Hassan (self), Sara Ali (spouse)", approved in one click, and the third dependant row
      (with the exact requested DOB) appeared on the profile — the SQL showed the `Dependant` rows
      replaced correctly. A fully-decided request leaves the queue (scenario 6), employee panel
      shows Approved with decider and date. Zero unexpected console errors.
  - **Third round, same day (mockup-approved): Arabic legal name + national ID (migration 052).**
    - Legal name split into **English** (`legalName` — existing data stays here) and **Arabic**
      (`legalNameAr` — the input and resting display are `dir="rtl" lang="ar"`); `SelfEditField`
      grew `dir`/`lang` props. **National ID** (`nationalId`, free text max 30) sits on the
      **My Documents card above the upload section**. All three: gold Edit→navy Save self-edit,
      no HR review, HR-correctable on the admin form (Arabic input RTL there too), never in the
      Directory. One shared server helper backs the three actions.
    - Verified: tsc + build clean; `052` applied to a throwaway Postgres holding the pre-052
      schema with an Arabic value round-tripped intact and `prisma migrate diff` reporting no
      drift; Chromium pass saved the Arabic name through the toggle (input confirmed RTL), saved
      a national ID above the upload section, and both survived reload. Zero unexpected console
      errors.
  - **Round 5, same day (mockup-approved): strict phone + national ID, CSV completeness
    (migration 053).** Phone = country dropdown (full list, Egypt default, `src/lib/phone.ts`)
    + digits-only input, stored as one `+<dial><digits>` sequence, length per country — on the
    employee's phone, the emergency contact phone (request form + HR form), the admin form,
    grid inline edits, and the importer (strict everywhere, server-enforced). National ID:
    exactly 14 digits. `053` normalizes legacy stored phones that confidently parse (verified:
    all four shapes → `+201001234567`, `ext. 4412` untouched, idempotent). CSV export gains
    Legal Name (EN/AR) + National ID and the importer reads them back — a sheet WITHOUT those
    columns leaves stored values untouched, so old sheets can't wipe employee-typed data.
    Chromium-verified: 10-digit Egypt rule rejected client- and server-side, Saudi 9-digit
    saved, non-digits can't be typed, 13-digit ID rejected/14 accepted, emergency phone submits
    as one sequence through the request flow, and the export carries the new columns + values.
  - **Fourth round, same day: cancel while editing.** Every self-edit field's open editor now
    carries a red **Cancel** beside Save, and **Escape** does the same — either discards the
    typed text and restores the saved value (re-opening starts from the saved value). Verified in
    Chromium: cancel via button, cancel via Escape, re-open holds the saved value, and a normal
    save still persists after cancel round-trips. Zero unexpected console errors.

- **2026-08-17 — Spec 033 built: profile data request campaigns (migration 054, mockup-approved):**
  - HR had no way to ASK sixty people to fill the registry fields that now exist. HR Admins,
    Finance, and Super Users compose a campaign (title + registry fields + audience: everyone /
    departments / picked people, frozen at launch); every targeted active employee meets a
    dismissible popup on their next page load — empty fields to fill, prefilled ones with
    ✓ Confirm / Edit — and a gold sidebar notice keeps the pending count until they finish.
  - **Answers write directly to the employee record** (aligned decision: HR asked for the data),
    so My Profile, the registry, and the CSV export reflect them instantly. The campaign tables
    (`DataRequestCampaign`/`Target`/`FieldState`) only record who was asked and what happened —
    per field: FILLED / CONFIRMED / CORRECTED, derived **server-side** from what the record held
    (the client can never claim "confirmed" for a changed value). Partial saves are natural: a
    field participates only once engaged; one answer settles the same field across ALL open
    campaigns; an employee can only ever answer fields requested from them.
  - **One field registry** (`campaign-fields.ts`) composes the four self-edit fields with the
    change-request registry, so campaigns reuse every existing rule and editor (per-country
    phone input, RTL Arabic, 14-digit ID, dependants list editor — now extracted to a shared
    `DependantsListEditor`). Tracker per campaign: per person per field, chips + entered values;
    leavers drop out of the denominator; Close ends the asking without touching written answers.
  - Verified: tsc + build clean; `054` applied twice to a pre-054 throwaway Postgres with
    `prisma migrate diff` reporting no drift; Chromium end-to-end — HR composed and launched to
    all actives, employee met the popup (1 to fill · 1 to verify), Later kept the sidebar count,
    the notice re-opened it, a 5-digit ID was rejected server-side, fill + confirm completed the
    request (popup and badge gone), the tracker showed Filled/Confirmed with values, the CSV
    carried the campaign-filled ID, and closing removed a still-pending admin's own popup while
    the tracker stayed readable. Zero unexpected console errors.
  - **Live-testing follow-up, same day:** a partial save now KEEPS the popup open ("Saved — N
    fields left"; close button becomes **Finish**; only Finish or completing everything closes
    it), the save-count only counts fields still on screen, and a ✓ Confirmed field keeps an
    Edit button — confirming a legacy value the rules now reject (11-digit ID) errors and the
    employee can switch straight to editing. Plus: **campaign outcome CSV** (Download CSV on the
    tracker — value + outcome pair per field, per person) and the registry grid gained
    **Legal name (EN) / (AR) / National ID** columns (hidden by default, in the Columns menu,
    inline-editable under the strict rules). All 17 Chromium checks green, including the exact
    reported repro (invalid legacy ID confirm → error → Edit → correct → save).
  - **Second live-testing round, same day: per-field save.** Each popup field is now its own
    form — ✓ Confirm saves immediately, Save/Enter saves that one field, errors stay on their
    row with Confirm/Edit intact. The field list freezes at open so answered rows KEEP showing
    their value with a ✓ Saved/✓ Confirmed chip (the layer stays mounted through the final
    save); the bottom buttons only close (Finish + Later). Chromium-verified end to end,
    including Enter-to-save isolation and the invalid-legacy-ID repro.
  - **Third live-testing round, same day: idempotent answers + sitting store + delete.** Root
    cause of the reported dead-ends: a refresh could land mid-save and settle a field while the
    UI still showed it actionable — every later action on it then errored. The server now
    accepts an answer for ANY requested field (latest wins), and a per-tab sitting store keeps
    the popup's rows and chips immune to remounts. HR/Finance can also DELETE a campaign (list
    + tracker, confirmed) — tracker history goes, profile writes stay. Verified against a
    PRODUCTION build this time: 20 scenario checks including both reported repros and a forced
    externally-settled field. Zero unexpected console errors.
  - **Fourth live-testing round, same day: the dead badge.** Layouts do not re-render on
    client-side navigation, so a campaign launched mid-session never reached the popup (badge
    server-rendered, click dead). The layer now polls its own API (mount + tab focus + 30s),
    merges new asks (auto-open), and broadcasts the live count to the badge, which also clears
    live on completion. Answered rows carry an Edit button for mistaken confirmations (latest
    answer wins; tracker shows Corrected; Cancel restores the chip). 14/14 production checks
    including the exact reported scenario.

## 2026-08-20 — Pool-ceiling invariant + employee-form save fix (shipped, no migration)

**Pool ceiling — nine write paths closed.** An employee finished a cycle 2,093 over a 10,000 pool
and the report rendered it as "Remaining 0 · Pool exhausted". Traced and reproduced: a medical
commitment made in an earlier cycle leaves no charge row for a cycle that was undated at commit
time, `medicalCycleCharge` counts only APPLIED rows, so the pool read as untouched and the claim was
allowed correctly — then `reconcileMedicalCharges` created the missing row straight to APPLIED.
- ONE derivation of the ceiling and the balance, `src/lib/benefits/pool.ts`, used by the report, the
  claim path and every medical write. Previously three, and they disagreed. Proven equivalent to the
  report's previous maths across 162 employee/window/config combinations.
- Guarded: `commitMedical`, `recordMedicalBackfill` (+ HR amount override), `repriceCommitment`,
  `applyScheduledMedicalCharges`, `reconcileMedicalCharges`, HR Record entry (flexible),
  `flatAllocation`, `reopenClaim`, `createClaim`. Medical is refused, never clamped; a carried charge
  that no longer fits stays SCHEDULED rather than being applied or cancelled.
- `remaining` is now **signed**; the report gained an `OVER_POOL` chip naming the amount.
- Concurrency: per-employee row lock (`withPoolLock`). A Serializable transaction also worked but
  aborted unrelated employees' writes (1 of 6 concurrent); the row lock gives 6/6 unrelated and
  serialises the same employee to 1.
- Verified against throwaway Postgres: the exact reproduction (before 11,223/10,000 — after held),
  plus seven sequences covering both orders, HR back-fill, reject→spend→reopen, walking to the
  ceiling, ten concurrent claims and reconcile onto a spent pool.

**Employee form.** A legacy phone or national ID nobody had touched made the whole record unsavable
(employment type included) with the reason rendered off-screen. An unchanged stored value now passes;
changed values stay strict everywhere; the banner is announced, scrolled to, focused, and lists every
fault at once.

**Benefits Reporting scroll.** Page scrolls, title stays pinned, table header parks beneath it
(offset measured at runtime). Boxed below `xl` so the frozen first column every other table has is
kept at widths where the 860px table does not fit beside the sidebar.

**Over-pool resolve action — built 2026-08-20 (migration `059`)**
Four routes from the report row's popup, plus an **Over pool** status filter to find every affected
person. Reduce a flexible claim (reduce-only; a reimbursed claim is refused and sent to Finance),
**raise the ceiling for the cycle — Super User only**, re-price/remove medical (existing tab), or
accept and note why. Every route needs a reason; both decisions are undoable. Gates are server-side,
not just hidden buttons. New table `PoolCeilingException`, migration `059` verified idempotent by
applying it twice from scratch. 6 new tests (33 total, all passing).

**Decided 2026-08-20, no work needed**
- Registry + catalogue keep today's boxed treatment (frozen first column). The scroll-away header
  stays limited to tables that genuinely fit.

**Regression guard — built 2026-08-20 (a tool, not a routine)**
No testing regime: nothing scheduled, nothing gating a deploy, no standing obligation on any session.
What prevents recurrence is structural — one derivation of the ceiling, the guards on each write
path, the per-employee lock. `npm test` is there for the moment someone is editing benefits code.

`npm test` (`tests/`, node:test + tsx, no new dependencies). 20 pure money-rule checks always run;
7 database-backed invariant scenarios run when `TEST_DATABASE_URL` points at a disposable database.
`tests/setup.ts` refuses Neon or any database whose name lacks "test", because the suite truncates.
Verified by sabotage — flooring `remaining`, dropping medical from `used`, and removing the pool
limit from claim clamping each make it fail. The first attempt did NOT catch the flooring bug
(the assertion relied on `over`, which that bug neuters); assertions now compute the overrun from
`medical + flex` against the ceiling instead.

## Reviews & 1:1s — spec 042 (built 2026-08-24, migration `071` pending on Neon)

Quarterly reviews filled across the quarter, ad-hoc 1:1s, a private journal, and per-employee
CliftonStrengths profiles parsed from uploaded Gallup PDFs.

**Built**: 9 tables + 4 enums (migration `071`, idempotent, seeds the 34 themes) · the rules layer
(`src/lib/reviews/`: access, quarters, agenda, gallup, pack, queries) · six routes under `/reviews`
plus the Gallup file route · the strengths panel on the employee admin page · sidebar entry and
module release switch.

**Verified from this session** (throwaway Postgres 16, not the live Neon database):
- `068` applied **twice** to a pre-039 database — clean no-op the second time; 9 tables, 34 themes,
  `Self-Assurance` spelled correctly, partial unique index present.
- 29 assertions against the **real** derivations: the seal holds at each of the four steps and opens
  only at the fourth; a quarter with both halves submitted but no meeting stays sealed and produces
  no outcome; Super User, HR Admin, an unrelated employee and a **new** manager all read
  not-found while the previous manager still reads their own sheet; a promoted journal entry
  survives its source being edited and deleted; re-promoting the same source is refused while plain
  typed answers stay unconstrained; an outcome only one party agreed does not carry forward.
- The Gallup parser against **both real reports** — 34 themes and 5 themes from one code path — and
  against a non-Gallup PDF, which fails into manual entry rather than throwing.
- `requireUser` appears nowhere in the module's code (only in the comment explaining why); no money
  term and no benefits import anywhere in it.
- `npx tsc --noEmit` and `npm run build` clean.

**Not verifiable from a session**: the impersonation refusal needs a live request with a session and
the impersonation cookie — it is enforced structurally (`requireRealUser` is the single entry point
of every page and action, confirmed by grep) but has not been exercised end-to-end in a browser.
Worth one manual pass: sign in as a Super User, view as an employee, open Reviews.

**Remaining**: apply `068` on deploy and check the build log's `[apply-sql]` lines; a browser pass
over the six screens.

## Notes / carry-over
- Planning docs originally drafted in a prior session were staged in another repo (inaccessible from HR_ERP-scoped sessions); they have been recreated here as the canonical copy.
- Benefits figures are now **confirmed** (pool ceilings, guaranteed amounts by band, medical rate card) — see spec `007` and `PROJECT_DETAILS.md §5`. Claims/reimbursement remains Phase 2.

---

*Last Updated: 2026-08-24 — Reviews & 1:1s merged into main and renumbered to spec 042 / migration `071`; it had claimed 040/068 while those were free, and Finance took them first. Both migrations apply on deploy. Previously: 2026-08-23 — Sub-6-month pool ceilings now scale to the cycle like everyone else's; the claims queue's pool meter counts only pool-funded claims (a Loans request no longer reads as an emptied pool). Previously: 2026-08-20 — Pool-ceiling invariant closed across nine write paths (Yosra overrun traced to reconcile applying a carried charge onto a spent pool); employee-form save fix; Benefits Reporting scroll-away header. Previously: Official holidays + team vacation announcements (spec 037, migration `057` auto-applies on deploy; set `CRON_SECRET`); HR claim reopen with reason; Time-Off badge liveness fix. Previously: Per-person guaranteed-benefit grants (spec 036, migration 056 pending); Time-Off v2 (spec 035: working-day counts, holidays + Excel upload, live manager badge, current-manager routing, cancel-approved — Neon migration 055 pending); Benefits Reporting (spec 034); Finance payments sub-tabs; tracker auto-refresh fix. Previously: 2026-08-20 — Pool-ceiling invariant closed across nine write paths (Yosra overrun traced to reconcile applying a carried charge onto a spent pool); employee-form save fix; Benefits Reporting scroll-away header. Previously: Official holidays + team vacation announcements (spec 037, migration `057` auto-applies on deploy; set `CRON_SECRET`); HR claim reopen with reason; Time-Off badge liveness fix. Previously: Per-person guaranteed-benefit grants (spec 036, migration 056 pending); Time-Off v2 (spec 035: working-day counts, holidays + Excel upload, live manager badge, current-manager routing, cancel-approved — Neon migration 055 pending); Benefits Reporting (spec 034); Finance payments sub-tabs; tracker auto-refresh fix.*
