# Specification Quality Checklist: Medical Premium Recoveries

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-16
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**How this spec came about, since it shapes what it does and doesn't cover:**

The recoverable figure was already computed for spec 027 and shown to HR. The product owner
challenged it — *"who are we helping with that data?"* — and the honest answer was nobody: HR
processed the departure and doesn't reconcile insurer credit notes. The number only becomes
worth having when it reaches **Finance**, where it carries an action and a closing state. So this
spec is deliberately narrow: it is not a reporting feature, it is a **to-do that can be closed**.

**Validation pass 1 — issues found and fixed:**

1. *An untestable success criterion.* "Finance has better visibility of losses" was replaced by
   SC-003 and SC-005, which can be checked against figures: no leaver under-claimed, and the
   expected-versus-actual difference recorded.
2. *A requirement that would have shipped the original bug.* An early draft said the recovery shows
   "the cancelled charge". That is precisely the wrong number — it excludes the month sitting inside
   an already-applied charge and under-claims every leaver. FR-002 now states the correct basis and
   explicitly rules the cancelled charge out.
3. *A missing failure mode.* Nothing said what happens when an employee has no recorded leave date.
   Computing from a missing date would produce a confident, wrong figure. FR-014 requires it to
   surface as needing a date instead.

**Deliberate judgement calls, recorded rather than asked:**

- **The expectation is a claim, not an authority.** The insurer decides the actual refund. Both
  figures are recorded so a disagreement is visible rather than resolved by assumption.
- **Re-activation does not delete a recovery** (FR-015). The insurer may already have been
  notified, so quietly removing the item could lose a real credit.
- **No backfill for past leavers.** Departures already settled offline would surface as phantom
  work Finance can't act on.

No [NEEDS CLARIFICATION] markers remain. Ready for `/speckit-plan`.
