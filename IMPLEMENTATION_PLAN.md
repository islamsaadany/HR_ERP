# HR_ERP — Implementation Plan (Source of Truth)

> Phases, scope, and the decisions log. Read after `PROJECT_DETAILS.md`.
> Live build status lives in `IMPLEMENTATION_PROGRESS.md`.

---

## Scope (v1)
Foundation (auth + roles + registry) · Onboarding · Benefits · Team Directory · HR Documents · Dashboard.
Deferred to Phase 2: Learning Track · Case Studies · Benefits claims/reimbursement.

## Build order & rationale
Team Directory is built before Benefits on purpose: it's the cheapest way to prove out Google identity, roles, the employee registry, and the app shell before the hard money module is layered on top.

| Phase | Deliverable | Notes |
|-------|-------------|-------|
| **0 — Docs & specs** | Four files + spec-kit adopted; per-module specs via `/speckit-specify` | *in progress* |
| **1 — Foundation** | Scaffold Next+Prisma+Tailwind; NextAuth Google (domain-locked); roles; `User`; **My Documents** (personal uploads); app shell; design tokens; seed | spec `001` |
| **2 — Team Directory** | Active-employee directory; name search + department filter; person view (V1, no org chart) | spec `003` |
| **3 — Onboarding** | Role-aware timeline journey (Policy/Action items); admin authoring; cross-module links | spec `002` |
| **4 — Handbook & Resources** | Structured handbook sections + downloadable Resources (company profile, templates, policies) | content from the Onboarding Kit |
| **5 — Time-Off / Leave** | Request → direct-manager approval; balance tracking | new module |
| **6 — Benefits (admin config)** | Plan-year window, pool ceilings, fixed benefits, basket catalog, medical handling | Selector is meaningless without these |
| **7 — Benefits (employee selector)** | Port the HTML selector to React; autosave + submit; **server-side rule enforcement** | The money module |
| **8 — Dashboard + polish** | Onboarding progress, benefits status, quick links, announcements; responsive pass | |
| **9 — Learning Track (placeholder) + Handoff** | Placeholder surface; docs current; deploy | Phase-2 for full Learning Track |

## Decisions log

- **2026-08-20 — The pool ceiling is an invariant, not an ordering accident (fix, no migration).**
  Reported issue: an employee (Yosra) ended a cycle **2,093 over** a 10,000 pool — 6,093 medical +
  6,000 flexible — while the report showed "Remaining 0 · Pool exhausted". Two wrong diagnoses were
  offered before the real one; the traced and **reproduced** cause is
  `reconcileMedicalCharges`. `medicalCycleCharge` counts only charges whose status is **APPLIED for
  this cycle**, so a commitment made in an EARLIER cycle — under a policy term reaching into this
  one, for a cycle that had no dates at commit time and therefore got no charge row — reports **zero
  consumption**. Her pool read as untouched and the 6,000 claim was allowed *correctly*. When HR later
  dated the cycle, reconcile created the missing row and, because the cycle was OPEN, wrote it
  **straight to APPLIED** — dropping a premium onto money already spent. So the medical genuinely came
  first; only its *charge for that cycle* arrived after the claim.
  Underneath it, one rule had **three** implementations (`report.ts`, `claim-actions.ts`,
  `flatAllocation`) that disagreed — and the loosest one is the one that pays.
  **Decisions taken with the user:** (a) the ceiling is enforced on **every** write path, in every
  order; (b) medical is **refused, never clamped**, because you cannot part-buy insurance and a
  trimmed premium would record cover nobody purchased; (c) **no HR override** — Record entry,
  back-fill, re-price and the scheduled-charge run all refuse alike, so exceeding a pool is
  impossible through any path (if someone needs more, the ceiling or the grant is what changes);
  (d) existing overruns are **surfaced and resolved in-app**, not silently corrected.
  Nine paths closed; a carried charge that no longer fits is held **SCHEDULED** rather than applied or
  cancelled, so the money is neither lost nor silently drawn. One derivation now lives in
  `src/lib/benefits/pool.ts`, and `remaining` is **signed** — the report used to floor it at zero,
  which is precisely what hid the overrun.
  **Locking:** a Serializable transaction stopped the race but, measured, also aborted writes between
  unrelated employees (**1 of 6** succeeded concurrently). Replaced with a per-employee row lock
  (`withPoolLock`): 6/6 unrelated employees pass, the same employee serialises to 1.
  What deliberately stays possible is the ceiling **shrinking** under existing spend (lowering a
  ceiling, changing employment type / start date, re-dating a cycle) — HR must be able to correct
  records, so those are surfaced on the report rather than blocked.
  Verified against throwaway Postgres: the exact reproduction, plus seven sequences (both orders,
  HR back-fill, reject→spend→reopen, walking to the ceiling, ten concurrent claims, reconcile onto a
  spent pool) all holding.
  **Resolve action decided 2026-08-20:** the mockup's four routes are approved, and **"raise this
  person's ceiling for the cycle" is SUPER USER ONLY** — it authorises spend past a money rule, so it
  sits with governance, not with HR Admin. The other three routes (reduce a flexible claim,
  remove/re-price the medical commitment, accept-and-note) stay open to HR Admin. Not yet built.

