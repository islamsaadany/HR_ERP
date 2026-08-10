"use server";

import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";

export type ResetBenefitsState =
  | { ok: true; mode: "reset" | "erase"; claims: number; medical: number; filesDeleted: number }
  | { ok: false; error: string }
  | null;

/**
 * Clear an employee's benefits data so HR can re-test from a clean slate (admin only).
 *
 * Deletes ALL of the person's `BenefitClaim` and `MedicalCommitment` rows across every
 * plan year. Profile, role, password, and documents are untouched. Two modes:
 *  - "reset": delete the DB rows only; uploaded proof files stay in Blob storage.
 *  - "erase": also delete each claim's proof file from Blob storage (best-effort).
 *
 * Server-authoritative safety: re-checks admin role and requires the typed confirmation
 * name to match the employee's exact name before anything is removed.
 */
export async function resetBenefits(
  userId: string,
  _prev: ResetBenefitsState,
  formData: FormData
): Promise<ResetBenefitsState> {
  await requireAdmin();

  const mode = formData.get("mode") === "erase" ? "erase" : "reset";
  const confirmName = String(formData.get("confirmName") ?? "").trim();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  if (!user) return { ok: false, error: "Employee not found." };

  // Type-to-confirm gate (mirrors the client guard, enforced again on the server).
  if (confirmName.toLowerCase() !== user.name.trim().toLowerCase()) {
    return { ok: false, error: `Confirmation name doesn't match. Type "${user.name}" exactly.` };
  }

  // Collect proof files up front — we need their URLs before the rows are deleted.
  const claimsWithProof =
    mode === "erase"
      ? await prisma.benefitClaim.findMany({
          where: { userId, proofUrl: { not: null } },
          select: { proofUrl: true },
        })
      : [];

  // Delete the DB rows together so a partial failure doesn't leave a half-cleared state.
  const [claimsDeleted, medicalDeleted] = await prisma.$transaction([
    prisma.benefitClaim.deleteMany({ where: { userId } }),
    prisma.medicalCommitment.deleteMany({ where: { userId } }),
  ]);

  // Full-erase only: remove the uploaded proof files from Blob storage. Best-effort —
  // a storage hiccup must not fail the reset now that the rows are already gone.
  let filesDeleted = 0;
  for (const c of claimsWithProof) {
    if (!c.proofUrl) continue;
    try {
      await del(c.proofUrl);
      filesDeleted++;
    } catch {
      // Orphaned file at worst; the DB rows are already cleared.
    }
  }

  revalidatePath(`/admin/employees/${userId}`);
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");

  return { ok: true, mode, claims: claimsDeleted.count, medical: medicalDeleted.count, filesDeleted };
}
