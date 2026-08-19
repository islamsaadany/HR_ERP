"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { sendTestEmail } from "@/lib/email/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Result shape consumed by ToastResultForm (green/red toast + silent refresh). */
export type NotifResult = { ok: boolean; error?: string };
const err = (error: string): NotifResult => ({ ok: false, error });

/** Save the NotificationSettings singleton (Super User only). Secrets stay in env. */
export async function updateNotificationSettings(formData: FormData): Promise<NotifResult> {
  await requireSuperUser();

  const emailEnabled = formData.get("emailEnabled") === "on";
  const hrInbox = ((formData.get("hrInbox") as string | null) ?? "").trim();
  const financeInbox = ((formData.get("financeInbox") as string | null) ?? "").trim();
  const fromName = ((formData.get("fromName") as string | null) ?? "").trim();
  const leadRaw = ((formData.get("verificationLeadDays") as string | null) ?? "").trim();

  // Spec 037: how far ahead HR is asked to confirm a tentative holiday's date. Bounded so a
  // typo can't make the reminder useless (0 = the morning of) or perpetual (a whole year).
  const verificationLeadDays = Number(leadRaw);
  if (!Number.isInteger(verificationLeadDays) || verificationLeadDays < 1 || verificationLeadDays > 60) {
    return err("Holiday reminders: enter a whole number of days between 1 and 60.");
  }
  if (hrInbox && !EMAIL_RE.test(hrInbox)) return err("The HR inbox isn't a valid email address.");
  if (financeInbox && !EMAIL_RE.test(financeInbox)) return err("The Finance inbox isn't a valid email address.");
  // Guard: turning notifications on without the inboxes set would silently skip sends.
  if (emailEnabled && (!hrInbox || !financeInbox)) {
    return err("Set both the HR and Finance inboxes before turning notifications on.");
  }

  const data = {
    emailEnabled,
    hrInbox: hrInbox || null,
    financeInbox: financeInbox || null,
    fromName: fromName || null,
    verificationLeadDays,
  };
  await prisma.notificationSettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  revalidatePath("/admin/notifications");
  return { ok: true };
}

/** Send a test email to confirm the Resend key + sender work (Super User only). */
export async function sendTestEmailAction(formData: FormData): Promise<NotifResult> {
  await requireSuperUser();
  const to = ((formData.get("to") as string | null) ?? "").trim();
  if (!EMAIL_RE.test(to)) return err("Enter a valid recipient address.");
  const res = await sendTestEmail(to);
  if (res.ok) return { ok: true };
  return err(res.error ?? "Send failed.");
}