- **2026-08-20 — An all-or-nothing form must show its rejection (fix, no migration).** Reported issue:
  employee edits — "specially the part time and full time thing" — silently did nothing. The edit form
  validates the **whole** record on save, and the strict identity rules added 2026-08-17 reject values
  **already stored**: migration `053` deliberately left un-parseable legacy phones in place and
  `PhoneInput` re-submits a stored value verbatim, so the form re-sent it and was rejected every time,
  permanently unsavable. The reason rendered at the top of a four-section form while Save sat at the
  bottom, with no scroll, focus or `aria-live` — it read as a dead button. **Decision (user's choice of
  two):** a value **identical to what is already stored** passes; anything actually changed stays
  strict, as do create, the inline grid edits, the importer and the self-service fields. The banner is
  now `role="alert"`, scrolled to and focused, and reports **every** fault at once.

- **2026-08-20 — Benefits Reporting scrolls; the registry does not (UI, mockup-approved).** The
  single-scroll shell pinned the whole page, so the title, filters and five stat cards ate half the
  viewport permanently. **Decision:** the page scrolls, the **back link + eyebrow + title stay pinned**,
  and the table header parks beneath them (offset measured at runtime — it changes with the
  impersonation banner and a wrapped heading). Applied to Reporting only. The registry and catalogue
  **cannot** have this: freezing their first column needs a scrollable box, and a sticky header inside
  a box sticks to the box, not the page — comparison mockup published. **Decided 2026-08-20: leave the
  registry and the catalogue exactly as they are** (Option B); the scroll-away treatment stays limited
  to tables that genuinely fit. A follow-up caught in review: Reporting's 860px table
  does not fit beside the sidebar below ~1180px, so it is **boxed below `xl`** (keeping the frozen
  first column every other table has) and page-scrolled from `xl` up.

### Spec 037 — Official holidays & vacation notifications (aligned 2026-08-19)
- **Fetch source**: Nager.Date, **suggestion-only** — nothing stored without HR confirming, so a
  wrong prediction can never reach working-day counting. (The source does **not** list Eid al-Fitr
  for Egypt, so manual entry still matters.)
- **Two ranges per holiday**: announced vs actual/observed. Counting reads the **actual** one.
- **Multi-day holidays are ONE entry** covering a date range (user's explicit choice over one row
  per day) — verified and moved as a whole.
- **Bridge = exactly one working day** between off-days ("1 day is the classic"). Two-day gaps are
  never called bridges.
- **Announcements are review-and-send**, never automatic; the cron may nudge HR but may never
  email employees. Email scope widened from spec 020's single workflow to include this one
  (constitution 1.2.0).
- **Eight edge cases decided by the user**: live recount on a move; auto-zero + good-news email
  when a move lands on booked leave; HR-sent corrections after an announced date changes;
  past-dated edits allowed with a warning; weekend-dated holidays allowed and described honestly;
  overlapping actual ranges blocked; re-fetch shows prediction diffs with apply-as-move.
- **Parked (out of scope)**: company-declared breaks. Recorded intent for when it returns — HR
  declares the break, employees do **not** file requests for those days, and the days at most
  appear in an informational counter, never through the request/approval flow.
- **Claims**: a rejected claim may be reopened by HR Admin or Super User with a **required
  reason**, returning it to the review queue — never straight to Approved (money keeps flowing
  through request → approve → pay).

