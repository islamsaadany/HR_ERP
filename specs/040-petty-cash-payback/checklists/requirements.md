# Specification Quality Checklist: Petty Cash & Payback Requests

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-24
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

- **No clarification markers**: the eight decisions that would otherwise have been marked were put
  to the CEO before drafting (2026-08-24) and answered — custodian float accounts; custodian enters
  lines and Finance reviews; payback routed Finance-then-CEO (the CEO half is spec 041); per-period
  budget only, Forecast and Tools Subscription out; two specs (040 here, 041 approval + payroll);
  approval modelled as an appointment; salary batch held as a summary only; notify-then-confirm
  against the bank.
- **Two items carried forward to planning rather than left ambiguous here**: the exact maximum
  evidence file size (FR-024) and the seeded contents of the section/category lists (FR-026). Both
  are values, not decisions about scope — the workbook supplies the list values and the platform's
  existing upload limit supplies the size.
- **One amendment is required before this ships**, recorded in the spec's *Dependencies &
  Constraints*: email is currently constitutionally limited to two workflows and FR-028 adds a
  third. Not a spec defect — a governance change the CEO asked for, which must land in the
  constitution, `CLAUDE.md` and the decisions log in the same commit as the code.
