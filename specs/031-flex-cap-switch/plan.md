# Implementation Plan: Per-Cycle 50% Cap Switch

**Spec dir**: `031-flex-cap-switch` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

## Summary

A per-plan-year on/off setting for the 50%-per-benefit cap, editable while the cycle is open,
enforced server-side in `evaluateClaim`, mirrored in the client for UX, and surfaced to employees
on the Benefits page. Nothing retroactive.

## Technical Context

Same stack and verification pattern as 027/029/030: TypeScript, Next.js 16, Prisma, Postgres;
`tsc`, `build`, `tsx` assertions against a throwaway Postgres, Chromium pass. Migration `050`.

## Constitution Check

| Principle | Status |
|---|---|
| I. Align Before Building | ✅ Both open questions answered by the product owner: editable while open; extending a cycle is a later spec. |
| II. UI Requires Approval | ⚠️ **Gate open** — a control on the plan-year dialog and a notice on the employee Benefits page. Mockup before any component. |
| III. Money Server-Authoritative | ⚠️ **This IS a money rule.** The switch is read from the claim's own plan year inside `evaluateClaim`; the client never supplies it. Verified with claim-level assertions, not reasoning. |
| IV. Docs Move With Code | ✅ `050` + steering docs in the implementing commit. |
| V. Engineered Enough | ✅ Three columns on `PlanYear`, one extra field through an existing context object. No new table. |

## Phase 0 — Research

**R1 — Where the switch enters the rule engine.** `flexCap(ceiling)` is the single definition of
the per-benefit ceiling, used by `evaluateClaim`, the employee Benefits page, and the manual-release
action. Giving it a second parameter — `flexCap(ceiling, capEnabled)` returning the **full ceiling**
when disabled — puts the rule in one place and leaves every downstream calculation intact.

Returning the ceiling rather than `Infinity` matters: `benefitRemaining` stays a real number
bounded by the pool, so the pool ceiling keeps binding (FR-007) and the "nothing left" message
still fires correctly. `Infinity` would have made `benefitRemaining` non-finite and let the
pool-vs-benefit tie-break in `clampCovered` report the wrong limiting rule.

**R2 — Fixed allowances are unaffected by construction.** `evaluateClaim` already computes
`benefitCeiling = min(allocation, cap)` for an allowance. With the cap raised to the full ceiling
the `min` still selects the band amount, so FR-008 holds with no special-casing — the existing
expression is already correct under both settings. Worth an explicit assertion rather than a
comment, because it is the kind of thing a later refactor silently breaks.

**R3 — Non-retroactivity is already the shape of the engine.** Claims store their covered amount at
approval; nothing re-derives a historical claim. `benefitRemaining` is `max(0, ceiling - used)`, so
a benefit past the re-enabled cap yields exactly zero, never negative (FR-011). This feature adds
no new mechanism for this — it inherits it, which is why re-enabling is safe.

**R4 — The manual-release call site.** `manual-actions.ts` uses `flexCap(ceiling)` as the
allocation an HR release is measured against. It must read the same plan year's setting, or HR
could release beyond what the cycle's rule allows. Same call, same source of truth.

**R5 — Audit columns over an audit table.** Who changed it and when (FR-004) are two columns on
`PlanYear`, not a history table. The setting is a single boolean on a long-lived cycle that changes
rarely and always by an admin; a table would be more machinery than the question deserves. Recorded
as a deliberate limit: **only the most recent change is retained**, not a full history.

## Phase 1 — Design

- **`PlanYear`** gains `flexCapEnabled Boolean @default(true)`, `flexCapChangedById String?`,
  `flexCapChangedAt DateTime?`.
- **`flexCap(ceiling, capEnabled = true)`** — the whole rule change.
- **`AllowanceContext`** gains `flexCapEnabled: boolean`, supplied by the server from the claim's
  plan year.
- **Server action** `setFlexCapEnabled` — `requireAdmin`, refuses a non-open plan year, stamps the
  actor and time.
- **UI**: a control on the admin plan-year surface; a notice on the employee Benefits page when the
  cap is off, and the per-benefit figures reflecting the setting.

**Invariants**: the pool ceiling binds in both settings · a fixed allowance stays bounded by its
band amount · no existing claim changes when the setting changes · a benefit past a re-enabled cap
has zero remaining, never negative · each plan year's setting is independent.

**Contracts**: none — server actions only.
