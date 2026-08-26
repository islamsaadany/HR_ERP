"use server";

import { revalidatePath } from "next/cache";
import { requireIncentiveAccess } from "@/lib/roles";
import { canReleaseForUnit } from "@/lib/finance/unit-heads";
import { loadCycleReport } from "@/lib/incentive/load";
import { isReleasable, payoutLines, KIND_LABEL } from "@/lib/incentive/payouts";
import { releaseIncentivePayouts } from "@/lib/incentive/persist";

/**
 * Releasing a cycle's payments into Finance's queue (spec 009 FR-006g).
 *
 * NOTE FOR ANY FUTURE EDIT: a `"use server"` file may export nothing but async
 * functions, and one stray export breaks EVERY action on the page. Types are fine
 * (they vanish at runtime); a constant or an array is not — put it in a plain module.
 */

export type ReleaseState = { ok: true; message: string } | { ok: false; error: string } | null;

/**
 * Release the ticked lines for ONE business unit.
 *
 * The unit is a parameter rather than something read out of the form: a release becomes
 * one transaction in one bank account, so it may only ever contain one unit's people, and
 * that is enforced here rather than trusted from the screen.
 *
 * Everything the screen showed is recomputed before writing. The screen not offering a
 * line is a courtesy; this is the control.
 */
export async function releasePayments(
  cycleId: string,
  businessUnitId: string,
  _prev: ReleaseState,
  formData: FormData
): Promise<ReleaseState> {
  const viewer = await requireIncentiveAccess();

  if (!(await canReleaseForUnit(viewer.id, businessUnitId))) {
    return { ok: false, error: "You don't release payments for that business unit." };
  }

  const picked = new Set(formData.getAll("line").map(String));
  if (picked.size === 0) return { ok: false, error: "Tick at least one payment to release." };

  const cycle = await loadCycleReport(cycleId);
  if (!cycle) return { ok: false, error: "That cycle no longer exists." };

  const lines = await payoutLines(cycleId, cycle.report);
  const chosen = lines.filter((l) => picked.has(l.key));

  // Anything the screen offered but the server disagrees with is refused BY NAME, rather
  // than quietly dropped: a silent partial release is how somebody ends up thinking a
  // person was paid.
  const refused = chosen.filter((l) => !isReleasable(l) || l.businessUnitId !== businessUnitId);
  if (refused.length > 0) {
    const first = refused[0];
    return {
      ok: false,
      error:
        refused.length === 1
          ? `${first.personName}'s ${KIND_LABEL[first.kind]} can no longer be released — the cycle has changed since this screen was opened. Reload and try again.`
          : `${refused.length} of the payments you picked can no longer be released — the cycle has changed since this screen was opened. Reload and try again.`,
    };
  }
  if (chosen.length !== picked.size) {
    return { ok: false, error: "Some of those payments no longer exist. Reload and try again." };
  }

  const written = await releaseIncentivePayouts(
    cycleId,
    viewer.id,
    chosen.map((l) => ({
      userId: l.userId!,
      personName: l.personName,
      kind: l.kind,
      amount: l.amount,
      businessUnitId,
    }))
  );

  revalidatePath(`/incentive/${cycleId}`);
  revalidatePath("/finance");

  if (written === 0) {
    return { ok: false, error: "Those payments had already been released — nothing was released twice." };
  }
  const n = `${written} payment${written === 1 ? "" : "s"}`;
  return {
    ok: true,
    message:
      written < chosen.length
        ? `Released ${n}. The rest had already been released by somebody else.`
        : `Released ${n} to Finance. Nobody has been paid yet — that happens when the transaction is confirmed at the bank.`,
  };
}