### Settled
- **2026-08-21 — Learning Track (LMS) adopted from FFLMS (spec 038).** `ahmedgalal-lang/FFLMS`
  confirmed ours to reuse; its domain design and pure logic are adapted, its identity model,
  instructor role, public catalog and UI are not. `frappe/lms` reviewed and rejected as a code
  source — wrong stack entirely and **AGPL-3.0**, which would bind this platform.
  Decisions: HR/Admin authors only (no instructor role) · both registry-derived audiences and
  ad-hoc groups · core learning loop for v1 · adding required content to a finished course **asks
  per edit** and supersedes rather than erases (Q1-C) · an employee mid-course **keeps access**
  until they finish (Q2-B) · **video is linked, not hosted**.
- **2026 — Stack:** Next.js 15 + Prisma + Postgres + Tailwind, NextAuth Google, Vercel Blob, Vercel deploy. Firebase reference reimplemented, not reused.
- **2026 — Repo:** `islamsaadany/HR_ERP` (new repo; now in session scope).
- **2026 — v1 modules:** Onboarding, Benefits, Team Directory, HR Documents, Dashboard.
- **2026 — Auth:** Google SSO restricted to the company domain + an HR/Admin role.
- **2026 — Benefits depth:** persisted selector — save & submit a basket (not just a simulator).
- **2026 — Benefits data:** real rate card / ceilings / tenure bands come later; build an admin config screen + placeholder seed meanwhile (Decision E).
- **2026 — Learning Track:** Phase 2 (Decision F).
- **2026-07-27 — Repo access resolved:** planning set recreated directly in HR_ERP.
- **2026-07-27 — Spec-kit adopted:** `specs/` is the single spec home (`product-specs/` retired); constitution authored from house rules; per-feature flow specify→clarify→plan→tasks→implement.
- **2026-07-27 — Roles:** Employee / HR Admin / Super User (superset). Manager is a capability derived from the org chart, not a role.
- **2026-07-27 — Modules added:** Handbook/Knowledge Base (its own module, built from the 118-page Onboarding Kit) and Time-Off/Leave Management (request → direct-manager approval). Learning Track is a v1 placeholder.
- **2026-07-27 — B/C (type & tenure):** admin-set on the profile, authoritative; tenure is an HR-set enum of four bands (6mo–2y / 2–4y / 4–7y / 7–10y) now, derive-from-start-date later.
- **2026-07-27 — Benefits ceilings confirmed (EGP):** FT 20/30/45/65k · PT 14/21/30/42k across the four bands. Basket has 4 categories (Gym · Mobile · Personal Medical · Schooling); FT 50% single-benefit cap; PT = max 2 picks. Per-benefit limits + medical handling still pending.
- **2026-07-27 — D (admin grant):** `ADMIN_EMAILS` allowlist bootstrap, then in-app promotion by a Super User.
- **2026-07-27 — Employee self-edit:** employees may edit only their own contact field(s) (phone); all else HR-managed.
- **2026-07-27 — Onboarding:** timeline stages (Day 1 / Week 1 / First month / 30-60-90); Policy vs Action item types; common core + role tracks (Consulting first); self-attested completion.
- **2026-07-27 — Login vs directory:** login stays domain-locked to `@forefront.consulting`; people with placeholder external emails appear in the directory but can't sign in until they get a company address.
- **2026-07-27 — Documents reshaped:** no standalone "HR Documents" module. Personal document upload becomes **My Documents** inside the employee Profile (Foundation, spec `001`). Company-wide content (policies, handbook, company profile, templates) lives in a **Handbook & Resources** module (structured handbook + a downloadable Resources area). Onboarding links updated accordingly.

- **2026-07-27 — Benefits figures fully confirmed:** guaranteed amounts by band (FT & PT) = the real figures; medical rate card = single tier (self/spouse 8k, child <18 4.5k, child ≥18 8k), exempt from 50% cap, dependants entered manually for now; no per-category caps/eligibility. All 7 v1 module specs written (`specs/001`–`007`).
- **2026-07-28 — Basket catalog expanded to the reference set (supersedes the earlier "4 categories"):** per the product owner, the flexible-basket catalog now follows `benefitsselector_3.html` faithfully — 5 display categories (Health & protection · Wellbeing · Life & family · Personal growth · Lifestyle & flexibility) with their items (Personal medical insurance, Annual health check-up, Gym, Coaching/therapy, Sports, Schooling, Childcare, Caregiver, Personal learning, Mobile, Home-office). Personal medical insurance = employee only; spouse/children stay separate priced options in the medical modal. Money rules unchanged (pool ceiling, FT 50% cap, FT max-4 / PT max-2, medical exempt — all server-side). Added a `category` field to `BenefitCatalogItem` (`prisma/sql/004_benefits_categories.sql`).

