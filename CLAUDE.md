# Claude Code Instructions for HR_ERP

> This file is automatically read by Claude Code at the start of each session.
> It contains project-specific instructions, guidelines, and configuration.

---

## The Four-File System (read these first, every session)

This project is steered by four living documents plus a spec folder. Read them
in this order at the start of every session:

1. **`CLAUDE.md`** (this file) — how to work, conventions, house rules.
2. **`PROJECT_DETAILS.md`** — technical reference: stack, schema, modules, decisions that are settled.
3. **`IMPLEMENTATION_PLAN.md`** — the source of truth for phases, scope, and the decisions log (including open decisions).
4. **`IMPLEMENTATION_PROGRESS.md`** — the live tracker of what is built, in progress, and next.
5. **`specs/`** — the spec-kit home for per-feature specifications (one folder per feature, authored via `/speckit-specify`). This is the written product-spec set; code must match it.

**When any of the above changes materially, update it in the same commit as the code.** A drift between `specs/` and code is a documentation bug — report it before silently realigning.

### Spec-Driven Development (spec-kit)
This project uses **spec-kit** for feature work. The governing document is
`.specify/memory/constitution.md` (our house rules in enforceable form). Per feature, follow:
`/speckit-specify` → `/speckit-clarify` (if ambiguous) → `/speckit-plan` → `/speckit-tasks`
→ `/speckit-implement`, honoring "Align Before Building" at every gate. Specs live in `specs/`;
the four steering files above track scope, decisions, and progress across features.

#### Spec-kit skills — use them, don't freehand
The `/speckit-*` steps are **installed skills**; invoke them via the Skill tool (or the
matching `/speckit-…` slash command) rather than improvising the equivalent by hand. Use
the right one for the moment:

| Skill | When to use it |
|-------|----------------|
| `speckit-specify` | Start or rewrite a feature's `spec.md` from a plain-language description. |
| `speckit-clarify` | The spec is ambiguous — ask up to 5 targeted questions and fold answers back in. |
| `speckit-plan` | Turn an agreed spec into design artifacts (the implementation plan). |
| `speckit-tasks` | Generate the dependency-ordered `tasks.md` from the plan. |
| `speckit-analyze` | Non-destructive consistency check across spec ↔ plan ↔ tasks after tasks exist. |
| `speckit-checklist` | Produce a focused review checklist for a feature. |
| `speckit-implement` | Execute `tasks.md` in order. |
| `speckit-converge` | Assess built code vs. the spec/plan/tasks and append any unbuilt work as tasks. |
| `speckit-constitution` | Create/update `.specify/memory/constitution.md` and keep templates in sync. |
| `speckit-taskstoissues` | Convert tasks into GitHub issues (only when we've decided to track on GitHub). |

**Rules of use:** always **align before running** a step that writes artifacts (specify/plan/
tasks/implement) — the constitution's "Align Before Building" applies to spec-kit itself. When
touching an existing v1 module, prefer **`speckit-converge`/`speckit-analyze`** to surface gaps
before adding tasks. Whatever a skill writes into `specs/` must stay in sync with the code and the
four steering files (same commit).

---

## Working Guidelines

### 1. CRITICAL: Never Act Without Alignment
- **NEVER implement features or make significant changes without explicit user confirmation.**
- **When the user says "let's align first" — STOP and discuss before any implementation.**
- **Always present the plan/structure and wait for confirmation before coding.**
- **If uncertain about requirements, ASK — do not assume.**
- **This rule is NON-NEGOTIABLE.**

### 1b. CRITICAL: Align Before Every Fix or Change
- **Before implementing ANY fix or change, explain what you plan to do in simple, non-technical words.**
- **Wait for the user to confirm before writing any code.**
- **If there are multiple approaches, present them as options with a clear recommendation.**
- **Never redesign, restyle, or restructure anything that wasn't explicitly asked for.**
- **Stick to exactly what was requested — no extra "improvements" or visual changes.**
- **If a fix requires touching something the user didn't mention, flag it and ask first.**

### 1c. CRITICAL: UI Changes Require Explicit Approval
- **NEVER change any UI design, layout, styling, or visual element without explicit user approval.**
- **This includes: colors, borders, spacing, card designs, labels, icons, section order, font sizes — EVERYTHING visual.**
- **Product design language is navy/gold (from the Forefront reference tool).** The benefits selector's **layout & interaction model** is a preserved asset — port its structure faithfully, recolored to navy/gold; do not redesign it.
- **When restoring a design, match the original EXACTLY.**
- **MOCKUP-FIRST (NON-NEGOTIABLE): never adjust a design — layout, structure, section order, styling, or any visual element — without first showing the user a static HTML mockup of the proposed look and getting explicit sign-off on that HTML view.** Build the mockup (self-contained HTML, navy/gold palette, saved under `design-mockups/<feature>/<YYYY-MM-DD>_<desc>.html` and published as an Artifact for review), wait for approval, and only then touch the real components. No "I'll just build it and you review at the end" for visual/structural changes.
- **After ANY UI change, save a snapshot of the changed file to `ui-versions/` (see UI Version Tracking below).**

### 2. Think Before Acting
- **Don't follow commands blindly** — analyze requests and challenge if something seems incorrect or risky.
- **Align before action** — if there's ambiguity or risk, discuss first.
- **Consider implications** — think through downstream effects before implementing.

### 3. Quality Assurance
- **Always verify the build** — run `npx tsc --noEmit` and `npm run build` before handing anything over.
- **Fix type errors across the outcome** — don't leave TypeScript errors unresolved.
- **Test implications of changes** — ensure changes don't break existing functionality.

### 2b. CRITICAL: No Unneeded Complications
- **Answer the question that was asked, at the size it was asked.** A small request gets a small
  answer — one script, not four; one file, not a set; one paragraph, not a briefing.
- **Deliver ONE thing.** Never hand over alternatives, variants, or a "quick version and a full
  version" and leave the user to choose. Pick the best one and give that.
- **A check must answer in words**, not leave the user to interpret a blank result.
- **Don't expand scope mid-answer.** Extra options, extra tooling, extra explanation the user
  didn't ask for are noise — flag a genuine concern in one sentence and move on.
- **Prefer the shortest thing that works**, and only add detail when the user asks for it.

### 3a. CRITICAL: Audit Fixes Before Asking the User to Test
- **Never hand over a fix and ask the user to test it without auditing it yourself first.** The user's time is not a substitute for verification.
- **Prove the fix works with the tools available**, not by reasoning alone:
  - Always run `npx tsc --noEmit` and `npm run build`.
  - For **DB/schema/seed changes**, apply the SQL to a **throwaway local Postgres** and query the exact rows/columns the pages read, confirming the real outcome (a local Postgres 16 is available: `initdb`/`pg_ctl` under `/usr/lib/postgresql/*/bin`, run as the `postgres` user, socket under `/tmp`). Do **not** assume seed SQL applied cleanly or produced the right data.
  - For behavior changes, trace the actual code path end-to-end.
- **State what you verified and how** when handing over. If something is genuinely un-testable from here (e.g. the user's live Neon DB), say so explicitly and explain the residual risk — don't present unverified work as done.
- **When a symptom persists, re-audit from first principles** instead of repeating the same instruction. Find the proof (e.g. "the Handbook still lists section X, which only migration 005 removes") before concluding.

### 3b. Engineering Preferences (Overrides Defaults)
- **DRY: flag repetition aggressively** — extract at 3+ repeats; flag at 2.
- **Edge cases: handle more, not fewer** — nulls, empty states, unexpected input, boundaries.
- **Aim for "engineered enough"** — not fragile, not over-abstracted. When in doubt, ask.
- **Explicit over clever** — readable, obvious code over compact/clever solutions.
- **Server pages people MONITOR must keep themselves live** — layouts and server pages never re-render on client-side navigation or while sitting open, so a badge/queue/tracker painted once goes stale (cost us the dead campaign badge AND the tracker showing "Pending" while the fresh Excel said "Complete"). Pattern: a poller (mount + focus + interval) hitting a small API and broadcasting a `hrerp:*` event (`DataRequestLayer`, `TimeOffBadgeSync`), or `AutoRefresh` (router.refresh on focus + 30s) for whole pages. Apply it to any new surface whose data other people change.
- **A money ceiling must be enforced on EVERY write path, in every order** — the benefits pool was
  guarded only on the flexible-claim path, so whether it held depended on which write happened first;
  everything that changed the numbers afterwards (applying a carried medical charge, re-pricing,
  back-filling, reopening a rejected claim, re-banding) wrote freely, and the report floored the
  overdraft to zero so nobody could see it (cost us a 2,093 overrun; found 2026-08-20). Rules: derive
  the limit in **one** place (`src/lib/benefits/pool.ts`) — three copies of one money rule means the
  loosest one pays; keep the remaining figure **signed** so an overdraft is distinguishable from an
  exactly-spent pool; refuse rather than clamp when a thing cannot be part-bought; hold money that no
  longer fits (never drop it, never silently draw it); and lock **per subject** — a Serializable
  transaction aborted unrelated employees' writes (1 of 6), a `SELECT … FOR UPDATE` on the employee's
  own row gives 6/6 while still serialising that one person.
- **A table cannot both freeze its first column and park its header under a pinned title** — freezing
  needs a scrollable box, and a sticky header inside a box sticks to the box, not the page. Wide
  tables stay boxed (`ff-data-scroll`); only a table that genuinely fits gets the page-scrolled
  treatment, and then only at the widths where it fits (`ff-scroll-below-xl` covers the rest).
  Any non-visible overflow makes a box a scroll container — `overflow-x: auto` alone is enough to
  break a page-level sticky header.
- **An all-or-nothing form must put its rejection where the eyes are** — the employee edit form validated the WHOLE record on save and rendered the reason at the top of a four-section form while Save sat at the bottom, so a legacy phone silently killed every unrelated edit and read as a dead button (cost us "part-time won't save"; found 2026-08-20). Two rules: (a) a whole-record validator must never reject over a stored value the operator didn't touch — pass the current values in and exempt unchanged ones; (b) an error banner needs `role="alert"`, `tabIndex={-1}`, and a `scrollIntoView` + `focus` effect, and must report **every** fault at once, not just the first.
- **A NATIVE date input cannot carry a house date format, and a date-only string must never be parsed to print it (2026-08-25)** — the review-table editor reached for `<input type="date">`, which is what everything else in the app uses for date *plumbing*. A native picker draws itself in the **browser's own UI language**: measured in a real browser, 1 March 2021 rendered `03/01/2021` under en-GB, ar-EG **and** en-US, so the operator would type dd/mm/yyyy into a field labelled the American way round. Where a date is genuinely being *entered*, the field is typed text stating `dd/mm/yyyy`, parsed and refused on the server. Two more from the same hour: printing a stored date-only string means **reordering the string**, never `new Date(iso).toLocaleDateString(…)` — an ISO date-only string is UTC midnight and a viewer behind UTC gets the previous day (`formatDateISO`); and `new Date("01/03/2021")` is **American**, so any importer that leans on it silently reads an operator's 1 March as 3 January — no warning, no wrong-looking output, just an assignment closing in the wrong quarter. Day-first, everywhere a person's sheet is read.
- **Every export from a `"use server"` file is an ENDPOINT, so a raw write never lives there (2026-08-25)** — the incentive review-table save was first written with its transaction inline in `actions.ts`, which would have been fine, and then the verify script needed to call the same code. Exporting it from that file to share it would have published an **unauthenticated write to compensation figures** at a URL the browser can post to. The write moved to `src/lib/incentive/persist.ts`, and the action stayed what an action is: the access check, the validation, and a call. Rule: an action file exports actions — anything a script, a job, or another action also needs is a plain module, and it is the action's job to have checked who is asking before it calls one.
- **A `useActionState` dispatch fired from a plain button needs `startTransition` by hand (2026-08-25)** — used as a `<form action={…}>` React wraps it for you; called from an `onClick` it is not, and React silently never reports `isPending`. The Recalculate button therefore never said "Recalculating…" and never disabled itself, so a second click landed a second write — on a button whose whole job is to rewrite three tables. Nothing in the type check or the build says a word; the only evidence is a console warning in a real browser, which is where it was caught. Sibling of the submit-button rule below: React's form plumbing does several things for you, and the moment you step outside a `<form>` you inherit all of them.
- **Never close a menu/modal from a submit button's `onClick`** — React flushes click updates synchronously, so the `<form>` unmounts before the browser dispatches `submit`; the action silently never runs ("Form submission canceled because the form is not connected" is the only clue). Dispatch first, then close — wrap the action: `action={(fd) => { dispatch(fd); setOpen(false); }}`. Cost us a shipped-but-dead bulk password action; found 2026-08-16.
- **Per-module authority is an APPOINTMENT, never a new `Role` member** — "someone who runs
  Learning but is not HR" was built as a `LearningManager` row, not a role. A new role value is
  something every other module's check has to be right about forever; an appointment is inert, the
  person stays an `EMPLOYEE`, and the employee form does not change — so it cannot leak into
  Benefits or salaries because there is nothing new to misread. Rules: **one derivation**
  (`canManageLearning` = role OR appointment) asked by the pages, the actions, the sidebar door and
  the serving routes alike — never `isAdmin` for that module again; the **role-holders are never
  rows** (HR holds it because they hold everything, so emptying the table cannot lock them out, and
  they get no Remove button that would lie about it); and **the appointment cannot appoint** —
  granting stays `requireAdmin()`, or the role hands itself out. A restricted admin home shows the
  ONE section they own, and the other modules' counts are not fetched at all.
- **A count shown beside a choice must be THAT choice's count** — the Learning access panel counted
  everyone matched by ANY audience rule and printed the same total beside every row, so a nine-person
  department and an empty business unit both read 23. The column existed solely to expose a rule
  reaching nobody, and it could not (found + fixed 2026-08-22, `audienceReachByRule`). Two rules:
  compute per subject, and compute it **through the same derivation the real check uses**
  (`audienceWhere`) — a count written separately to "look right" will eventually disagree with who
  actually gets the thing, and then it is worse than no count. Related: **one way to say
  "everyone"** — the same panel offered it as a course setting AND as an audience rule, so a course
  could read RESTRICTED while reaching the whole company.
- **A GATE IS NOT A SCALE, and a meter must count only what the decision moves** — one money rule
  broke twice on the same screen family (2026-08-23). (a) `poolCeiling` has two doors — 6 months for
  the pool, 3 months for medical — and the sub-6 branch mistook its door for a *scale*, prorating by
  the mid-joiner fraction, which is **1** whenever the 3-month mark lands on or before the cycle's
  first day. A newcomer on a six-month cycle therefore carried the WHOLE annual ceiling — double
  their colleagues — and the report printed no *prorated* tag, so nothing looked wrong. Ask the two
  questions separately: *may they have it* (threshold) and *how much of the window is this*
  (`poolCycleFraction`, one scale for everybody); a reduction that belongs to the thing bought
  (medical's ÷12 premium) never belongs on the container that bounds it. (b) The claims queue's
  "their pool after this" meter summed EVERY claim, so a 90,000 salary-driven Loans request read as
  an emptied pool — a number the enforcement path (`poolStateFor`, `catalogItemId` only) never
  agreed with. A figure shown next to a decision must be computed from exactly what that decision
  changes, through the same derivation the write uses; when the decision moves nothing, say so in
  words ("Not from the pool") rather than drawing a meter at zero.
- **A visibility rule needs ONE source and must be re-decided at the door** — the Learning
  materials tab labels three document slots and the employee page only ever selects one, but
  neither is a control: a URL is a URL, and somebody who has seen a slides link can guess an
  outline one. `EMPLOYEE_VISIBLE_SLOTS` (`src/lib/learning/materials.ts`) is the single source, and
  `/api/learning/documents/[id]` asks it again on every request — answering **404, not 403**, since
  "forbidden" confirms the file exists. Same shape as the pool ceiling: derive once, enforce on
  every path.
- **Nobody is told money arrived until it has (spec 041, 2026-08-24)** — the CEO: *"previously the employee would receive the email of their benefit or any transaction when the finance confirm, but actually this notification should be connected to my financial confirmation to avoid confusion."* Since spec 020 a claim became Reimbursed and the employee was emailed the moment **Finance** recorded a transfer — hours or days before the bank released it. Rule: the two messages in the whole application that announce money reaching a person (a reimbursed benefit claim, a paid payback) fire **only** when the appointed confirmer marks the bank transaction complete. Messages that announce a *decision* (submitted, approved, declined, reopened) stay where they are — a decision is true when it is made. When adding any new "your money is here" email, ask which event actually makes it true.
- **Say what the person does, in their words (spec 041)** — two drafts of the same feature were wrong because of one verb each. "Approve" implied the platform gates the money (it never does — the bank does, on two signatures), and "send to the bank" implied Finance transmits something (they **create** the transaction there). The wrong word had produced the wrong design both times, not just the wrong label. The settled vocabulary: Finance **creates** transactions in the bank and **submits for confirmation**; the confirmer **confirms** them in the bank and marks **Transaction complete**; disagreeing is **Return to Finance**; and the group has **no collective noun on screen** — the UI says "3 transactions". `PaymentBatch` survives as an internal model name only, with a test asserting the summary line never says "batch" and structurally cannot carry a payee name.
- **An appointment's role-holders are implicit — EXCEPT where that would make a promise false (spec 041)** — `canManageLearning` unions the role so emptying the table cannot lock HR out. `canConfirmBatches` deliberately does **not**: the instruction was that transactions wait for the appointed person and nobody stands in, so an implicit power held by every top-level account would make the product promise a control it does not enforce. Lock-out is prevented instead by allowing **self-appointment** — an empty list is a pause of one click, not a wall. The departure is documented in the code, the spec and the constitution, so nobody "fixes" it into consistency.
- **A figure a decision is made against is FROZEN, not derived (spec 041)** — everywhere else in Finance a total is derived on read, precisely so two screens cannot disagree. The confirmer is the one exception: he acts on a number emailed to him hours earlier, so the total is computed once at submission and stored, and the payables are locked while it stands. Deriving it on read would let the emailed figure and the confirmed figure diverge at the only moment that matters.
- **An enum member's POSITION matters, and only the database can tell you (spec 041)** — adding a state mid-lifecycle is `ALTER TYPE … ADD VALUE … BEFORE`, and picking the obvious neighbour was wrong twice: the live type's order is not the order `schema.prisma` declares, so `BEFORE 'PAID'` landed the new member after `REJECTED`, leaving the database sorting differently from the code. Query `pg_enum` on a throwaway database and look, rather than reasoning from the statement.
- **An already-applied migration will NEVER run again — so never edit one (spec 041)** — `scripts/apply-sql.mjs` records each file in `_sql_migrations`. Editing a file that a preview deploy already applied silently loses the change on that database forever, while a fresh one gets it: two databases, one file, different shapes. Ship the delta as a **new** numbered file, and where the earlier version may already be out there, make the new file **converge** any stale database (guarded renames of columns, indexes, constraints and enum values). Proven the hard way by building both databases locally and applying to each.
- **A shared control must be scoped to the thing it actually guards (spec 041 amendment, 2026-08-25)** — the confirmer appointment shipped company-wide, and the CEO's correction was one sentence: *"we need it by business unit. as every business unit might have an account to confirm and accordingly different people."* Each unit banks separately, so a company-wide appointment let one unit's person release another unit's money, and let Finance put two units' payables into a single transaction only one account can settle. Rules: the scope is **derived, never typed** (a payback and a claim take the employee's unit, a float top-up its custodian's — nobody chooses a bank account from a dropdown); the screen makes mixing **structurally impossible** (one form per unit, so there is no list containing two) and the server **re-checks anyway**, because "the UI doesn't offer it" has never been a control; and there is deliberately **no appointment meaning "all units"** — that would silently cover a unit created next month, which is the implicit authority the appointment pattern exists to avoid. An unscoped subject (a person with no business unit) is **grouped, shown and refused**, never attributed by guesswork: guessing the scope means guessing whose money moves.
- **DROP the old uniqueness BEFORE widening it, or `ON CONFLICT DO NOTHING` eats the migration (2026-08-25)** — moving `TransactionConfirmer` from one-row-per-person to one-row-per-person-per-unit means inserting a SECOND row for somebody who already has one. The old single-column unique index was still standing when the expansion ran, so every insert violated it and the conflict clause swallowed the violation **without a word**: two appointments across five units produced 2 rows instead of 10, and the migration reported success. Nothing in the output said so; only counting the expected rows found it. Order the statements so the constraint being replaced is gone before the rows that need the new one arrive — and check a migration by the count it should produce, never by whether it errored. Related, same file: the "no business units yet" branch was changed from warn-and-return to **RAISE EXCEPTION**, because `apply-sql.mjs` records a file only on success — a warning would have marked it applied, left both columns nullable on that database forever, and given a fresh one NOT NULL.
- **A parse is only as good as the total it is CHECKED against (2026-08-25)** — importing the
  marketing workbook went wrong twice, and neither showed up in the output. First, each old tab's
  SUM row was read as one more purchase, silently **doubling** two months. Then `JAN`'s column
  headers were believed — its "DESCRIPTION" column actually holds the receipt hyperlink — so every
  January line lost its receipt and gained `[object Object]` for a description. Both were invisible
  in 1,100 lines of generated SQL and both were caught the same way: comparing each tab against the
  total the **sheet itself states**, and the whole import against the one figure the CEO had
  confirmed. So: never ship a parse nothing has checked; read a spreadsheet's **cells**, not its
  labels; and when the source's own total is wrong (four of this workbook's SUMs are short by a
  row), **report the difference rather than absorb it** — the person reading the screen has the
  sheet open next to it. Related: a generated migration nobody can review line by line is
  reviewed through its **generator**, so the generator is what gets committed and commented.
- **A receipt that lives somewhere else is still one door (2026-08-25)** — the imported history's
  receipts are Drive links, with nothing to upload. `ExpenseEvidence` gained `externalUrl` beside
  `blobUrl` (exactly one, by check constraint) and `/api/expense-evidence/[id]` **redirects** after
  making the identical entitlement decision — still 404, never 403. The alternative, letting the UI
  link straight out for external receipts, would have created a second path to a receipt that
  answers to nobody. Where a thing is stored is a delivery detail; who may see it is not.
- **Reuse a field when it is the same FACT, not when it is the same SHAPE (2026-08-25)** — the
  group name above the business unit on every email read `BrandSettings.companyName` because "the
  app-wide brand IS the group level" sounded right and avoided inventing a second column. It named
  the PLATFORM. So the header said "Forefront Consulting" where "Forefront Group" had been agreed,
  and the only way to correct it was to rename the whole application, sign-in page included. The
  don't-invent-a-second-field instinct is right (it is why there is one `fromName` for everything
  the platform sends) and it is exactly wrong here: two ideas that merely look alike need two
  columns. Ask whether a later change to one would be a change to the other; if not, they are not
  the same field.
- **A screen must never claim work is saved that is not (2026-08-25)** — the announcement editor set
  a green "Saved" chip on a successful write and cleared it only on the NEXT action, so it stayed on
  screen while the operator carried on typing. The preview, which correctly renders what is stored,
  then looked like it was dropping text — and the bug was reported, reasonably, as a broken preview.
  Track **dirty**, not **saved**: the question a person is asking is "does the record match what I
  am looking at". And where two controls can disagree about that (Save here, Refresh preview there),
  make them one control that cannot.
- **A fix that removes a scrollbar must say where the content went (2026-08-25)** — making the email
  preview grow to its own height meant `scrolling="no"`, which also removed the HORIZONTAL scrollbar
  and silently clipped the right-hand edge, because the email is a fixed 600px table inside a
  narrower panel. Losing the end of every line is worse than the scrolling it replaced. Scale a
  fixed-width design to fit rather than squeezing or cropping it; **measure** the content rather
  than assuming its width (the document is wider than the 600px table it contains); and keep the
  border off the frame — on the iframe it ate 2px of the inner width and clipped the edge again,
  small enough that only a browser measurement caught it. Both faults were found by driving a real
  browser and reading the rendered document; neither is visible in the code or in a type check.
- **Benefits money & rules are server-authoritative** — every pool ceiling, 50%-per-benefit cap, and medical rule is enforced on the server at claim/commit time, never trusted from the client. (The benefit-count limit is retained but off by default — spec 018.)

### 4. Git Workflow
- **Development branch:** the session-coded branch you start on (e.g. `claude/hr-system-planning-2oc2mu`). All work is committed here.
- **`main`** — production/stable. Merge to main only when work is complete and verified.
- **Commit with descriptive messages** — explain what and why.
- **Push:** `git push -u origin <branch-name>`; retry on network errors with exponential backoff.

### 5. Communication
- **Be proactive about issues** — flag concerns early.
- **Explain reasoning** — give the rationale behind suggestions.
- **Ask clarifying questions** — better to ask than assume.

### 5b. CRITICAL: Talk like a person, not a system (added 2026-08-24)
- **Write to the user in plain English.** No file paths, function names, table or column names,
  status enums, migration numbers, or framework terms in the reply — those belong in the code and
  the commit message, not in a sentence someone reads on their phone.
- **Say what it does, not how it is wired.** "Finance gets an email the moment someone sends a
  receipt" — not "the submit action dispatches `paybackSubmittedToFinance` via the Resend client".
- **Name a file only when the user has to open it themselves**, and then say what it is for.
- **Describe a decision by its consequence.** "Nobody can close the month with a receipt missing
  unless they sign for it" beats "closing refuses unless `acknowledgeMissing` is set".
- **The same goes for questions.** Ask about the business, not the schema: "who holds the cash
  today?" — not "which user should be the `custodianId`?"
- This is about the **reply**, not the work. Code comments, commit messages, specs and the four
  steering files stay as precise and technical as they need to be.

---

## Project Context

### What This App Is
**HR_ERP** is an internal HR platform for **Forefront Consulting**. Employees sign in with Google (restricted to the company domain); a small **HR/Admin** group manages content and configuration. The product is in English.

**v1 modules:** Foundation (auth + roles + employee registry + **My Documents** personal uploads) · Onboarding · Benefits · Team Directory · **Handbook & Resources** (shared policies/handbook + downloadable company files) · Time-Off / Leave Management · Dashboard · Learning Track · **Team Communications** (announcements + birthday/anniversary congratulations, spec 039) · **Finance** (petty cash floats + payback requests, spec 040; bank confirmations per business unit + monthly salary runs, spec 041) · **Reviews & 1:1s** (quarterly review sheets, ad-hoc 1:1s, a private journal and Gallup strengths, spec 042).
**Phase-2 (designed-for, built later):** full Learning Track, Case Studies, benefits claims/reimbursement.

The **Benefits** module is the heart of v1 — it is the only module involving money and admin-configured rules (pool ceilings by employment type × tenure, a 50% single-benefit cap, and rate-card-driven medical insurance that is exempt from the 50% cap). As of **spec 018** it is a **claim-based living allowance**: no basket to submit — employees claim flexible benefits as they spend across the open plan year, medical is a one-time commitment, and the benefit-count limit is retired (dormant flag). All rule enforcement lives server-side.

### Technology Stack (decided)
- **Framework:** Next.js 15 (App Router) + React 19
- **Language:** TypeScript
- **Database:** PostgreSQL (Neon, serverless) + Prisma
- **Auth:** NextAuth.js v5, Google provider, restricted to the company domain. HR/Admin role gating on server routes.
- **Styling:** Tailwind CSS. Product design language is **navy/gold** (from the Forefront reference tool). The benefits selector's layout/interaction is ported faithfully in that palette.
- **File storage:** Vercel Blob (HR documents, personal docs).
- **Deployment:** Vercel.
- **Email:** none in v1 (no invitations/reminders).

### Reference Materials (context, not to be copied verbatim)
- **Forefront Consultant Wizard V2** — a React 19 + Vite + Firebase reference tool that already implements onboarding, a learning track, team directory, HR documents, case studies, and a dashboard. Its *concepts* inform HR_ERP; its Firebase/Vite implementation is **not** reused — we reimplement in the Next.js/Prisma/Postgres house stack.
- **benefitsselector_3.html** — a self-contained flexible-benefits simulator. Its **design and interaction model are the source of truth** for the Benefits employee experience and are ported faithfully to React. Its rate card and figures are placeholders pending the real data.

### Repository
- **GitHub:** `islamsaadany/HR_ERP`
- **Production URL:** Vercel-hosted (set in the Vercel dashboard).

### Target Directory Layout
```
HR_ERP/
  CLAUDE.md
  PROJECT_DETAILS.md
  IMPLEMENTATION_PLAN.md
  IMPLEMENTATION_PROGRESS.md
  .specify/                        # spec-kit: templates, workflow, memory/constitution.md
  specs/                           # spec-kit feature specifications (one folder per feature)
  src/
    app/
      layout.tsx  globals.css  page.tsx
      (dashboard)/                 # employee shell + home
      onboarding/
      benefits/
      directory/
      documents/
      admin/                       # HR/admin surfaces
      api/                         # route handlers (server-authoritative)
    lib/
      prisma.ts   auth.ts   roles.ts
      benefits/                    # pool/cap/rate-card rule engine (server)
    data/
      constants.ts  types.ts
  prisma/
    schema.prisma  seed.ts
    sql/                           # hand-runnable SQL for Neon (see Configuration)
  ui-versions/                     # UI snapshots before edits (rollback log)
```

**Authoring status:** Feature-complete through Phase 8 (Foundation → Benefits → Dashboard). `src/`, `prisma/`, and `package.json` all exist and build; the layout above reflects the live structure. Remaining: Phase 9 (Learning Track placeholder + handoff) and the spec 018 Neon migration + UI review. See `IMPLEMENTATION_PROGRESS.md` for the live status.

### Important Patterns (project-specific)
- **Email + password sign-in (Google parked)** — sign-in is NextAuth Credentials (email + scrypt-hashed password); the company-domain restriction on password login was **lifted** (2026-08-07) — any registered employee may sign in, and HR is warned when creating a non-company-domain email. Google is disabled for now (button removed; provider still env-gated so it can return). Admin-issued passwords are temporary: the employee is forced to `/set-password` on next sign-in (`mustChangePassword`) and must choose one meeting the policy (≥ 8 chars, uppercase + number + special). No emails in v1 → a forgotten password is reset by HR (no self-service recovery).
- **Roles** — `EMPLOYEE`, `HR_ADMIN`, and `SUPER_USER` (superset of HR Admin; adds governance: role grants + app-wide settings). A `manager` capability derives from the org chart (an employee with direct reports) — e.g. approving their team's time-off. Admin surfaces and API routes check role server-side. Bootstrap admins via `ADMIN_EMAILS`; later, promotion in-app.
- **Employee registry is the backbone** — `User` (Google identity + employmentType + tenureBand + reportsTo + role) is read by Directory, Onboarding, Benefits, and Dashboard. It is built and validated first (Phase 2) before the money module is built on top.
- **Benefits rules are server-side (spec 018)** — pool ceiling (type × tenure), the 50%-per-benefit cap (on cumulative claims, full- **and** part-time), and medical handling are validated at claim/commit time in `src/lib/benefits/` (`evaluateClaim`). The client mirrors them for UX only. The benefit-count limit is retained behind `COUNT_LIMIT_ENABLED` (default off).
- **Plan-year window** — an admin opens/closes a benefits cycle; employees can only claim / commit medical while it is open. **Medical is committed once** (a `MedicalCommitment` row) and then locked — only HR can change/remove it. **Flexible benefits are claimed as-you-go** (`BenefitClaim` linked directly to the catalog item); there is no basket to submit and no per-benefit allocation. (Superseded the old basket/`BenefitSelection` model.)
- **Medical is age-banded per-person (spec 023)** — the medical rate card is a **`MedicalRateBand`** table priced by each covered person's **age** (Tier 1 today; `annualPremium` two-decimal). An employee's premium = the sum of each covered person's age-band figure (employee + covered dependants), **cents dropped (truncated, not rounded)**, prorated ÷12 for mid-cycle joiners, capped at the pool ceiling; age is fixed **at the commit date** and snapshotted in `MedicalCoveredPerson`. Pricing is pure in `src/lib/benefits/rates.ts`, enforced server-side at commit. The **spouse is a `Dependant` (kind SPOUSE)** entered in the employee form like kids (one max); the medical modal only selects who to cover; **DOB is required** (commit blocked without it). Employees see whole EGP; the admin **Amounts** tab keeps the operator's exact figures.
- **Placeholder benefits data** — real pool ceilings and tenure bands arrive later; until then an admin config screen + seeded placeholders drive the module. Placeholder figures must never be presented as final. (The medical rate card is now the confirmed operator Tier-1 figures — spec 023.)
- **Identity data standards (spec 029/033, 2026-08-17)** — dates DISPLAY as **dd/mm/yyyy** everywhere (screens and CSVs; `formatDate` is the one formatter; ISO only in storage and `<input type="date">` plumbing). Phones are ONE sequence `+<dial><digits>` validated per country (`src/lib/phone.ts`); national ID is exactly 14 digits — strict server-side everywhere including the importer, with ONE exemption (2026-08-20): on the **admin employee edit form**, a value re-submitted **identical to what is already stored** passes, because migration 053 deliberately left un-parseable legacy phones in place and `PhoneInput` re-sends a stored value verbatim — so enforcing it there made the whole record unsavable over a field nobody had touched. Anything the operator actually changes is still strict (`employeeFormSchema(stored)` in `lib/validation.ts`). Employee-answerable fields live in ONE registry (`campaign-fields.ts` composing `requestable.ts`); **data request campaigns** (Admin → Data Requests, HR/Finance) collect them via a per-field-saving popup + live sidebar badge, writing directly to `User`. Colour semantics: navy = action, green = done-state only.
- **Time-Off counts WORKING days, never limits (spec 035, 2026-08-18)** — weekend is **Friday + Saturday**, the HR-managed public-holidays list also never counts (`src/lib/workdays.ts` is the ONE counting engine, shared server + client preview); there is **no entitlement/limit — only a per-calendar-year taken count** visible to employee/manager/HR; no leave types. Approvals resolve against the **current** org chart (`pendingApprovalWhere`/`canDecideLeave`), never the stored approver snapshot.
- **A guaranteed benefit is paid at most once per cycle (2026-08-18)** — claims and bulk releases are mutually aware in every payment path (employee claim, HR Record entry, Release sheet); employee cards show the true state (gold in-review / green received) instead of a dead button. **Eligibility exceptions are per-person GRANTS (spec 036)**: a Super User grants one person one benefit for the open cycle at a typed amount (Exceptional releases tab); the person then uses the completely normal request→approve→pay flow — never widen a benefit's general eligibility for one person, and never pay around the flow via sheet overrides (one was shipped and reverted same-day).
- **Official holidays are a lifecycle, not a date list (spec 037, 2026-08-19)** — a holiday is ONE entry covering a **date range** (Eid included) with an **announced** range and an **actual/observed** range; all working-day counting reads the actual one, so moving a holiday re-counts every request live. Status is `TENTATIVE | VERIFIED | MOVED`; HR fetches a year from Nager.Date as **suggestions only** (nothing stored without confirmation) and actual ranges may never overlap (enforced in the server actions — Prisma can't express it). A **daily Vercel Cron** (`/api/cron/holidays`, `CRON_SECRET`) nudges HR to verify a tentative date within a configurable lead (default 14 days) — it can **never** email employees. Team announcements are **drafted deterministically** (English then Arabic, warm, with bridge/long-weekend callouts) and **only ever sent by a human**; each send snapshots the dates it went out with, which is what flags "announced with an outdated date" and makes the next draft a correction. A **bridge is exactly ONE working day** between off-days. Moving a holiday onto someone's booked leave emails them the day was returned.
- **A colour an operator CHOOSES must carry its own legibility rule** — the Communications email
  paints its header and button in the recipient's business-unit colour, which somebody picked for
  brand reasons with no thought for text. The obvious rule (one luminance threshold picking black
  or white) FAILS: measured, it puts white on a coral at 3.44:1 and on a mid teal at 4.08:1, both
  under AA. `surfaceFor` (`src/lib/comms/brand.ts`) tries BOTH inks and returns the brand
  **untouched** whenever either clears 4.5:1 — five of six real brands, including Visual Shift
  `#450059` at 15.03:1 — and moves the colour only when neither does, toward whichever end it is
  already closer to (an earlier always-deepen variant turned a pale gold into olive). Never make
  the operator responsible for contrast; derive it, leave the brand alone where you can, and
  **put an accent in a FILL rather than in type** — a fill has no ratio to meet. The same measure
  found the existing emails' eyebrow at 4.33:1 and fixed it.
- **A broadcast is not a transactional email and must not inherit its stance** — the claim and
  holiday emails are fire-and-forget so a mail failure never blocks a state change. A broadcast is
  the opposite: somebody pressed send and has to know whether it went, so `sendBatch` REPORTS per
  recipient. Never a shared `to` and never BCC (nobody sees another address, each copy can carry
  its own branding, and a failure names *who*). And the confirmation carries the **count**, which
  the server re-checks — a confirmation that can silently cover more people than it named is not a
  confirmation.
- **Email is limited to FOUR workflows (specs 020 + 037 + 039 + 040)** — the original "no emails, ever (v1)" rule was reversed for the benefit-claim workflow (approved 2026-08-10), widened to the holiday/vacation workflow (approved 2026-08-19), and widened twice more on 2026-08-24: to **Team Communications** (announcements to a chosen audience, plus personal congratulations for birthdays and joining anniversaries) and to the **payback workflow** (requested by the CEO: submitted→Finance, declined/paid→the requester). All send via **Resend**, **env-gated** (`RESEND_API_KEY`/`EMAIL_FROM`), configurable + master-toggleable at **Admin → Notifications**. The three transactional workflows are **fire-and-forget** (never block a state change); the broadcast one reports per recipient (see the rule above). **No scheduled process may email an EMPLOYEE** — that half is untouched: cron prepares drafts and nudges operators, a human sends. Still **no** invitations, marketing, external recipients, or scheduling a send for later. **Petty cash itself sends nothing** — the custodian and Finance are both looking at a live screen, and a notification for a ledger nobody is waiting on is email surface bought for no one's benefit.
- **A reconciliation figure is derived ONCE, kept SIGNED, and stated in WORDS (spec 040, 2026-08-24)** — the MARCOM workbook computes its bottom-line *"Amount to reimburse"* as **spent − float** on the `March` tab (3,444.54) and **float − spent** on `JUL-AUG` (−4,617.16), for the identical situation: the custodian has fronted more than the float she was given. Two tabs of one spreadsheet, opposite signs, and nobody can tell they mean the same thing. So: one derivation (`src/lib/finance/pettycash.ts`, **pure** — no Prisma, no I/O, so it is testable and cannot fork), the closing balance and budget remaining stay **signed** (an overspend is an overspend, never floored to zero), and `describeBalance` builds the sentence every screen prints, so the direction cannot invert between screens. Two corollaries the same workbook taught: an overspend needs somewhere honest to go (it became a first-class **opening balance**, not a hand-typed line called *"December Overbudget"*), and a figure that belongs to a different pocket must be kept out of the one it doesn't move (a **company transfer** counts as expenditure and consumes budget but never touches the float).
- **Money to the cent is `Decimal(10,2)` in Postgres and integer PIASTRES in TypeScript (spec 040)** — the ledger stays readable to anyone querying Neon directly, while every calculation is exact. `0.1 + 0.2 !== 0.3` in every JS runtime, and a closing balance out by one piastre destroys trust in the whole screen. `src/lib/finance/money.ts` is the ONLY boundary between the two; nothing else adds or compares petty cash amounts. `parseAmountInput` **refuses** rather than rounding — a silently-adjusted amount no longer matches its receipt. (Benefits money is a different thing: whole-EGP `Int`, `formatEGP`.)
- **A lock protects an invariant you can NAME, or it is cargo cult (spec 040)** — petty cash has no ceiling to breach: a float is *allowed* to go negative, which is what "amount to reimburse" means. Copying the benefits pool lock without asking what it guards would have been ritual. What can actually break is **state**: a line inserted while Finance is closing lands in a closed period and moves a balance somebody has already signed off, and two "open a period" calls race into two open periods, after which no line has an unambiguous home. So `SELECT … FOR UPDATE` on the **account** row, on exactly those two writes, plus a partial unique index (`WHERE status = 'OPEN'`) as the backstop — checked in the action first, so the operator gets a sentence rather than a constraint error.
- **An acknowledgement must say WHAT was accepted (spec 040)** — closing a period with missing receipts stores the acknowledging user, the note, **and the ids of the specific lines waved through**. A stored boolean saying "someone ticked a box" answers none of the questions that get asked six months later. Same instinct as the deletion snapshot: a ledger row may not simply vanish.
- **A TypeScript refusal helper only narrows as a function DECLARATION** — `const fail = (m: string): never => redirect(…)` does not participate in control-flow analysis, so every check after it needs a non-null assertion; `function fail(back: string, msg: string): never` does. Cost an afternoon of `possibly null` errors across two action files before the pattern was right.
- **A privacy promise must survive "view as" (spec 042, 2026-08-24)** — `requireUser()` deliberately
  returns the **impersonation target**, which is right for every module except one: a Super User
  viewing as an employee would have read that person's private review journal. Reviews & 1:1s
  resolve the **real** session user (`requireRealUser`, `src/lib/reviews/access.ts`) and the module
  **refuses to run at all** while impersonating. Rule: before promising that something is private,
  check what "the current user" means on that path — and prefer refusing to silently
  un-impersonating, because the second one shows somebody their own data under another identity.
  Related: **whose records these are is stored, not derived** — a review and a 1:1 keep their
  `employeeId`/`managerId` and are authorised against those, the deliberate **opposite** of the
  Time-Off rule (approvals resolve against the *current* chart). A leave request must reach whoever
  can approve it today; a review belongs to the two people who had it, so a new manager never
  inherits the previous one's conversations. Both departures are recorded in spec 042's
  Complexity Tracking so a later session does not "fix" them back.
- **Sealing means the data is not sent, not that it is hidden (spec 042)** — a review sheet's two
  halves stay sealed until both parties submit **and both** confirm they met (one confirming alone
  would be a way to read the other's half by declaring a meeting that never happened). What makes
  it true is that `visibleItemsWhere` scopes the **query**: the counterpart's rows are never
  fetched, so no preview, word count, or per-question completion state exists in the payload to be
  uncovered. A quarter that ends with no meeting **opens nothing and carries nothing forward** —
  an unheld review must not leave a record that it happened.

---

## Configuration

### Database operations (Neon)
**Migrations are Claude's job, not the user's.** The user should never be asked to paste SQL into
Neon as the normal path. Whenever `prisma/schema.prisma` or `prisma/seed.ts` changes:

1. Write the matching `prisma/sql/0NN_*.sql` and commit it **in the same commit**. Keep it
   **idempotent** — it may be retried.
2. The Vercel build applies it: `scripts/apply-sql.mjs` runs every not-yet-applied file in order
   and records it in `_sql_migrations`, so each runs once and a redeploy is a no-op. It is
   deliberately non-fatal, so a failed file lets the deploy succeed — check the build log's
   `[apply-sql]` lines.
3. Verify it landed, and tell the user the result in one line. Hand over a paste-it-yourself file
   only if the deploy-time run actually failed.

**Never** run `prisma db push` against the user's DB from a session, and **never** ask the user to
paste their `DATABASE_URL` into chat.

### Required env vars (target)
| Variable | Purpose |
|----------|---------|
| `POSTGRES_URL` | Neon pooled connection string (runtime) |
| `DATABASE_URL_UNPOOLED` | Neon direct connection (migrations) |
| `NEXTAUTH_SECRET` | NextAuth session signing secret |
| `NEXTAUTH_URL` | Public app URL (local only; Vercel auto-detects) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `ALLOWED_EMAIL_DOMAIN` | Domain allowed to sign in (e.g. `forefront.consulting`) |
| `ADMIN_EMAILS` | Comma-separated bootstrap admin allowlist |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for document storage |
| `CRON_SECRET` | Authenticates the daily holidays cron route (`/api/cron/holidays`, spec 037) |

### Build Commands
```bash
npm run dev          # Dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npx tsc --noEmit     # Type check only (no DB needed)
```

---

## Common Tasks

### UI Version Tracking (MANDATORY)
Before editing any UI component file, copy it to
`ui-versions/<component-name>/<YYYY-MM-DD>_<short-description>.tsx`. The snapshot
is the rollback point; the live file is the new version. This exists because
prior sessions have accidentally reverted agreed-upon designs.

### `npm test` — a tool, not a routine
There is **no testing regime here and none is wanted**: nothing runs on a schedule, nothing gates a
deploy, and no session is obliged to run anything. What protects the money rules is structural —
ONE derivation of the pool ceiling (`src/lib/benefits/pool.ts`), the guards on each write path, and
the per-employee lock. Those hold without anybody remembering anything, which is the point.

`npm test` exists for the one moment it earns its keep: you are changing benefits code and want to
know whether the ceiling still holds. Reach for it then; ignore it otherwise. The database-backed
half skips unless `TEST_DATABASE_URL` points at a disposable database whose name contains `test`
(it TRUNCATEs, and `tests/setup.ts` refuses Neon outright):

```bash
createdb hrerp_test
TEST_DATABASE_URL="postgresql://…/hrerp_test" npx prisma db push
TEST_DATABASE_URL="postgresql://…/hrerp_test" npm test
```

#### `scripts/verify-*.mts` — and the two things that make them lie
The 21 verification scripts prove a feature against a real Postgres. Set one up **the way a real
deploy does**, or they fail for reasons that have nothing to do with the code:

```bash
POSTGRES_URL=$DB DATABASE_URL_UNPOOLED=$DB npx prisma db push --skip-generate --accept-data-loss
POSTGRES_URL=$DB DATABASE_URL_UNPOOLED=$DB node scripts/apply-sql.mjs   # ← the step that gets missed
POSTGRES_URL=$DB DATABASE_URL_UNPOOLED=$DB AUTH_SECRET=anything npx tsx scripts/verify-<x>.mts
```

`prisma db push` builds the tables and nothing else. The reference data several scripts read — the
department list above all — arrives in the numbered `prisma/sql/` files, so without `apply-sql` they
fail looking for rows that a real database has had since migration 022. Replaying the whole history
onto an already-current schema makes four historical files fail (`023`, `025`, `030`, `055`); that is
an artefact of replaying them out of order, not a deploy problem — on Neon they ran in sequence years
of commits ago and are recorded in `_sql_migrations`. And `AUTH_SECRET` must be set for anything
touching sign-in, because minting a ticket without a signing secret correctly refuses.

**They share one database, so a script must never assert a number about the whole of it.** Four
separate order-dependent failures came from this in one sweep: two scripts both used a "Consulting"
department, and two both used the ids `alice`/`bob`, so each cleaned up its own rows and inherited
the other's. Whichever ran second failed, and the failure looked exactly like a real one. The rules:
**namespace every shared string** a script writes (its own email domain, its own department names,
its own ids), and where a value can't be namespaced — an enum like `PART_TIME` — **count the
expected figure from the database through the same derivation** rather than writing down a number
that was true on the day. A script that asserts "reaches its 3" is asserting something about every
other script too.

### Before Committing
1. `npx tsc --noEmit` — no TypeScript errors.
2. Review all changed files.
3. No secrets committed (`.env.local`, tokens, keys).
4. If a UI file changed, confirm the `ui-versions/` snapshot was saved.
5. If schema/seed changed, confirm the matching `prisma/sql/` file was regenerated.

### Keeping Docs Current (MANDATORY before merging to main)
1. Update **`PROJECT_DETAILS.md`** for new features, endpoints, schema, or behavior.
2. Update **`IMPLEMENTATION_PROGRESS.md`** to reflect what's built.
3. Update the relevant **`specs/`** feature spec if product behavior changed.
4. Update **`IMPLEMENTATION_PLAN.md`** decisions log for any resolved decision.
5. Update this **`CLAUDE.md`** if a new pattern/rule/workflow was established.

---

*Last Updated: 2026-08-25 (Added, from putting the incentive module onto dd/mm/yyyy: a native date input cannot carry a house date format — it draws itself in the browser's UI language, mm/dd/yyyy under en-GB, ar-EG and en-US alike — so an entered date is typed text stating its format; a stored date-only string is printed by reordering the string, never by parsing it, or a viewer behind UTC sees the previous day; and `new Date("01/03/2021")` is American, so a day-first importer is the only safe one — this one had been storing 1 March as 3 January in silence. Also, from making the incentive review tables editable in place: every export from a `"use server"` file is an endpoint, so a raw write belongs in a plain module and the action keeps the access check; and a `useActionState` dispatch fired from a plain button needs `startTransition` by hand, or React never reports pending and the button neither says "saving" nor blocks a second click — invisible to `tsc` and to the build, caught only in a real browser. Previously, from splitting bank confirmations by business unit: a shared control must be scoped to the thing it actually guards — the scope is derived not typed, the screen makes mixing structurally impossible and the server re-checks anyway, and there is no appointment meaning "all of them"; plus, drop the old uniqueness BEFORE widening it, or ON CONFLICT DO NOTHING eats the migration in silence — two appointments across five units produced 2 rows instead of 10 and reported success, so check a migration by the count it should produce, never by whether it errored. Also today, from combining Announcements into Communications: reuse a field when it is the same FACT, not the same shape — the email header named the platform because one column was serving two ideas, and the only fix was to rename the application; a screen must never claim work is saved that is not, so track dirty rather than saved and make two controls that can disagree into one; and a fix that removes a scrollbar must say where the content went — removing the vertical one clipped the right edge, and the frame's own border then clipped it again by 2px, both caught only by driving a real browser. Earlier the same day, from importing the marketing petty cash workbook: a parse is only as good as the total it is checked against — two silent bugs, a doubled month and a lost column of receipts, both caught by comparing each tab against the sheet's own figure rather than by reading the output; read a spreadsheet's cells, not its labels; report a source's own errors rather than absorb them; and a generated migration is reviewed through its generator, so that is what gets committed. Plus: a receipt that lives somewhere else is still one door — evidence gained an external location and the serving route redirects after making the same 404-not-403 decision. Previously, from Reviews & 1:1s (spec 042, renumbered from 040 on merge — Finance had taken 040/068 first): a privacy promise must survive "view as", so the module resolves the REAL session user and refuses to run while impersonating; whose records these are is stored, not derived — the deliberate opposite of the Time-Off rule, because a review belongs to the two people who had it; and sealing means the data is not sent, not that it is hidden — the counterpart's rows are never fetched, so there is no preview or completion state in the payload to uncover. Previously: nobody is told money arrived until it has — the two "your money is here" emails now fire on the CEO's bank confirmation, not on Finance recording a transfer; say what the person does in their words, because two wrong verbs produced two wrong designs; an appointment's role-holders are implicit except where that would make a promise false; a figure a decision is made against is frozen, not derived; an enum member's position must be checked against the real database; an already-applied migration never runs again, so ship the delta as a new file that converges any stale database; one signed reconciliation figure; money as Decimal in Postgres and piastres in TypeScript; a lock that protects an invariant you can name; an acknowledgement that says what was accepted; and talk like a person, not a system. Merged the same day with Team Communications — a colour an operator chooses must carry its own legibility rule, and a broadcast must not inherit a transactional email's stance. Previously: how to actually run the `verify-*.mts` scripts — `apply-sql.mjs` after `db push`, or the reference data several of them read is simply absent; and the rule that a script sharing a database must never assert a number about the whole of it, because four order-dependent failures in one sweep all came from two scripts reaching for the same department name or the same fixture ids. Previously: 2026-08-23 (Added: a gate is not a scale — the sub-6-month pool ceiling now scales to the cycle like everyone else's, and a figure shown beside a decision counts only what that decision moves, through the derivation the write uses. Previously: 2026-08-22 (Added: a count shown beside a choice must be that choice's count, computed through the same derivation the real check uses; one way to say "everyone". Plus: per-module authority is an appointment, never a new Role member — one derivation, role-holders are never rows, the appointment cannot appoint. Plus: a visibility rule needs one source and must be re-decided at the serving route, 404 not 403. Previously: 2026-08-20 (Added: `npm test` is a tool, not a routine — no regime, no deploy gate, no standing obligation; protection is structural. Plus: the pool ceiling is enforced on every write path in every order — one derivation, signed remaining, refuse-don't-clamp, per-employee row lock; the freeze-vs-parked-header table rule; unchanged legacy identity values no longer block an unrelated employee-form save, and rejected saves are now scrolled to / announced / listed in full. Previously: official-holiday lifecycle + announcements (spec 037) and the first scheduled job; email widened to that workflow; HR may reopen a rejected claim with a reason. migrations now run through Claude via the deploy, not by hand; added the no-unneeded-complications rule.))))*
