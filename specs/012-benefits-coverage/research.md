# Research: Benefits — Company Coverage Rates

Decisions were pre-clarified (spec DC-1/2/3 + the 2026-08-07 FT5/PT3 and PT-3 decision). This records
the design choices so tasks/implement have no open unknowns.

## R1 — Where the covered amount lives (storage)

- **Decision**: Keep `SelectionLine.amount` as the **covered (company) pool draw**; add `SelectionLine.cost`
  for the entered full cost. Out-of-pocket is derived (`cost − amount`), not stored.
- **Rationale**: Every downstream consumer already treats `amount` as the allocation (claims cap, tracker,
  CSV export, claimed-locks). Making `amount` the covered value means all of them operate in covered terms
  (FR-C08) with **zero** change. `cost` is additive, only for display + out-of-pocket.
- **Alternatives**: Store cost only and derive covered everywhere (rejected — every reader would need the
  rate + a recompute; error-prone). Store covered only (rejected — can't show the cost/out-of-pocket the
  employee entered, DC-3).

## R2 — Covered amount is always an integer

- **Decision**: `covered = cost × rate / 100`. Cost is coerced to 1,000 steps (DC-2), rate is an integer
  percent, so `covered` is always a whole number (e.g. 9,000 × 80% = 7,200). No re-rounding of covered.
- **Rationale**: DC-2 — the step applies to the cost; covered is exact and may be non-1,000.

## R3 — Single source for the math (no client/server drift)

- **Decision**: `src/lib/benefits/coverage.ts` exports pure `coveredAmount(cost, rate)` and
  `outOfPocket(cost, rate)`; imported by both the server rules/action and the client selector.
- **Rationale**: Constitution III (server-authoritative) + V (DRY). The client mirrors the exact server
  math because it calls the same function; the server remains the boundary that enforces on save/submit.

## R4 — Rules engine on covered

- **Decision**: `evaluateBasket` lines carry `{ key, name, cost, coverageRate }`. It computes covered per
  line, sums covered (+ medical premium) for the pool total, checks over-pool on the covered total, and
  applies the FT 50% cap to each line's **covered** share. `MAX_SELECT_FULL_TIME = 5`,
  `MAX_SELECT_PART_TIME = 3`. Part-time stays exempt from the 50% cap.
- **Rationale**: FR-C02/03/04/05; the confirmed FT5/PT3 limits.

## R5 — Medical unchanged

- **Decision**: Medical stays a single rate-card item at 100% coverage: premium = covered = pool draw;
  cost = premium (no separate cost entry). Cap-exempt, ceiling-capped — as today.
- **Rationale**: FR-C06; deliberate deviation from the concept doc's Personal/Family split.

## R6 — Claims reimburse the covered portion

- **Decision**: A claim proves a **full spend** but reimburses the **covered portion**, capped at the
  benefit's **covered allocation** (= `SelectionLine.amount`). The tracker's allocated/reimbursed/pending/
  left stay in covered terms (already true, since allocation = amount = covered). The claim form wording
  clarifies "we reimburse the covered portion." The claimed-lock (007 FR-036) already compares claimed sum
  vs the line's `amount`, which is now covered — so FR-C10 holds automatically.
- **Rationale**: FR-C08/C10. Minimal behavioral change; mostly wording + the guarantee that `amount` is covered.

## R7 — Coverage-rate seed defaults

- **Decision** (per catalog key): **100%** — `medical`, `checkup`, `coaching`; **80%** — `gym`, `sports`,
  `schooling`, `childcare`, `caregiver`, `learning`; **50%** — `mobile`, `homeoffice`.
- **Rationale**: FR-C01 seeded defaults, mapped to the real seed keys (003/004).

## R8 — Migration + backfill

- **Decision**: `023_benefits_coverage.sql` (idempotent): add `BenefitCatalogItem.coverageRate` (Int, default
  100) and set the 80/50 keys; add `SelectionLine.cost` (Int, default 0) and **backfill `cost = amount`** for
  existing rows. Runner-applied.
- **Rationale**: Pre-012 there was no coverage, so existing allocations were effectively 100%-covered — `cost
  = amount` is the correct historical cost. Default 100 keeps any unseeded item fully covered (safe).

## R9 — Admin coverage-rate editing (this spec) vs. the redesign (spec 016)

- **Decision**: Add a coverage-% field to the **existing** Configuration-tab catalog editor now. The tab
  restructure + Catalogue table + manual claims are **spec 016**, done next.
- **Rationale**: Ships 012 self-contained; avoids over-scoping; spec 012's own assumption already says
  coverage editing "slots into the existing admin Benefits Configuration tab."