- **2026-07-28 — Handbook split → Knowledge Base (spec 008):** the consulting-craft sections
  (Strategy Consulting, AI-Strategy Consulting, Assignment Phases) move out of the Handbook into a new
  **Knowledge Base** of admin-authored Markdown "reads" (own `KnowledgeArticle` model, free-text
  categories). Authoring is a **shared Claude prompt → paste → parse** flow; bodies render tables,
  callouts, and mermaid diagrams. Handbook keeps the 7 operating sections; enriching those with the
  deck's full content is a later slice.

- **2026-07-29 — Migrations automated + onboarding/handbook restructure:** added a deploy-time SQL
  runner so schema/seed changes apply on deploy (no manual Neon). Onboarding moved to a **free-text
  stage** model (8-week structure, no enum), with policy items linking to Handbook guidance and a
  **policy→tool button** pattern on Handbook sections. New Handbook policy sections added.

- **2026-08-05 — Company coverage rates adopted (spec `012-benefits-coverage`, drafted):** the flexible basket gains a
  per-benefit **company coverage rate** (100% Personal medical / Annual check-up / Coaching · 80% Gym / Sports /
  Schooling / Childcare / Caregiver / Personal learning · 50% Mobile / Home-office). Only the **covered (company)
  share draws from the pool**; the employee pays the remainder. Pool total and the 50% cap run on the **covered
  amount**; claims reimburse the covered portion against proof of full spend. HR edits the rate per catalog item.
  Decided alongside: **full-time selections → 5** (from 4); **part-time stays distinct** (max 2, no 50% cap —
  a deliberate deviation from the concept doc); **medical stays a single item** (no Personal/Family split — also a
  deliberate deviation). Spec `012` layers onto `007`. The approved **concept doc** is imported at
  `specs/012-benefits-coverage/concept.md`, reconciled to those two deviations (11-benefit menu; PT rules called out).
  Three UX questions (cost-vs-pool-draw entry, step granularity, share display) are **deferred to `/speckit-clarify`**.
- **2026-08-07 — Company coverage rates BUILT (spec `012`, migration `023`):** implemented the co-funding model —
  per-benefit `coverageRate`; employee enters full cost; covered share (cost × rate) draws the pool; all money
  rules (pool total, over-pool, FT 50% cap) run on the covered amount; **FT 5 / PT 3** selection limits (PT raised
  to 3 by product decision, 2026-08-07); medical stays single/100%-covered/cap-exempt; claims reimburse the covered
  portion. Math centralized in `src/lib/benefits/coverage.ts`. Supersedes spec `007`'s max-4/max-2 and full-amount
  pool-draw FRs (annotated in 007). **Deferred to spec `016`:** the admin-Benefits tab redesign (Submissions &
  Claims · Catalogue · Amounts), the single Catalogue table with coverage % as a column, view-first config editing,
  HR/Super-User manual/back-dated claim & release entry (with approval date), and per-benefit FT/PT eligibility
  (future). Coverage-% editing lives in the existing Configuration catalog editor until then.
- **2026-08-07 — Orientation tour BUILT (spec `017`, migration `024`):** personalized, first-run, skippable,
  re-openable stepped-cards walkthrough on the Benefits page (welcome+name → pool/band → guaranteed → flexible
  basket → rules). Auto-opens until submitted + seen; `User.benefitsOrientationSeenAt` flag + `markOrientationSeen`.
  Final copy decisions: the 50% cap exemption is framed as **medical-only** (part-time rule unchanged — PT stays
  uncapped in the engine, just not called out); claims described as **request or proof of full spend → covered
  portion**. Read-only explainer; no money-rule change.
- **2026-08-09 — Professional development → 100% coverage (migration `026`):** the guaranteed *Professional
  development* benefit is covered at **100% of cost, up to the tenure-band allowance** (was framed as 50%). Rationale:
  it's a work-related guaranteed benefit and shouldn't sit below the flexible *Personal learning* basket item (80%).
  Per-band amounts unchanged; guaranteed coverage is descriptive (the claim engine already caps a PROOF claim at the
  band allowance), so this is a note/text change only.
