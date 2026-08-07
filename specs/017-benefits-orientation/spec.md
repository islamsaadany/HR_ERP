# Feature Specification: Benefits Orientation Tour

**Feature Branch**: `017-benefits-orientation`

**Created**: 2026-08-07

**Status**: Implemented (2026-08-07, migration `024`)

**Input**: A personalized, first-run, skippable, re-openable stepped walkthrough on the Benefits page that eases employees into building their flexible basket. Layers on the built Benefits module (specs 007/012); changes no money rule.

> **Relationship to other specs**: Read-only explainer over the data the Benefits page already loads (band,
> pool ceiling, guaranteed amounts, catalog, coverage rates). It **does not** change the selector, the
> money rules, or any admin surface. The only new persisted state is a per-user "orientation seen" flag.

## Clarifications

### Decisions already made (do not re-open)

- **Format:** **stepped cards** — a short multi-step intro (one step at a time, Back/Next + Skip), **not** coach-marks on live elements. Navy/gold, mirrors the app.
- **Personalized:** shows the employee's **real** figures — employment type + tenure band, **their** pool ceiling, and **their** guaranteed benefits with amounts for their band (Loans salary-driven).
- **~4 steps:** (1) *Here's you* — type, band, pool. (2) *What you already get* — guaranteed basket + amounts. (3) *How the flexible basket works* — categories, pick up to **5 FT / 3 PT**, enter full cost, company covers a % that draws from the pool, you pay the rest. (4) *The rules, quickly* — 50% cap on the company share (PT exempt), coverage % (100/80/50), claims (proof of full spend → reimbursed the covered portion).
- **When it auto-appears:** the **first time** an employee opens Benefits **and** until they've **submitted** a basket. Always **Skip/dismiss**. Always **re-openable** via a **"How it works"** button on the Benefits page.
- **Remembering:** once dismissed/finished, it does **not** auto-open again (a per-user "seen" flag). The button re-opens it any time.
- **Content source:** reuse the plain-language rules from `/benefits/policy` and the selector's Terms (consistency); the last step **deep-links** to the full `/benefits/policy` guide. The tour is the interactive, personalized, first-run layer — not a new rulebook.
- **Scope:** employee Benefits page only; no admin surface; no money-rule or selector-behavior change.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-time guided intro (Priority: P1)

An employee who has never submitted a basket opens the Benefits page and is greeted by a short, stepped
orientation that walks them — in their own numbers — from "here's your budget" to "here are the rules,"
then drops them into the basket. They can Skip at any point.

**Why this priority**: The whole point — reduce the cold-start confusion of the money module for new users.

**Independent Test**: As an employee with no submitted basket who hasn't seen the tour, open Benefits →
the orientation appears automatically at step 1; Next advances through the steps; Finish/Skip closes it and
reveals the normal Benefits page.

**Acceptance Scenarios**:

1. **Given** an employee who hasn't submitted a basket and hasn't seen the tour, **When** they open Benefits, **Then** the orientation appears automatically at the first step.
2. **Given** the orientation open, **When** the employee clicks Next/Back, **Then** it moves between steps (~4) with a visible position indicator; **When** they click Skip or Finish, **Then** it closes and the Benefits page is usable.
3. **Given** the employee finished or skipped the tour, **When** they reload or revisit Benefits, **Then** it does **not** auto-open again.

### User Story 2 - Personalized to me (Priority: P1)

The steps show the employee's actual employment type, tenure band, pool ceiling, and guaranteed benefits
with the amounts for their band — not generic placeholders.

**Why this priority**: Personalized figures are what make the orientation genuinely useful ("your pool is X").

**Independent Test**: For a full-time, 4–7y employee, confirm step 1 shows Full-time · 4–7 years · their
pool ceiling, and step 2 lists their guaranteed benefits with the 4–7y amounts (Loans shown salary-driven).

**Acceptance Scenarios**:

1. **Given** an employee with a set type/band, **When** step 1 renders, **Then** it shows their employment type, tenure band, and pool-ceiling figure.
2. **Given** guaranteed benefits configured, **When** step 2 renders, **Then** it lists the benefits with the amounts for the employee's band (salary-driven items labelled, not zero).
3. **Given** an employee whose type or band isn't set, **When** the tour renders, **Then** it degrades gracefully (shows what's known, no crash, no fake numbers).

### User Story 3 - Re-open on demand (Priority: P2)

Any employee can re-open the orientation later from a **"How it works"** button on the Benefits page, even
after submitting.

**Why this priority**: The explainer stays useful as a reference, not a one-shot.

**Independent Test**: With the tour already dismissed, click "How it works" on Benefits → the orientation
opens at step 1; closing it does not change the seen flag's effect (it still won't auto-open).

**Acceptance Scenarios**:

