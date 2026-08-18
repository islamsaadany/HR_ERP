# Feature Specification: Per-Person Guaranteed-Benefit Grants

**Feature Branch**: `claude/user-data-edit-attributes-eom3zv`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "Some employees are blocked from a guaranteed benefit (e.g. the Summer allowance) for mixed reasons — wrong employment type, under 6 months, no start date — and management wants specific individuals to receive it anyway through the normal channel: it appears on their Benefits page, they Request it, HR approves, Finance pays, with every existing guard applying."

## Context

Guaranteed-benefit eligibility is rule-based: employment type flags plus a tenure-band amount. Real life has exceptions — a valued part-timer on a full-time-only benefit, a strong new joiner still under six months — and today the only ways around the rules are wrong ones: widening the benefit's eligibility for *everyone*, or paying outside the request→approve→pay flow (a Release-sheet typed-amount override shipped 2026-08-18 and was reverted the same day for exactly this reason — a payroll record is not the channel).

A **grant** names ONE employee on ONE guaranteed benefit for the OPEN cycle, with an explicit amount. For that person the benefit behaves as if they were eligible — nothing else changes for anyone else, and every existing guard still applies.

Decisions locked at alignment (2026-08-18): grants handle **any** blocking reason; the **amount is typed per person** at grant time (pre-filled when a band figure is derivable); a grant belongs to the **open plan year only** (next cycle starts clean); **Super User** manages grants; grants never widen the benefit's general eligibility.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Super User grants the benefit to a blocked employee (Priority: P1)

A Super User opens the guaranteed benefit's grants panel, picks any active employee (the panel shows why the rules block them), types the amount (pre-filled when the band table can price them), and saves. The grant lists who granted it, when, and the amount; it can be removed while unused.

**Why this priority**: The grant is the feature — everything else consumes it.

**Independent Test**: Grant a part-timer a full-time-only benefit; confirm the grant row appears with amount/grantor/date and the employee's page changes (US2).

**Acceptance Scenarios**:

1. **Given** an active employee blocked for any reason (type, no band, no start date), **When** the Super User grants with a typed positive amount, **Then** the grant is stored for the open cycle with amount, grantor, and date.
2. **Given** an employee the band table CAN price, **When** picked, **Then** the amount pre-fills with their band figure and stays editable.
3. **Given** an existing unused grant, **When** removed, **Then** the benefit disappears from the person's page again and nothing else changes.
4. **Given** a grant whose person has a non-rejected claim on the benefit, **When** removal is attempted, **Then** it is refused with the reason (the money story must stay auditable).
5. **Given** a non-Super-User, **Then** the grants panel and its actions are refused server-side.
6. **Given** a duplicate grant (same person, benefit, cycle), **Then** it is prevented — one grant per person per benefit per cycle.

---

### User Story 2 - The granted employee requests it like anyone else (Priority: P1)

The granted employee's Benefits page shows the benefit card with THEIR granted amount. They Request it (note or proof, per the benefit's claim rule), HR reviews, Finance pays — the identical journey an eligible colleague has, including the once-per-cycle state chips.

**Why this priority**: "Through the normal channel" is the whole point — the reverted sheet override failed exactly this.

**Independent Test**: As the granted part-timer, see the card at the granted amount, request it, approve as HR, confirm as Finance; verify the chip flips to Received.

**Acceptance Scenarios**:

1. **Given** a granted employee, **When** they open Benefits, **Then** the benefit card appears with the granted amount.
2. **Given** their request, **Then** it flows SUBMITTED → HR approve/decline → Finance payment, with claim-type rules (note/proof) and notifications exactly as for eligible employees.
3. **Given** the request/decision, **Then** the once-per-cycle guard applies: no second request, no release on top, state chips shown.
4. **Given** an employee with no grant and no eligibility, **Then** nothing changes — the card stays absent and the server still refuses their claim.
5. **Given** the next cycle opens, **Then** the grant does not carry over — the card disappears unless granted again.

