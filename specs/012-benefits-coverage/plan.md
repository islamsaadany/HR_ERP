# Implementation Plan: Benefits — Company Coverage Rates (Co-Funding)

**Branch**: `claude/hr-erp-benefits-coverage-rates-hnaox1` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-benefits-coverage/spec.md`

## Summary

Give each flexible benefit a **company coverage rate** (%). The employee enters the benefit's **full
cost**; the system derives the **covered (company) amount = cost × rate** — the only part that draws
from the pool — and the **out-of-pocket = cost − covered**. All money rules (pool total, over-pool,
the full-time 50% single-benefit cap) run on the **covered** amount. Medical stays a single 100%-covered
rate-card item. Selection limits rise to **full-time 5 / part-time 3**. Claims reimburse the **covered
portion** of a proven spend, capped at the covered allocation. All coverage math is **server-authoritative**.

The catalog gains a `coverageRate`; the selection line stores both the entered **cost** and the derived
**covered** amount (the pool draw). HR edits the coverage rate per benefit in the **existing** admin
Benefits **Configuration** tab's catalog editor (the broader admin-Benefits tab redesign is a **separate**
upcoming spec — see "Scope boundary" below).

## Technical Context

**Language/Version**: TypeScript, Next.js 16 App Router, React 19
**Primary Dependencies**: Prisma (PostgreSQL/Neon), Tailwind
**Storage**: PostgreSQL — `BenefitCatalogItem.coverageRate` (Int %) + `SelectionLine.cost` (Int); `SelectionLine.amount` keeps its meaning as the **covered** pool draw
**Testing**: `npx tsc --noEmit` + `npm run build`; throwaway local Postgres for the migration + a rules proof script (`scripts/verify-coverage.mts`) exercising the acceptance scenarios
**Target Platform**: Vercel
**Project Type**: Web application
**Constraints**: All rules server-side (Constitution III); the ported selector's layout/interaction is a preserved asset — extend it (cost input + 3 figures + covered meter), do not redesign it; migration reaches Neon via a numbered `prisma/sql/` file
**Scale/Scope**: 11-item flexible catalog; the selector, the save/submit action, the rules engine, the claims tracker wording, and one admin editor

## Constitution Check

*GATE: Must pass before Phase 0. Re-check after Phase 1.*

- **I. Align Before Building** — ✅ Spec clarified (DC-1/2/3); FT5/PT3 confirmed (PT raised to 3 per the 2026-08-07 decision); coverage rates fixed; medical unchanged. No open decisions.
- **II. UI Changes Require Explicit Approval** — ⚠️ The **selector** changes: each selected benefit shows cost · company share · your share, and the meter tracks the company share. This is an **extension** of the preserved navy/gold selector (a cost field + derived figures), not a redesign of its layout/interaction. Snapshot `BenefitsSelector.tsx` (and any edited benefits UI) to `ui-versions/` first. The exact per-benefit labels follow DC-3. **This warrants a look-and-feel confirmation from the product owner before/at implementation** (flagged in the completion report).
- **III. Benefits Money & Rules Server-Authoritative (NON-NEGOTIABLE)** — ✅ Covered amount, pool total, over-pool, 50% cap, selection limits, and claim caps are all computed/enforced in `src/lib/benefits/rules.ts` + `saveBasket` + claim actions on the **covered** amount. The client mirrors for UX only.
- **IV. Spec-Driven & Docs Move With Code** — ✅ Spec + steering docs + `prisma/sql/023_*.sql` updated in the implementing commit. Where this supersedes 007 FRs (max-4→5, PT max-2→3, pool-draw semantics), 007's spec is annotated in the same change.
- **V. Engineered Enough** — ✅ Edge cases: 0% rate, non-1,000 covered, medical (cost=covered), rate change vs claimed-lock (covered allocation must not drop below claimed), rate raised mid-draft. Coverage math centralized in one helper (no duplication client/server — client imports the same pure function).

**Result: PASS** (with the UI-confirmation flag under II).

## Scope boundary (what this plan does NOT include)

The product owner also asked for an **Admin → Benefits redesign** (reorder tabs to *Submissions & Claims ·
Catalogue · Amounts*; a single Catalogue table with **coverage % as a column**; view-first config tables
with an Edit button; HR/Super-User **manual/back-dated claim & release** entry with an approval date;
FT/PT eligibility deferred to future). That is a **distinct feature** and will be its **own spec (016)**,
implemented right after — coordinated so coverage-% editing moves into the new Catalogue table then. **In
this spec**, coverage-% editing is added to the **existing** Configuration-tab catalog editor so 012
ships complete on its own. (This keeps 012 from ballooning, matching the owner's "keep spec 12 from
getting too big" steer.)

## Project Structure

### Documentation (this feature)
```text
specs/012-benefits-coverage/
├── spec.md          # clarified
├── concept.md       # approved concept (imported)
├── plan.md          # this file
├── research.md      # Phase 0
├── data-model.md    # Phase 1
├── contracts/
│   └── save-basket.md   # Phase 1 — payload + server rules contract
├── quickstart.md    # Phase 1 — validation guide
└── checklists/
```

### Source Code (repository root)
```text
prisma/
├── schema.prisma                       # BenefitCatalogItem.coverageRate; SelectionLine.cost
└── sql/023_benefits_coverage.sql       # NEW — add columns, seed rates (80/50), backfill cost=amount

src/
├── lib/benefits/
│   ├── coverage.ts                     # NEW — coveredAmount(cost, rate), outOfPocket(...), shared client+server
│   └── rules.ts                        # covered-based totals/cap; MAX_SELECT FT 5 / PT 3; lines carry cost+rate
├── app/(app)/benefits/
│   └── actions.ts                      # saveBasket: payload items = {key, cost}; derive covered; store amount+cost
├── components/benefits/
│   ├── BenefitsSelector.tsx            # cost input; per-benefit cost · company share · your share; meter = covered
│   └── BenefitClaims.tsx               # wording: reimburse the covered portion (figures already covered-terms)
├── app/(app)/benefits/page.tsx         # pass coverageRate + cost into the selector; totals in covered terms
├── app/(app)/admin/benefits/
│   └── config-actions.ts + page.tsx    # catalog editor gains a coverage-% field (existing Configuration tab)
└── app/(app)/benefits/policy/page.tsx  # explain coverage in words (rates by benefit; covered vs out-of-pocket)
```

**Structure Decision**: Single Next.js app. A new `coverage.ts` holds the two pure functions used by
**both** the server rules and the client selector (single source of truth, no drift). `SelectionLine.amount`
deliberately keeps its meaning as the **covered pool draw**, so claims/export/tracker/claimed-locks continue
to operate in covered terms with no change; `cost` is added only for display and out-of-pocket.

## Complexity Tracking

> No constitution violations. The only nuance is the SelectionLine dual-value (cost + covered); justified
> because claims and the pool must run on covered while the employee enters and sees cost.