1. **Given** any employee on Benefits, **When** they click "How it works", **Then** the orientation opens regardless of the seen flag or submission status.
2. **Given** the tour opened via the button, **When** they close it, **Then** the page returns to normal and the tour still does not auto-open on future visits.

### User Story 4 - Consistent, deep-linked rules (Priority: P3)

The rules shown in the tour match the `/benefits/policy` guide and the selector's Terms; the last step links
to the full guide.

**Why this priority**: Prevents drift between three explanations of the same rules.

**Independent Test**: Compare the tour's rule wording to `/benefits/policy`; confirm the last step has a
working link to `/benefits/policy`.

**Acceptance Scenarios**:

1. **Given** the rules step, **When** it renders, **Then** the 50% cap (on company share; PT exempt), coverage % (100/80/50), and claims (proof of full spend → covered portion) are described consistently with the policy guide.
2. **Given** the last step, **When** it renders, **Then** it links to the full `/benefits/policy` guide.

### Edge Cases

- **No open plan year / benefits not configured** — the Benefits page already shows an empty state; the tour should not auto-open in a broken/empty config (or opens but reads gracefully). Working default: auto-open only when the selector is available (active plan year + ceiling + catalog), else only via the button.
- **Employee has a draft (saved, not submitted)** — still counts as "not submitted," so it may auto-open until they've seen it; once seen, it won't re-open.
- **Type/band/pool missing** — steps show what's known and omit missing figures without fabricating.
- **Very small viewport** — the stepped cards remain readable and dismissible on mobile.
- **Seen flag write fails** — the tour still closes locally for the session; worst case it re-appears next visit (no data loss, no block).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Benefits page MUST show a **stepped orientation** (~4 steps, Back/Next, Skip/Finish, position indicator) that **auto-opens** the first time an employee opens Benefits **while they have not submitted a basket and have not seen the tour**.
- **FR-002**: The orientation MUST be **personalized** — showing the employee's employment type, tenure band, pool ceiling, and guaranteed benefits with the amounts for their band (salary-driven items labelled).
- **FR-003**: The steps MUST cover: (1) their pool, (2) guaranteed benefits, (3) how the flexible basket works (categories; up to 5 FT / 3 PT; enter cost; company covers a % drawing from the pool; you pay the rest), (4) the rules (50% cap on company share, PT exempt; coverage %; claims reimburse the covered portion).
- **FR-004**: The orientation MUST be **dismissible** (Skip/Finish) at any step, after which the normal Benefits page is fully usable.
- **FR-005**: Once dismissed or finished, the orientation MUST NOT **auto-open** again — persisted via a **per-user "orientation seen" flag**.
- **FR-006**: A **"How it works"** control on the Benefits page MUST **re-open** the orientation at any time, regardless of the seen flag or submission status.
- **FR-007**: The rules content MUST be **consistent** with `/benefits/policy` and the selector's Terms, and the last step MUST **link** to `/benefits/policy`.
- **FR-008**: The feature MUST NOT change the selector's behavior, any money rule, or any admin surface; it is a read-only explainer plus the seen flag.
- **FR-009**: The orientation MUST **degrade gracefully** when type/band/pool or config is missing (show what's known; never fabricate figures; never crash).

### Key Entities *(include if feature involves data)*

- **User (extended)**: gains a **"benefits orientation seen"** marker (a timestamp or boolean). No other model changes. All personalized figures come from existing data the Benefits page already loads (User type/band, `PoolCeiling`, `GuaranteedBenefit`, `BenefitCatalogItem` coverage rates).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time (not-submitted, not-seen) employee sees the orientation **automatically** on opening Benefits; a seen employee does **not**.
- **SC-002**: Step 1 shows the employee's **own** pool ceiling and band; step 2 shows their guaranteed amounts for that band — **zero** generic/placeholder figures for a fully-configured employee.
- **SC-003**: The orientation can be **skipped in one action** from any step, and the Benefits page is immediately usable afterward.
- **SC-004**: The **"How it works"** button re-opens the orientation in **100%** of cases, including after submission.
- **SC-005**: The tour's rules match the policy guide, and the last step links to it — **no** contradictory rule statements across the three surfaces.

## Assumptions

- **Reuses** the Benefits page's existing server data (type, band, pool ceiling, guaranteed amounts, catalog, coverage rates) — no new fetch beyond what's already loaded.
- **"Seen" flag** is a single per-user marker (timestamp/boolean) set when the employee first dismisses/finishes the tour; the "How it works" button ignores it.
- **"Not submitted"** = no submitted basket for the active plan year (a saved draft still counts as not submitted).
- **Auto-open guard**: only when the selector is actually available (active plan year + ceiling + catalog); otherwise the tour is reachable only via the button.
- **Content parity** with `/benefits/policy` is maintained by reusing its plain-language rules; the tour does not introduce new rules.
- **Navy/gold**, mirrors the app; mobile-friendly; no change to selector behavior.
