"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFinance } from "@/lib/roles";
import { formatDate } from "@/lib/labels";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { sendEmail } from "@/lib/email/client";
import { claimReimbursedToEmployee } from "@/lib/email/templates";

const q = (s: string) => encodeURIComponent(s);

/**
 * Finance confirms a transfer for an APPROVED claim → REIMBURSED, records the
 * amount + date + actor, and emails the employee. Guarded to Finance/Super User.
 */
export async function confirmPayment(formData: FormData): Promise<void> {
  const actor = await requireFinance();
  const id = formData.get("id") as string;
  if (!id) return;

  const amount = parseInt(((formData.get("amountTransferred") as string | null) ?? "").replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    redirect("/finance?error=" + q("Enter a valid transferred amount."));
  }
  const dateStr = ((formData.get("transferDate") as string | null) ?? "").trim();
  const transferDate = dateStr ? new Date(dateStr) : null;
  if (!transferDate || Number.isNaN(transferDate.getTime())) {
    redirect("/finance?error=" + q("Enter a valid transfer date."));
  }
  // Compare against end-of-today so a same-day transfer is allowed.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (transferDate.getTime() > endOfToday.getTime()) {
    redirect("/finance?error=" + q("The transfer date can't be in the future."));
  }

  const claim = await prisma.benefitClaim.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      guaranteedBenefit: { select: { name: true } },
      catalogItem: { select: { name: true } },
    },
  });
  if (!claim || claim.status !== "APPROVED") {
    redirect("/finance?error=" + q("That claim isn't awaiting payment anymore."));
  }

  await prisma.benefitClaim.update({
    where: { id },
    data: {
      status: "REIMBURSED",
      paidById: actor.id,
      paidAt: new Date(),
      transferDate,
      amountTransferred: amount,
    },
  });

  await sendEmail({
    to: claim.user.email,
    ...claimReimbursedToEmployee({
      benefitName: claim.guaranteedBenefit?.name ?? claim.catalogItem?.name ?? "a benefit",
      amount,
      transferDate: formatDate(transferDate),
    }),
  });

  revalidatePath("/finance");
  revalidatePath("/benefits");
  revalidatePath("/admin/benefits");
  redirect("/finance?paid=" + q(claim.user.name ?? "the employee"));
}
