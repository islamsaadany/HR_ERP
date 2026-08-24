# Specification Quality Checklist: Bank Confirmations & Monthly Salary Runs

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-24 · **Revised**: 2026-08-24 after the CEO corrected the framing
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

- **The first draft got the premise wrong and was rewritten.** It described the CEO as approving
  payments. He corrected it: *"I don't approve payments. I confirm the transaction in the bank."*
  That reframed the whole feature — the platform notifies and records, it does not gate. Every
  screen, state name and email in the spec now says send / confirm / tick off rather than approve.
  Worth keeping in view: the wrong word had produced a design that implied the app held the power to
  release money, which it never does.
- **Decisions taken by the CEO on 2026-08-24**: he ticks a submission off after confirming in the bank
  (so the platform can show what is outstanding and hold the record); nobody stands in for him, so
  payments wait; the email carries totals and a link, never payee names or amounts; and the
  marketing float opens owing 9,726.26, the closing figure of the latest workbook tab, with earlier
  months already settled.
- **One departure from house pattern is deliberate and flagged** (FR-003): unlike Learning managers,
  top-level access does **not** confer confirmation implicitly, because "it waits for me and nobody
  else" would otherwise be untrue. The lock-out risk that pattern exists to prevent is covered by
  FR-004 instead — the list can always be refilled, including by self-appointment.
- **Values deferred to planning, not decisions**: the reminder's default lead time, and the
  attachment size limit, both following existing platform values.
