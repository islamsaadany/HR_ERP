# Implementation Plan: Benefits Orientation Tour

**Branch**: `claude/hr-erp-benefits-coverage-rates-hnaox1` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

## Summary

A client **stepped-cards** orientation (`BenefitsOrientation`) rendered on the Benefits page, fed the
personalized figures the page already loads (type, band, pool ceiling, guaranteed amounts, catalog
categories, coverage rates, FT5/PT3). It **auto-opens** when the employee hasn't submitted a basket and
hasn't seen it (and the selector is available); a **"How it works"** button re-opens it any time. A new
per-user `benefitsOrientationSeenAt` flag (migration 024) + a `markOrientationSeen` server action record
that it's been seen. Read-only explainer — no selector or money-rule change.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 App Router, React 19
**Storage**: `User.benefitsOrientationSeenAt DateTime?` (migration 024) — the only new state
**Testing**: `tsc` + `build`; throwaway Postgres for the migration + the seen-flag action
**Project Type**: Web application
**Constraints**: Navy/gold; mobile-friendly; content parity with `/benefits/policy`; no selector/money change
**Scale/Scope**: One client component + one server action + one migration + Benefits-page wiring

## Constitution Check

- **I. Align Before Building** — ✅ Decisions confirmed; a mockup is shown before build.
- **II. UI Changes Require Explicit Approval** — ⚠️ New overlay UI on the Benefits page. Navy/gold, mirrors the app; mockup approval gate. Snapshot the Benefits page before wiring the button.
- **III. Money & Rules Server-Authoritative** — ✅ No rule change; explainer only. Figures are read-only echoes of server data.
- **IV. Spec-Driven & Docs Move With Code** — ✅ Docs + migration in the implementing commit.
- **V. Engineered Enough** — ✅ Graceful degradation (missing type/band/pool), seen-flag write failure tolerated, mobile.

**Result: PASS** (mockup gate under II).

## Design

- **`BenefitsOrientation.tsx`** (client): a modal/overlay of ~4 stepped cards with Back/Next, Skip/Finish,
  and a dots position indicator. Props: `{ open (initial), autoOpen, employmentType, tenureBand, ceiling,
  maxSelect, guaranteed: {name, amount|null, salaryDriven}[], categories: string[], coverageExamples }`.
  On first close **after an auto-open**, calls `markOrientationSeen()` (fire-and-forget). Opening via the
  button never marks seen differently (already seen stays seen; unseen auto-open path marks on close).
- **"How it works" button** on the Benefits page header (near "How the benefits basket works →" link)
  toggles `open`.
- **Server (Benefits page)**: compute `hasSubmitted`, `seen` (from the new flag), `selectorAvailable`;
  `autoOpen = selectorAvailable && !hasSubmitted && !seen`. Pass the personalized figures (already derived
  for the guaranteed panel + selector) into the component.
- **`markOrientationSeen()`** server action: `requireUser()`; set `benefitsOrientationSeenAt = now()` if
  null; revalidate `/benefits`.
- **Content**: rule wording lifted from `/benefits/policy` (50% cap on company share, PT exempt; coverage
  %; claims reimburse covered portion); last step links to `/benefits/policy`.

## Project Structure

```text
prisma/
├── schema.prisma                       # + User.benefitsOrientationSeenAt DateTime?
└── sql/024_benefits_orientation.sql    # NEW — add the column (idempotent)

src/
├── components/benefits/
│   └── BenefitsOrientation.tsx         # NEW — stepped-cards overlay (client)
└── app/(app)/benefits/
    ├── page.tsx                        # (snapshot) compute autoOpen + personalized props; render orientation + button
    └── actions.ts                      # + markOrientationSeen()
```

**Structure Decision**: One client component + one tiny server action + one nullable column. All figures
reuse data the page already loads. The auto-open decision is server-computed; the button is pure client.

## Complexity Tracking

> No violations. Single nullable column; no rule logic touched.
