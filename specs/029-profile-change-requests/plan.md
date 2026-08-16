# Implementation Plan: Profile Change Requests

**Spec dir**: `029-profile-change-requests` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

## Summary

Employees propose corrections to their own record; HR decides **field by field**, and approving *is*
the edit. Phone becomes directly editable and never enters the queue.

## Technical Context

Same stack and verification pattern as 027/030: TypeScript, Next.js 16, Prisma, Postgres; `tsc`,
`build`, `tsx` assertions against a throwaway Postgres, Chromium pass. Migration `049`.

## Constitution Check

| Principle | Status |
|---|---|
| I. Align Before Building | ✅ Fields, per-field decisions and phone-direct all confirmed by the product owner. |
| II. UI Requires Approval | ⚠️ **Gate open** — two new surfaces (employee request form, HR review queue). Mockup before any component. |
| III. Money Server-Authoritative | ✅ No money. The one money-adjacent case — a dependant change against a committed premium — only *warns*; FR-016 forbids repricing. |
| IV. Docs Move With Code | ✅ `049` + steering docs in the implementing commit. |
| V. Engineered Enough | ✅ Two tables. No workflow engine. |

## Phase 0 — Research

**R1 — Per-field decisions drive the shape.** The decision, decider and timestamp belong to the
**field**, not the request. A request is just the envelope that groups fields submitted together
and carries the employee's reason.

**R2 — Values are stored as text.** Every requestable field (emergency contact ×3, date of birth,
marital status) serialises to a string; approving parses and writes to the typed column. One table
instead of one column per requestable field, so adding a field later is data, not migration.

**R3 — Dependants are not a simple field.** A dependant request is an *add*, *remove* or *edit*,
not a before/after value. Modelled as a field whose key encodes the operation and target
(`dependant.add`, `dependant.remove:<id>`, `dependant.edit:<id>`) with a JSON value. **Deferred out
of the MVP** — the contact/personal fields deliver the feature, and dependants carry the medical
warning and the most display complexity.

**R4 — "Current" is read at review time**, never stored on the request (FR-010). Storing it would
let an approval silently revert an edit HR made while the request was pending.

## Phase 1 — Design

- **`ProfileChangeRequest`**: `userId`, `reason?`, `createdAt`. Open while any field is undecided.
- **`ProfileChangeField`**: `requestId`, `field` (key), `requestedValue` (text), `status`
  (`PENDING`/`APPROVED`/`DECLINED`), `decisionReason?`, `decidedById?`, `decidedAt?`.
  Unique on `(requestId, field)`.

**Invariants**: one open request per employee · a decided field is never re-decided · approving
writes only that field · the request leaves the pending count only when every field is decided.

**Contracts**: none — server actions only.
