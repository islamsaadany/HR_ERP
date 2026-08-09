# Quickstart & Validation: Mid-Year Starter Proration

How to prove the feature works end-to-end. Implementation details live in `data-model.md`, `contracts/proration.md`, and (once generated) `tasks.md`.

## Prerequisites

- Migration `prisma/sql/027_plan_year_window.sql` applied (adds the plan-year window + the `prorated` flag; marks Professional development prorated).
- An open plan year with a **start** and **end** date set (e.g. 2026-01-01 → 2026-12-31).
- Test employees with known `startDate`s (see scenarios).
- `npx tsc --noEmit` and `npm run build` green (house rule 3a). SQL validated against a throwaway local Postgres before handing over.

## Validation scenarios

Plan-year window used below: **2026-01-01 → 2026-12-31**. Entry-tier FT pool ceiling = **20,000**; FT Professional-development entry-band amount = **5,000**; annual medical premium (placeholder, self only) = **8,000**.

### S1 — Full (eligible before the year)
- Employee start `2024-06-01` (well past 6 months before the window).
- **Expect**: pool ceiling 20,000; prof-dev 5,000; medical 8,000. No "prorated" indicator.

### S2 — Prorated pool + prof-dev (6-month starter mid-year)
- Employee start `2026-04-01` → 6-month eligibility `2026-10-01` → 3 whole months to year-end → fraction 0.25.
- **Expect**: pool ceiling `round(20000 × 0.25)` = **5,000**; prof-dev `round(5000 × 0.25)` = **1,250**.
- **Then** file a flexible claim whose covered total would exceed 5,000 → **server rejects** (over allowance).
- **Then** a Professional-development proof claim above 1,250 → **server rejects**.
- **Indicator**: Benefits page shows amounts are prorated for a mid-year start.

### S3 — Medical at 3 months, prorated, medical-only view
- Employee start `2026-08-01` → medical eligibility `2026-11-01` → 2 whole months → fraction 2/12; 6-month date `2027-02-01` is after year-end.
- **Expect**: medical **can** be committed; committed premium `round(8000 × 2/12)` = **1,333**. Flexible basket + guaranteed benefits shown as **unlocking at 6 months** (medical-only view). Ceiling lookup uses the **entry 6mo–2y tier** since the employee has no band yet.

### S4 — Not yet eligible
- Employee start `2026-11-01` → 6-month date `2027-05-01` (after year-end); 3-month date `2027-02-01` (after year-end).
- **Expect**: no flexible pool, no prof-dev, **and** medical not yet available for 2026.

### S5 — Event/season gifts unaffected
- Any mid-year starter from S2/S3.
- **Expect**: Marriage, Summer, Special events, Loans display at **full** band amounts; a Summer-allowance release records the full seasonal amount.

### S6 — Next plan year is full
- Advance S2's employee into plan year 2027 (window 2027-01-01 → 2027-12-31); their 6-month date `2026-10-01` precedes the 2027 start.
- **Expect**: pool 20,000, prof-dev 5,000, medical 8,000 — full, no proration.

### S7 — Fallbacks (fail safe)
- **No window**: clear the plan-year dates → every employee shows **full** amounts and an **admin warning** appears that dates are missing.
- **No employee start date**: an employee with null `startDate` is treated per their assigned band, **un-prorated**, and is not blocked; HR is flagged to set the date.

## Server-authority check (must pass)

For S2/S3, bypass the UI and post the claim/commit directly (e.g. via the form action) with over-allowance values — the **server** must reject them. The client mirroring is display-only and must never be the thing that enforces the cap.

## UI sign-off gate (before component edits)

Per Constitution II, the **plan-year date inputs** and the **"prorated / unlocks at 6 months" indicators** are new UI and need a mockup + approval; the **medical-only view** mockup is already approved. Snapshot each edited `.tsx` to `ui-versions/` first.
