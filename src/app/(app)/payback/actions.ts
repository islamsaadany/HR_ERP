"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { parseAmountInput, fromPiastres } from "@/lib/finance/money";
import { storeEvidenceFiles, evidenceFilesFrom } from "@/lib/finance/evidence";
import { formatEGP2, formatDate } from "@/lib/labels";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { sendEmail } from "@/lib/email/client";
import { paybackSubmittedToFinance } from "@/lib/email/templates";

/**
 * What the person who paid out of their own pocket can do (spec 040). Reviewing and paying are
 * Finance's, in `app/(app)/finance/payback-actions.ts`.
 */

const q = (s: string) => encodeURIComponent(s);

/** Refuse, and say why. A function declaration with `never` so the checks below narrow. */
function fail(msg: string): never {
  redirect(`/payback?error=${q(msg)}`);
}

export async function submitRequest(formData: FormData): Promise<void> {
  // Asked again here, not just on the page: hiding a nav entry has never been a control, and a
  // form that is already open in a tab still posts after the switch is thrown.
  await requireModuleEnabled("payback");
  // The requester is the session, never the form: a userId in a form field is a userId somebody
  // can change.
  const user = await requireUser();

  const parsed = parseAmountInput(formData.get("amount"));
  if (!parsed.ok) fail(parsed.error);

  const dateStr = ((formData.get("datePaid") as string | null) ?? "").trim();
  const datePaid = dateStr ? new Date(dateStr) : null;
  if (!datePaid || Number.isNaN(datePaid.getTime())) fail("Enter the date you paid.");
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (datePaid.getTime() > endOfToday.getTime()) fail("That date is in the future.");

  const description = ((formData.get("description") as string | null) ?? "").trim();
  if (!description) fail("Say what you paid for.");
  if (description.length > 500) fail("That description is too long — 500 characters at most.");

  const categoryId = ((formData.get("categoryId") as string | null) ?? "").trim() || null;
  if (categoryId) {
    const category = await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.archivedAt) fail("That category is no longer available — pick another.");
  }
  const payee = ((formData.get("payee") as string | null) ?? "").trim().slice(0, 200) || null;

  // Evidence is REQUIRED here, unlike a petty cash line: there is no float and no period
  // reconciliation to catch a missing receipt later, so this is the only chance.
  const stored = await storeEvidenceFiles(evidenceFilesFrom(formData), {
    pathPrefix: `payback/${user.id}`,
    required: true,
  });
  if (!stored.ok) fail(stored.error);

  const request = await prisma.paybackRequest.create({
    data: {
      userId: user.id,
      amount: fromPiastres(parsed.piastres),
      datePaid,
      categoryId,
      description,
      payee,
      evidence: { create: stored.files.map((f) => ({ ...f, uploadedById: user.id })) },
    },
  });

  // After the write, never inside it, and a failure is swallowed: no state change may depend on
  // an email getting through.
  const settings = await getNotificationSettings();
  await sendEmail({
    to: settings.financeInbox,
    ...paybackSubmittedToFinance({
      requesterName: user.name ?? "An employee",
      amount: formatEGP2(fromPiastres(parsed.piastres)),
      datePaid: formatDate(datePaid),
      description,
    }),
  });

  revalidatePath("/payback");
  revalidatePath("/finance");
  redirect(`/payback?ok=${q("Sent to Finance.")}&highlight=${request.id}`);
}

/** Withdraw your own request, while it is still untouched. */
export async function withdrawRequest(formData: FormData): Promise<void> {
  await requireModuleEnabled("payback");
  const user = await requireUser();
  const id = ((formData.get("id") as string | null) ?? "").trim();

  const request = await prisma.paybackRequest.findUnique({
    where: { id },
    select: { userId: true, status: true },
  });
  if (!request) fail("That request no longer exists.");
  if (request.userId !== user.id) fail("That isn't your request.");
  if (request.status !== "SUBMITTED") fail("Finance has already looked at that one.");

  await prisma.paybackRequest.delete({ where: { id } });

  revalidatePath("/payback");
  revalidatePath("/finance");
  redirect(`/payback?ok=${q("Request withdrawn.")}`);
}