---

### User Story 3 - Grants are visible where money is handled (Priority: P2)

The Release Guaranteed Benefit sheet lists granted people alongside eligible ones — at their granted amount, marked "granted" — so bulk release and the payroll CSV can include them; the once-per-cycle guard spans their claims and releases identically.

**Why this priority**: Keeps one truthful sheet; without it a granted person is invisible to payroll.

**Independent Test**: Grant someone, open the sheet: their row shows the granted amount + a granted marker; release works; a claim afterwards is refused.

**Acceptance Scenarios**:

1. **Given** a granted employee, **When** the sheet loads for that benefit, **Then** their row appears at the granted amount, marked as granted.
2. **Given** their release from the sheet, **Then** the employee's card shows "Received — released by HR" and a later request is refused (existing guard).
3. **Given** a granted person who already claimed, **Then** their sheet row is blocked exactly like an eligible claimant's.

---

### Edge Cases

- Grantee leaves the company: their pending claim closes per existing rules; the grant simply expires with the cycle (no cleanup needed).
- The benefit's general eligibility later changes to include the person's type: the band figure then resolves normally; the grant's typed amount still wins for them this cycle (it was the explicit decision).
- Salary-driven benefits (Loans): excluded from grants — their amount is the person's salary by rule, not a typed figure.
- A granted amount of zero or negative: refused at entry.
- Grants are per-cycle data: closing the cycle freezes them as history; the reporting page's guaranteed totals already count the resulting claims/releases.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A Super User MUST be able to grant any ACTIVE employee a specific fixed-allowance guaranteed benefit for the open cycle with a typed positive amount (pre-filled where a band figure is derivable), and see amount/grantor/date on each grant. Salary-driven benefits are excluded.
- **FR-002**: One grant per (person × benefit × cycle); duplicates prevented.
- **FR-003**: A grant MUST make the benefit appear on that person's Benefits page at the granted amount and be requestable through the standard claim flow (claim-type rules, HR review, Finance payment, notifications) — identical to an eligible employee.
- **FR-004**: The server claim path MUST honor grants: a granted person passes the eligibility check for that benefit with the granted amount as their allocation; everyone else is refused exactly as today.
- **FR-005**: The once-per-cycle guard MUST span a granted person's claims AND releases identically to an eligible person's.
- **FR-006**: The Release Guaranteed Benefit sheet MUST list granted people at their granted amount, marked as granted, releasable like others.
- **FR-007**: An unused grant MUST be removable (the card disappears again); removal MUST be refused once a non-rejected claim exists on it.
- **FR-008**: Grants MUST expire with the cycle — never auto-carry to the next plan year.
- **FR-009**: All grant management and honor checks are enforced server-side; grants never alter the benefit's general eligibility flags.

### Key Entities

- **Benefit Grant**: one employee × one guaranteed benefit × one plan year, with an amount (EGP), who granted it, and when.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A blocked employee can be granted and can complete a request within the same day, entirely through the standard flow — zero out-of-band payments.
- **SC-002**: Granting affects exactly one person: no other employee's page, amounts, or eligibility changes.
- **SC-003**: A granted person can never be paid the benefit twice in a cycle (request + release combinations all blocked), 100% of the time.
- **SC-004**: When the next cycle opens, zero grants carry over.

## Assumptions

- Grants are managed from the admin Benefits surface (per-benefit panel); mockup to be signed off before build.
- The granted amount is the person's full allocation for that benefit this cycle (proration does not re-shrink a typed figure — the Super User types what the person should get).
- HR Admin / Finance see the downstream artifacts (claims, releases, payments) as usual; only managing grants is Super-User-gated.
- Depends on: guaranteed claim flow (specs 016/018/020), release sheet (spec 013), once-per-cycle guard (2026-08-18).
- Replaces the reverted Release-sheet typed-amount override as the sanctioned exception mechanism.
