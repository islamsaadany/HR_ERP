# Specification Quality Checklist: Learning Tracks

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-16
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain — **three open questions stand deliberately** (date
      shape, reminder cadence, whether the sequence locks). Each has more than one defensible answer
      and no safe default; they are the subject of `/speckit-clarify`.
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded (an explicit *Out of scope* section)
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Constitution Check

- [x] Authority is an appointment, not a new role (FR-011)
- [x] Access is decided in one place (FR-007)
- [x] Server enforces every refusal, not the screen (FR-015)
- [x] Dates display dd/mm/yyyy (FR-025)
- [x] Email is env-gated, master-toggleable and fire-and-forget (FR-024)
- [ ] **No scheduled process emails an employee — DELIBERATELY BROKEN.** Chosen by the CEO on
      2026-09-16 with the alternatives on the table; recorded in the spec's *Deliberate deviations*
      section with the reason. **The constitution must be amended via `/speckit-constitution` before
      this ships** — that step has not been done.

## Notes

The three open questions do not block `/speckit-clarify`; they are its input. They DO block
`/speckit-plan`, because each changes what gets built:

1. **Date shape** — relative to joining the track, fixed calendar date, or both. Changes every screen
   that shows or sets a date, and the daily job's arithmetic.
2. **Reminder cadence** — how often and for how long. The difference between a reminder and the
   reason people mute the platform.
3. **Locking** — whether step two waits for step one. Changes what an employee can open, so it
   reaches back into the access rule itself.

Open Question 2 is the one with a blast radius: FR-020 sends mail to the whole company on a schedule,
so the bound must be a decision, never a default that a later reading quietly widens.
