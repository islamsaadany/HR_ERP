"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { sendTestEmail } from "@/lib/email/client";
import {
  INCENTIVE_MESSAGE_DEFAULTS,
  checkIncentiveMessage,
  resolveIncentiveMessage,
} from "@/lib/email/incentive-message";

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

/**
 * Save the incentive payment message (spec 009 FR-006g, 2026-08-26).
 *
 * Its own action rather than more fields on the settings form above: this is prose with
 * its own rules, and a bad placeholder should not be able to block somebody changing the
 * Finance inbox.
 *
 * Storing the DEFAULT text is deliberately avoided — a field left at the built-in wording
 * is saved as NULL, so it keeps tracking the code rather than freezing a copy of whatever
 * the default said on the day it was opened.
 */
export async function updateIncentiveMessage(formData: FormData): Promise<NotifResult> {
  await requireSuperUser();

  const text = (k: string) => ((formData.get(k) as string | null) ?? "").trim();
  const proposed = {
    subject: text("incentiveEmailSubject"),
    heading: text("incentiveEmailHeading"),
    body: text("incentiveEmailBody"),
    footer: text("incentiveEmailFooter"),
  };

  const problems = checkIncentiveMessage(resolveIncentiveMessage(proposed));
  if (problems.length > 0) return err(problems.join(" "));

  const orNull = (v: string, fallback: string) => (v === "" || v === fallback ? null : v);

  await prisma.notificationSettings.upsert({
    where: { id: "singleton" },
    update: {
      incentiveEmailSubject: orNull(proposed.subject, INCENTIVE_MESSAGE_DEFAULTS.subject),
      incentiveEmailHeading: orNull(proposed.heading, INCENTIVE_MESSAGE_DEFAULTS.heading),
      incentiveEmailBody: orNull(proposed.body, INCENTIVE_MESSAGE_DEFAULTS.body),
      incentiveEmailFooter: orNull(proposed.footer, INCENTIVE_MESSAGE_DEFAULTS.footer),
    },
    create: {
      id: "singleton",
      incentiveEmailSubject: orNull(proposed.subject, INCENTIVE_MESSAGE_DEFAULTS.subject),
      incentiveEmailHeading: orNull(proposed.heading, INCENTIVE_MESSAGE_DEFAULTS.heading),
      incentiveEmailBody: orNull(proposed.body, INCENTIVE_MESSAGE_DEFAULTS.body),
      incentiveEmailFooter: orNull(proposed.footer, INCENTIVE_MESSAGE_DEFAULTS.footer),
    },
  });

  revalidatePath("/admin/notifications");
  return { ok: true };
}
