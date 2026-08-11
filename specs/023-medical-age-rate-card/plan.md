# Implementation Plan: Age-Banded Per-Person Medical Rate Card (Tier 1)

**Branch**: `claude/benefits-basket-proration-zgjww5` (feature dir `specs/023-medical-age-rate-card`) | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/023-medical-age-rate-card/spec.md`

## Summary

Replace the relationship-based medical rate card (`self`/`spouse`/`childUnder18`/`child18Plus`) with an **age-banded, per-person** card. A covered person's annual premium is read from a 12-band Tier-1 table by their age **at the commit date**; the employee's premium is the **sum** over the employee + each covered dependant, prorated for mid-cycle joiners by the existing spec-019 `÷12` rule, then **rounded to whole EGP**. Pricing by age requires DOBs, so the **employee DOB becomes required for medical**, and the **spouse becomes a proper dependant record** (name + DOB) alongside children; the employee picks covered dependants individually. Enforcement stays server-authoritative; the committed premium is snapshotted so it is explainable and immune to later DOB edits. Only **Tier 1** exists; the rate card is modeled as bands with a `tier` column so more tiers slot in later.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 (App Router) + React 19

**Primary Dependencies**: Prisma + PostgreSQL (Neon); Tailwind; existing benefits rule engine (`src/lib/benefits/*`)

**Storage**: PostgreSQL via Prisma. New `MedicalRateBand` table (decimal premiums); `Dependant` gains a kind (child/spouse); `MedicalCommitment` gains a covered-people snapshot. Applied to Neon via a numbered `prisma/sql/0NN_*.sql` file (sessions cannot `db push`).

**Testing**: `npx tsc --noEmit` + `npm run build`; pure-function verification via `tsx` (as used for spec 019); SQL applied to a throwaway local Postgres to confirm the migration + seed.

**Target Platform**: Vercel (server components + server actions)

**Project Type**: Web application (single Next.js app)

**Performance Goals**: N/A (per-request, small data)

**Constraints**: Benefits money is server-authoritative (Constitution III); placeholder figures never shown as final; UI changes need an approved mockup first (Constitution II); decimals in the rate card, whole-EGP committed premium.

**Scale/Scope**: One rate-card table (12 rows), the employee medical setup modal, the admin Amounts rate-card editor, and the medical commit path. No change to flexible claims or the pool/50%-cap engine beyond swapping the medical premium source.

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1.*

- **I. Align Before Building** — PASS. Spec + 4 decisions confirmed with the user (2026-08-11). Implementation will not start until this plan and the UI mockup are approved.
- **II. UI Changes Require Approval** — GATED. The admin rate-card editor and the employee medical setup modal change visibly (band table; DOB-based spouse/child pickers). A navy/gold **mockup must be approved before any component is edited**, and each touched UI file snapshotted to `ui-versions/`. No structural redesign of the medical modal beyond what age-band pricing requires.
- **III. Server-Authoritative Money** — PASS by design. Age→band→premium, the per-person sum, proration, whole-EGP rounding, pool-ceiling cap, and 50%-cap exemption are all computed/enforced server-side at commit; the client preview mirrors for display only. Tier-1 figures are the confirmed source (not placeholders).
- **IV. Spec-Driven & Docs Move With Code** — PASS. This spec drives the work; the four steering docs + this spec update in the same commit(s) as code; a matching `prisma/sql/` file ships with any schema/seed change.
- **V. Engineered Enough** — PASS. Edge cases (missing DOB, over-75, band boundaries, decimals vs integer pool) are enumerated in the spec and handled explicitly; shared pure helpers avoid duplication.

**Result**: No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/023-medical-age-rate-card/
├── plan.md              # This file
├── spec.md              # Feature spec (decisions confirmed)
├── research.md          # Phase 0 — design decisions
├── data-model.md        # Phase 1 — schema + migration shape
├── contracts/
│   └── medical-pricing.md   # Phase 1 — pricing + commit contract
├── quickstart.md        # Phase 1 — validation scenarios
└── checklists/requirements.md
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                     # + MedicalRateBand, Dependant.kind, MedicalCommitment coverage snapshot
└── sql/0NN_medical_age_rate_card.sql # hand-runnable Neon migration + Tier-1 seed

src/
├── lib/benefits/
│   ├── rates.ts (new)                # ageAt(), bandFor(), annualPremiumForPerson(), sumMedicalPremium()
│   ├── rules.ts                      # remove self/spouse/child computeMedicalPremium + MedicalRate/MedicalConfig
│   ├── config.ts                     # getMedicalRate → getMedicalRateBands()
│   └── proration.ts                  # unchanged (reused for the ÷12 medical fraction)
├── app/(app)/benefits/
│   ├── actions.ts                    # commitMedical: age-band sum → prorate → round to EGP; DOB gating; covered-dependant selection
│   └── page.tsx                      # feed bands + covered dependants to the board; require DOB
├── app/(app)/admin/benefits/
│   ├── actions.ts                    # edit rate-card bands
│   └── page.tsx / AdminBenefitsPage  # Amounts tab: 12-band editor (replaces self/spouse/child)
└── components/benefits/
    └── BenefitsBoard.tsx / MedicalModal  # DOB-based spouse (as dependant) + individual child pickers, live per-person breakdown

ui-versions/                          # snapshots of every touched UI file (mandatory)
design-mockups/medical-age-rate-card/ # approved navy/gold mockup(s) before UI edits
```

**Structure Decision**: Single Next.js app; the change is localized to the benefits module (rate lookup + medical commit + two UI surfaces) plus a schema/migration. The pool/50%-cap engine and flexible-claim path are untouched apart from the medical premium source.

## Phasing (delivery)

1. **Data + pure pricing (no UI):** schema (`MedicalRateBand`, `Dependant.kind`, commitment snapshot) + Neon SQL + Tier-1 seed; `rates.ts` pure helpers; `commitMedical` server rewrite. Verified via `tsx` + throwaway Postgres.
2. **UI (mockup-gated):** approved mockup → admin band editor + employee medical modal (spouse-as-dependant + child pickers + live breakdown) → snapshots.
3. **Docs:** spec 023 status, PROJECT_DETAILS, IMPLEMENTATION_PROGRESS, IMPLEMENTATION_PLAN log, and CLAUDE.md medical-rule note — same commit(s).

## Complexity Tracking

No constitution violations; table intentionally omitted.
