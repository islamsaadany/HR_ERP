"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { sendRehearsal } from "@/lib/email/client";
import { sampleOf } from "@/lib/email/catalog";
import { isEmailKind } from "@/lib/email/kinds";
import { groupName } from "@/lib/comms/settings";
import { getNotificationSettings } from "@/lib/notifications/settings";
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

/**
 * Switch ONE email on or off (2026-10-07). Saves the moment the box is ticked — the page shows
 * "Saved" on that row and refreshes in place; nothing else on the page moves.
 *
 * Written as an atomic array update rather than read-modify-write, so two people ticking two
 * different rows at the same moment cannot undo each other.
 */
export async function setEmailSwitch(kind: string, on: boolean): Promise<NotifResult> {
  await requireSuperUser();
  if (!isEmailKind(kind)) return err("That email isn't on the list any more. Refresh the page.");

  await prisma.notificationSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  if (on) {
    await prisma.$executeRaw`
      UPDATE "NotificationSettings"
         SET "disabledEmails" = array_remove("disabledEmails", ${kind}::text), "updatedAt" = NOW()
       WHERE "id" = 'singleton'`;
  } else {
    await prisma.$executeRaw`
      UPDATE "NotificationSettings"
         SET "disabledEmails" = array_append(array_remove("disabledEmails", ${kind}::text), ${kind}::text),
             "updatedAt" = NOW()
       WHERE "id" = 'singleton'`;
  }

  revalidatePath("/admin/notifications");
  return { ok: true };
}

/**
 * Send a SAMPLE of one email: the real template, made-up details, "SAMPLE" in the subject.
 *
 * Goes even when that email (or email altogether) is switched off — checking it before switching
 * it on is the point. Needs only the sending setup, and is never recorded as a real send. Super
 * User only, like the test email it replaces: an action that takes an address can mail anyone.
 */
export async function sendSample(kind: string, to: string): Promise<NotifResult> {
  await requireSuperUser();
  if (!isEmailKind(kind)) return err("That email isn't on the list any more. Refresh the page.");
  const address = (to ?? "").trim();
  if (!EMAIL_RE.test(address)) return err("Enter a valid address to send samples to.");

  const [settings, group] = await Promise.all([getNotificationSettings(), groupName()]);
  const { subject, html } = sampleOf(kind, { settings, groupName: group });
  const res = await sendRehearsal({ to: address, subject, html });
  if (res.ok) return { ok: true };
  return err(`Not sent to ${address}: ${res.error ?? "the send failed."}`);
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
