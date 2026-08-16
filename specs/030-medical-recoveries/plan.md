# Implementation Plan: Medical Premium Recoveries

**Branch**: `claude/employee-password-reset-hx1ugp` (spec dir `030-medical-recoveries`) | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

## Summary

A `MedicalRecovery` per employee whose cover ends mid-term, carrying the expected refund and its working, settled by Finance with the amount actually received. One new table, one pure calculation, one section on `/finance`.

## Technical Context

**Stack**: TypeScript, Next.js 16 App Router, Prisma, PostgreSQL (Neon). Server actions; no external API.

**Testing**: No test runner — verification is `tsc`, `build`, `tsx` assertions against a throwaway Postgres, and a Chromium pass, matching specs 018/023/027/028.

**Constraints**: Money is server-authoritative. An existing recovery's expected amount is never recomputed (FR-013), mirroring how a charge applied to a closed cycle is never rewritten.

## Constitution Check

| Principle | Status |
|---|---|
| **I. Align Before Building** | ✅ Feature originated from the product owner's own challenge; shape and placement confirmed. |
| **II. UI Requires Approval** | ✅ Mockup approved 2026-08-16. |
| **III. Money Server-Authoritative** | ✅ Expected amount computed server-side from stored figures; settling is a Finance-gated server action. |
| **IV. Docs Move With Code** | ✅ `048` SQL + three steering docs in the implementing commit. |
| **V. Engineered Enough** | ✅ One table, one pure function. No workflow engine for a list that must reach zero. |

## Phase 0 — Research

**R1 — What creates a recovery.** The spec's signal is "the employee ceases to be active". The existing cancellation path (`applyScheduledMedicalCharges`, spec 027) is the natural hook, but it only fires when a cycle opens — and a leave date is often recorded weeks later. **Decision**: create at cancellation *and* reconcile on the Finance page load, with `commitmentId` unique so the reconcile is idempotent. A read-time insert is a deliberate trade: the alternative is hooking every path that can mark someone LEFT, which is more surface for a row to be missed on.

**R2 — The expected amount.** `expectedMonths = wholeMonthsBetween(dayAfter(coverEndedOn), term.end)`, `expectedAmount = floor(premium × expectedMonths ÷ termMonths)`. Reuses `recoverablePeriod` and `wholeMonthsBetween` from spec 027. **Explicitly not** the cancelled charge (FR-002).

**R3 — Frozen at creation.** `premiumAtCreation` and `expectedAmount` are stored, not derived, so a later premium edit cannot restate a figure Finance may already have claimed against.

## Phase 1 — Design

**`MedicalRecovery`**: `commitmentId` (unique), `userId`, `policyYearId`, `coverEndedOn?`, `premiumAtCreation`, `expectedMonths`, `expectedAmount`, `status` (`OPEN`/`RECOVERED`/`WRITTEN_OFF`), `recoveredAmount?`, `recoveredOn?`, `shortfall?`, `reason?`, `settledById?`, `settledAt?`.

**Invariants**: one recovery per commitment · `shortfall = max(0, expected − recovered)` · a settled recovery is never re-settled · `coverEndedOn` null ⇒ `expectedAmount` 0 and the row reads "needs leave date".

**Contracts**: none — no external interface. The invariants above are what `quickstart` proves.
