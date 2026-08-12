"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";

export type ResetBenefitsState =
  | { ok: true; label: string; claims: number; medical: number }
  | { ok: false; error: string }
  | null;

/**
 * Clear an employee's benefits data so HR can re-test from a clean slate (admin only).
 *
 * Works per benefit line via `target`:
 *  - "all"              → every claim + the medical commitment (gated by the typed name).
 *  - "medical"          → the MedicalCommitment (+ its covered-person snapshot rows).
 *  - "guaranteed:<id>"  → all claims for that guaranteed benefit (any status, any year).
 *  - "catalog:<id>"     → all claims for that flexible catalog benefit.
 *
 * A single line delete is one click; only "all" requires the typed-name confirmation.
 * Uploaded proof files are left in Blob storage (a proof-required claim keeps its file).
 * Server-authoritative: re-checks admin role every call, and the name gate on "all".
 */
export async function resetBenefits(
  userId: string,
  _prev: ResetBenefitsState,
  formData: FormData
): Promise<ResetBenefitsState> {
  await requireAdmin();

  const target = String(formData.get("target") ?? "").trim();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  if (!user) return { ok: false, error: "Employee not found." };

  const bust = () => {
    revalidatePath(`/admin/employees/${userId}`);
    revalidatePath("/admin/benefits");
    revalidatePath("/benefits");
  };
  const medicalIds = async () =>
    (await prisma.medicalCommitment.findMany({ where: { userId }, select: { id: true } })).map((c) => c.id);

  try {
    // Reset all — gated by the typed name.
    if (target === "all") {
      const confirmName = String(formData.get("confirmName") ?? "").trim();
      if (confirmName.toLowerCase() !== user.name.trim().toLowerCase()) {
        return { ok: false, error: `Confirmation name doesn't match. Type "${user.name}" exactly.` };
      }
      const ids = await medicalIds();
      const [, claims, medical] = await prisma.$transaction([
        prisma.medicalCoveredPerson.deleteMany({ where: { commitmentId: { in: ids } } }),
        prisma.benefitClaim.deleteMany({ where: { userId } }),
        prisma.medicalCommitment.deleteMany({ where: { userId } }),
      ]);
      bust();
      return { ok: true, label: "all benefits data", claims: claims.count, medical: medical.count };
    }

    // Medical commitment line.
    if (target === "medical") {
      const ids = await medicalIds();
      const [, medical] = await prisma.$transaction([
        prisma.medicalCoveredPerson.deleteMany({ where: { commitmentId: { in: ids } } }),
        prisma.medicalCommitment.deleteMany({ where: { userId } }),
      ]);
      bust();
      return { ok: true, label: "the medical commitment", claims: 0, medical: medical.count };
    }

    // Per-benefit claim line: "guaranteed:<id>" or "catalog:<id>".
    const sep = target.indexOf(":");
    const kind = sep === -1 ? "" : target.slice(0, sep);
    const benId = sep === -1 ? "" : target.slice(sep + 1);
    if ((kind === "guaranteed" || kind === "catalog") && benId) {
      const where =
        kind === "guaranteed"
          ? { userId, guaranteedBenefitId: benId }
          : { userId, catalogItemId: benId };
      const claims = await prisma.benefitClaim.deleteMany({ where });
      bust();
      return { ok: true, label: "that benefit’s claims", claims: claims.count, medical: 0 };
    }
  } catch (e) {
    return { ok: false, error: `Couldn't reset: ${e instanceof Error ? e.message : String(e)}` };
  }

  return { ok: false, error: "Unknown reset target." };
}
