# Contract: `commitMedical` (server action)

Employee commits their medical election once per plan year. Server-authoritative.

## Input

```ts
{
  spouse: boolean;
  childrenUnder18: number;   // coerced to integer ≥ 0
  children18Plus: number;    // coerced to integer ≥ 0
}
```

(Plan year and user are resolved server-side from session + active plan year; not client-supplied.)

## Preconditions

- Caller is the authenticated employee (`requireUser`).
- An OPEN plan year exists; else → `{ ok:false, error:"Benefits selection isn't open right now." }`.
- Employee has `employmentType` + `tenureBand` (→ a `PoolCeiling`); else → contact-HR error.
- No existing `MedicalCommitment` for (user, planYear); if one exists → `{ ok:false, error:"Medical is already committed. Contact HR to change it." }` (employee cannot self-edit).

## Behavior

1. Compute `premium = computeMedicalPremium(rateCard, cfg)`.
2. If `premium > ceiling` → cap the recorded premium at `ceiling` and return a warning `"Your medical premium exceeds your pool — contact HR."` (per FR-013). *(Block-vs-cap confirmed at UI sign-off; default = cap + warn.)*
3. Create `MedicalCommitment{ userId, planYearId, spouse, childrenUnder18, children18Plus, premium: min(premium, ceiling), committedById: null }`.
4. `revalidatePath('/benefits')` and `/dashboard`.

## Output

```ts
{ ok: true; premium: number; warnings: string[] }
| { ok: false; error: string }
```

## Notes

- Idempotency: second commit attempt is rejected (row already exists) — not silently overwritten.
- HR override (edit/remove) is a **separate admin action**, not this one (see admin/benefits actions).