- **2026-08-09 — Mid-year starter proration specced (spec `019`, not yet built).** New plan-year **start/end dates**
  (admin-set) drive proration of the **flexible pool** and **guaranteed Professional development** for employees who
  first become eligible mid-year: `annual × remaining whole months ÷ 12`; full annual amounts from the next plan year.
  Event/season gifts (marriage, summer, special events, loans) are **not** prorated. **Medical is folded in** (product
  decision 2026-08-09): unlocks at **3 months** (not 6), prorated by the same rule, sub-6-month medical uses the entry
  6mo–2y tier; built now against the **placeholder** rate card with the operator's confirmed prorated premium figures
  a later non-blocking data swap. Realizes the approved "medical available at 3 months" mockup. Money-sensitive defaults
  (whole-month floor, ÷12, nearest-EGP rounding) recorded in the spec's Assumptions.
- **2026-08-16 — Recoverable premium belongs to Finance, not HR (built, spec `030`, migration `048`).**
  Spec 027 showed HR a recoverable figure when someone left mid-policy. The product owner challenged
  it — *"who are we helping with that data? we already lost the amount"* — and the challenge was
  right: HR processed the departure and does not reconcile insurer credit notes, so the number was
  decoration. **Decision:** the same figure goes to **Finance**, where it carries an action and a
  closing state — chase the insurer, record what came back, or write it off with a reason. The
  residual is accepted as a cost of leaving; the value is that it becomes a recorded number rather
  than an invisible one, and that a systematically short-paying insurer shows up in the shortfall
  column. **The arithmetic that had to be right:** the recoverable amount is computed from the leave
  date, NOT from the cancelled cycle charge — the latter excludes any month inside an
  already-applied charge and would under-claim on every leaver (13,000 vs 10,834 on the live case).
- **2026-08-16 — Summer allowance becomes a pool-funded Travel allowance (built, spec `028`, migration `046`).**
  The product owner first reported that the summer allowance appeared to draw from the pool when it
  shouldn't (a display bug, fixed separately), then decided it *should* — rebadged as a year-round
  **Travel allowance** inside the flexible basket. **Decision:** it keeps its band amounts and is paid
  in full with no receipt, but now consumes the pool and prorates with the cycle. **Full- and
  part-timers get the same figures** (reversing an earlier "PT is half of FT"): the pool ceiling
  already differs by employment type, so a second set of amounts would add no expressiveness and one
  more way to drift. The cost was named up front and accepted — a part-timer gives up a larger share
  of a smaller pool for the same cash. Two findings shaped the migration: the **Jul–Sep window never
  existed in code** (only in handbook text), so "year-round" was a copy change; and the Summer row
  had to be **retired rather than deleted**, because claims cascade from it and deleting it would
  erase every historical summer claim. Introduces a general **fixed allowance** shape on the
  catalogue (four per-band amount columns) that any future entitlement can reuse.
- **2026-08-16 — Claims pay down to what's left instead of being refused (built, migration `045`).**
  Reported by the product owner: an employee with a 30,000 pool (15,000 per-benefit cap) who had
  claimed 8,000 on an 80%-covered gym benefit could not claim a second 10,000 receipt at all — the
  8,000 coverage share exceeded the 7,000 remaining, so `evaluateClaim` refused the whole thing and
  reimbursed nothing. The employee's only workaround was to **understate the receipt** to make it
  fit, which defeats the proof of payment the claim is built around. **Decision:** the covered
  amount is clamped to the remainder rather than refused — the **50% cap overrides the coverage
  rate**, so that claim pays 7,000 at an effective 70%. The employee still enters the full receipt
  value, and the preview names the clamped figure before submitting (mockup-approved) so the payout
  is never a surprise. Only a *fully used* benefit or pool refuses. Consequence handled in the same
  change: covered is no longer derivable from the receipt, so **`BenefitClaim.fullCost`** now stores
  the receipt and the admin Claims list shows the working — without it a clamped claim reads as an
  unexplained number beside a larger proof. Also bundled: the pool figure stopped counting
  guaranteed benefits (display-only bug), and medical renders locked before 3 months instead of
  offering a commit the server refuses.
