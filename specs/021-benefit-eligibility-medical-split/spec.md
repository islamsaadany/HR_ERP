# Feature Specification: Unified Benefits Catalogue — FT/PT Eligibility & Medical Split

**Feature Branch**: `claude/claiming-card-toast-fix-l1rsrq`

**Created**: 2026-08-10

**Status**: Built

**Input**: User description: "The benefits catalogue already carries the claim requirements — don't repeat them in the amounts screen; the amounts should be numbers only. Bring the guaranteed benefits into the catalogue table and add two columns, FT and PT, to say whether each benefit is eligible for each type — which drives what the employee sees by their type. Split personal medical from family medical: if only personal is eligible (e.g. for a Part-timer), the setup shows just the personal option with no spouse/children; if family is eligible, they appear."

## Overview

Benefits were configured across two disjoint admin surfaces: a **Benefits Catalogue** (flexible, claimed-as-you-go items, no employment-type gating) and, on the **Amounts** tab, the **guaranteed benefits** — stored as *separate rows per employment type* with their names, claim requirements, and per-band figures all mixed together with the money.

This feature unifies the model:

1. **One catalogue.** The admin Catalogue tab lists **every** benefit — guaranteed, flexible, and medical — with a Type chip, its claim requirement, and the new eligibility columns. Guaranteed benefits become **one row per benefit** (not one per employment type).
2. **Amounts = numbers only.** The Amounts tab holds just figures: pool ceilings, guaranteed per-band amounts (kept separate for FT and PT), and the medical rate card. Names, claim requirements, and eligibility live in the Catalogue.
3. **FT / PT eligibility.** Each benefit has a Full-time and a Part-time eligibility flag. An employee only sees benefits their employment type is eligible for. (Flexible items, previously shown to everyone, are now gated too.)
4. **Personal vs Family medical.** Medical is split into two catalogue items — **Personal** (self only) and **Family** (self + spouse + children) — each with its own FT/PT eligibility. The employee's medical setup shows dependant pickers **only** when they are eligible for Family; a Personal-only employee sees self-cover with no spouse/children. An employee eligible for **both** gets a **single** medical section that behaves like Family (dependants optional).

Storage stays split underneath (guaranteed and catalog remain separate Prisma tables — "Option A"); only the admin view is unified, so the server-authoritative money math (pool ceiling, 50% cap, medical premium) is untouched.

## Clarifications

### Session 2026-08-10

- Q: How literally should guaranteed + flexible become "one table"? → A: **Option A** — one unified admin view; the two storage tables stay to keep the live money math untouched.
- Q: For a guaranteed benefit eligible for both FT and PT, can amounts differ by type? → A: **Yes** — separate FT and PT per-band amounts, as today.
- Q: Existing medical commitments at cutover? → A: **Cleared by HR** — no data to preserve; everyone re-commits under the Personal/Family split.
- Q: If an employee is eligible for both Personal and Family? → A: **Single** medical section, behaving like Family (dependants optional; empty = personal).

## Requirements *(mandatory)*

- **FR-021-1** The admin Benefits Catalogue MUST list guaranteed, flexible, and medical benefits in one table with a Type indicator, claim requirement, and FT/PT eligibility checkboxes.
- **FR-021-2** The Amounts tab MUST contain only figures (pool ceilings, guaranteed FT/PT per-band amounts, medical rate card) — no claim-requirement or eligibility controls.
- **FR-021-3** A guaranteed benefit MUST be a single record with `eligibleFullTime` / `eligiblePartTime` flags and per-employment-type band amounts (`ftBand*` / `ptBand*`).
- **FR-021-4** Each catalog item MUST carry `eligibleFullTime` / `eligiblePartTime`; the employee benefits page MUST show only benefits eligible for the viewer's employment type. Enforcement is server-side at claim/commit time, not just in the UI.
- **FR-021-5** Medical MUST exist as two items distinguished by `medicalScope` (`PERSONAL` | `FAMILY`). Dependant pickers appear only when the employee is Family-eligible; committing dependants while Personal-only MUST be rejected server-side.
- **FR-021-6** Amounts and money rules remain server-authoritative and unchanged in value (pool ceiling, 50%-per-benefit cap, medical 100%/cap-exempt).

## Data Model

- `GuaranteedBenefit`: dropped `employmentType` + `band6mo2y..band7to10y`; added `eligibleFullTime`, `eligiblePartTime`, `ftBand6mo2y..ftBand7to10y`, `ptBand6mo2y..ptBand7to10y`. One row per benefit.
- `BenefitCatalogItem`: added `eligibleFullTime`, `eligiblePartTime`, `medicalScope` (`MedicalScope?`).
- New enum `MedicalScope { PERSONAL, FAMILY }`.
- `MedicalCommitment`: **unchanged** (dependants present ⇒ Family; the split is expressed by the catalogue item + eligibility, not a new column).

Migration `prisma/sql/032_benefit_eligibility_and_medical_split.sql` folds each guaranteed benefit's FT/PT sibling rows into one row (repointing any claims/releases), tags the existing medical item as Personal, and adds the Family medical item. Verified on a throwaway Postgres against the full migration chain.

## Follow-up (same feature)

- **Inline-edit catalogue grid.** The admin Catalogue is a client grid (`CatalogueGrid`) mirroring the employee registry: click a cell to edit (name, category, claim requirement, FT/PT, coverage %, status — each saved per-cell via `updateCatalogueCell`), click a header to sort, drag headers to reorder columns (layout persisted to `localStorage`), and the header row + Benefit column are frozen (`ff-data-table`). Coverage is editable for flexible items only; guaranteed shows Fixed/Salary and medical 100% (read-only — amounts on the Amounts tab). Replaces the previous read-view + card-edit toggle.
- **Guaranteed categories.** `GuaranteedBenefit` gained a real `category` (migration `033_guaranteed_benefit_categories.sql`) aligned with the flexible categories — Marriage/Special events → *Life & family*, Professional development → *Personal growth*, plus two new categories *Allowances & bonuses* (Summer allowance) and *Financial support* (Loans). The `note` stays as a short description shown under the name. Fixes the earlier bug where the note was shown as the category.

## Follow-up — availability vs. salary fallback (2026-08-13)

Refines **FR-021-4** (an employee sees / can claim only benefits eligible for their type, enforced server-side). An eligibility flag turns a benefit **on** for a type, but the per-type **band amount** (`ftBand*` / `ptBand*`) can still be **unset** — e.g. **Part-time Summer allowance** (part-timers get no summer/loans) or any figure HR simply hasn't entered.

- **Before (bug):** a null band amount fell back to the employee's **monthly salary** (`amountForBand(...) ?? user.monthlySalary`) in both the employee Benefits page and the server claim path. A part-timer's Summer allowance therefore displayed their **salary** (a wrong figure **and** a salary leak), and the **server would authorize a claim up to that salary** — a real over-claim risk, since benefits money must be server-authoritative and correct.
- **After (fix):** the monthly-salary fallback applies **only** to genuinely **salary-driven** benefits (**Loans** — every band null, `isSalaryDriven` true). For a band-based benefit with no amount set for the viewer's type/tenure, the benefit is **not available**: its card is **omitted** from the Benefits page and the orientation "what you already get" summary, and a claim is **blocked** server-side with "no amount set for you yet — contact HR". This matches what the bulk-release sheet (spec 013) already reported ("no part-time amount set").

Guarded in `src/app/(app)/benefits/page.tsx` (display + orientation) and `src/app/(app)/benefits/claim-actions.ts` (server enforcement). Display + guard only — no schema or money-value change; `npx tsc --noEmit` + `npm run build` clean.