- **2026-08-16 — Selected-employee password reset; who may run it (built, no migration).** HR could reset
  **one** employee (their edit page), **everyone without a password**, or **everyone** (Super User) — but not
  a chosen set, which is the common case (a team back from leave, a handful of forgotten passwords). Added a
  `selected` mode to `generateTeamPasswords` plus a picker modal in the registry's Passwords menu.
  **Decision — any admin may run it, not Super User only:** resetting N ticked people is exactly N single
  resets, and the single reset is already open to every HR Admin; gating the batch would be theatre. The
  destructive **Reset ALL** stays Super-User-only. Two invariants hold in **all** modes and are enforced
  server-side, never in the picker: the **acting admin is excluded** (no self-lockout) and the population is
  intersected with **`status: ACTIVE`**, so a tampered `ids` post can't widen the blast radius. Considered and
  rejected: row checkboxes in the main employee grid (bigger blast radius on a 772-line component everyone
  uses daily) and a spec-kit spec (this is an increment on shipped behaviour, not a new module). Mockup
  approved before building; proven against a throwaway local Postgres (16 checks — actor spared, LEFT
  employees spared, unticked rows untouched, issued plaintext verifies against the stored hash).
- **2026-08-13 — Guaranteed-benefit availability vs. salary fallback (fix, no migration).** Reported issue: a
  **part-time** employee (Mohamed Selim) saw a **Summer allowance of EGP 12,500** on his Benefits page, while the
  bulk-release sheet said "no part-time amount set". Root cause — a guaranteed benefit with a **null per-type band
  amount** fell back to the employee's **monthly salary** (`amountForBand(...) ?? user.monthlySalary`) in **both** the
  Benefits card and the **server-side claim check**. So a benefit the employee shouldn't get (part-timers get no
  summer/loans) displayed their **salary** (wrong figure + salary leak) and the server would **authorize a claim up to
  that salary** — a real over-claim risk against the server-authoritative money rule. **Product decision (aligned with
  the user):** the monthly-salary fallback is valid **only** for genuinely salary-driven benefits (**Loans** — all bands
  null, `isSalaryDriven`); a band-based benefit with no amount for the viewer's type/tenure is **not available** — the
  card is **hidden** (chosen over showing "not set"), the orientation summary omits it, and a claim is **blocked**
  server-side. Guarded in `benefits/page.tsx` + `benefits/claim-actions.ts`; `tsc`/`build` green. Bundled with a
  **mockup-approved** release-table display refresh (Type FT/PT column, cleaner status text, red "Not released", row-tint
  removed — display-only). Docs synced same-branch (PROJECT_DETAILS + specs 013/021 + progress tracker).
- **2026-08-11 — Spec `019` revised: pool/Prof-dev prorate by CYCLE LENGTH (built).** Reported issue: opening a
  half-year cycle left the flexible basket at the full annual amount. Root cause — spec 019 only prorated mid-year
  *starters* and always divided by 12, so an existing (already-eligible) employee got `fraction = 1` regardless of
  cycle length (by design, per the spec's "not silently rescaled" assumption). **Product decision:** the **flexible
  pool** and **Professional development** now scale to the cycle length (`cycle whole months ÷ 12`) for **every**
  eligible employee — a mid-cycle joiner gets the **same** cycle fraction (no extra reduction), and the 6-month
  threshold still gates eligibility (under 6 months → 0). **Medical is deliberately excluded** — it keeps mid-cycle-
  *joiner* proration (÷12 from its 3-month date); existing staff pay the full premium. New pure helpers
  `cycleWholeMonths`/`cycleFraction`/`poolCycleFraction` in `proration.ts`; enforced server-side in `createClaim`;
  employee + admin copy reworded (mockup approved 2026-08-11). Verified against the real functions via tsx (half-year
  cycle → 10,000 of 20,000; medical unchanged). **Follow-up (separate spec):** replace the placeholder medical rate
  card with the operator's **age-banded, per-person (by DOB) Tier-1** figures — priced as the sum of each covered
  person's age-band annual premium, DOB-based picker (employee + spouse + children), prorated ÷12 for mid-cycle joiners.
- **2026-08-11 — Spec `023` built: age-banded per-person medical rate card (Tier 1).** Replaced the relationship-based
  medical card with per-person age-band pricing (new `MedicalRateBand` table + Tier-1 seed; `MedicalCoveredPerson`
  commit snapshot; `Dependant.kind` CHILD/SPOUSE). Confirmed decisions: age at **commit date**; over-75 → top band +
  HR flag; **cents dropped (truncate), not rounded** (employees see whole EGP; the admin card keeps the operator's
  two-decimal figures); the **spouse is a dependant entered in the employee form like kids** (medical modal only
  selects). DOB required to commit (blocked, never guessed). Migration `034` (verified on throwaway Postgres); pricing
  verified end-to-end via `tsx` (family 16,879; mid-cycle 4/12 → 5,626). `tsc`/`build` green. Neon apply of `034` +
  HR filling DOBs are the remaining hand-off steps.
- **2026-08-05 — Backlog: HR bulk benefit release + export (not yet specced).** HR/Admin wants to release a single
  guaranteed benefit (e.g. **summer allowance**) to the **whole team at once** and **download a sheet** of employee
  name + amount-to-release for payroll/Finance. Distinct from the coverage work; to be specced next (own spec).

- **2026-08-17 — Identity data standards + data request campaigns (built, specs `029`/`033`, migrations `051`–`054`).** Self-editable legal names (EN/AR) + 14-digit national ID; strict per-country phone format; **dd/mm/yyyy display standard platform-wide (screens + CSVs)**; HR/Finance field-request campaigns with popup + live badge + tracker + formatted Excel outcome.
- **2026-08-18 — Benefits Reporting is read-only and engine-identical (built, spec `034`, no migration).** One report builder shared by page + Excel; pending claims count as used with their own column; guaranteed money never in the pool; access HR Admin/Finance/Super User; per-person popup; leavers behind a filter.
- **2026-08-18 — Time-Off counts working days, no limits (built, spec `035`, migration `055`).** Weekend = **Friday + Saturday**; an **HR-managed public-holidays list** (with Excel bulk upload) also never counts; **no annual entitlement — a per-calendar-year count only**, visible to employee/manager/HR; no leave types. Approvals follow the **current** org chart; leavers' pending requests auto-close; approved future trips are employee-cancellable; HR can delete mistaken requests. **Deferred:** bridge/long-weekend suggestions (own round after v2).
- **2026-08-18 — A guaranteed benefit is paid at most once per cycle (built, no migration).** Claims and bulk releases are mutually aware across all three payment paths; employee cards show the true state (navy=action, gold=in review, green=received) instead of a dead Request button.
- **2026-08-18 — Exceptions to benefit eligibility are per-person GRANTS, not sheet overrides (built, spec `036`, migration `056`).** A Release-sheet typed-amount Super-User override shipped and was **reverted the same day**: the sanctioned mechanism is a Super-User **grant** (one person × one benefit × the open cycle × a typed amount) that routes the person through the normal request→approve→pay flow. Grants override every service gate on the employee page and expire with the cycle.
- **2026-08-18 — "Exceptional releases" tab.** Everything paid outside an employee's own request (bulk release sheet + grants) lives in one Benefits Management tab; the standalone release page redirects; Amounts is config-only.
- **2026-08-18 — Dashboard = cards only.** Quick links removed (duplicated cards + nav); cards are Benefits · Time-Off · Approvals (managers) · Onboarding (while in progress).
- **2026-08-18 — Campaign popup submits, not finishes.** "Finish" → **Submit**, blocked until every listed field is confirmed/filled; "Later" still dismisses. Monitoring pages (tracker, campaign list) auto-refresh on focus + 30s.
- **2026-08-22 — Backlog: regular reviews + 1:1s with the team (parked, nothing specced, nothing built).** Requested so it is on record for future alignment: the platform should host the **recurring performance/check-in reviews and manager↔report 1:1s** — a place to schedule them, log what was discussed, and keep the history alongside the employee record. Scope, cadence, who can read what, and how it relates to the org chart are **all still open** — the requester will come back with the detail. **No spec, no schema, no UI until that alignment happens.** The source review template and the proposed shape (running journal → two-sided review sheet → agreed outcome carried into the next cycle) are parked in `specs/_parked/performance-reviews-and-1-1s.md`.

### Resolved earlier / Open
- **A · Design language** — *resolved 2026-07-27:* **navy/gold** (Forefront reference tool) product-wide. The benefits selector's layout/interaction is preserved but recolored to navy/gold (not paper/pine).
- **E · Real benefit figures** — *resolved:* ceilings, guaranteed amounts, and medical rate card all confirmed (spec `007`).
- **F · Learning Track timing** — *resolved:* stays Phase 2 (placeholder present in v1).

---

*Last Updated: 2026-08-22 (parked backlog item: regular reviews + 1:1s).*
