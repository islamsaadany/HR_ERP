import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { isEmailKind, type EmailKind } from "@/lib/email/kinds";

// Non-secret notification config (spec 020). Secrets (RESEND_API_KEY, EMAIL_FROM)
// live in env, never here. Read is cached per request, like lib/brand.ts.

export type NotificationSettingsData = {
  emailEnabled: boolean;
  hrInbox: string | null;
  financeInbox: string | null;
  fromName: string | null;
  /** Days before a holiday that HR is asked to confirm its date (spec 037 FR-015). */
  verificationLeadDays: number;
  /**
   * The incentive payment message, edited at Admin → Email notifications (FR-006g).
   * NULL per field means "use the built-in wording", which lives in code — so a field
   * left alone keeps tracking the product rather than freezing a copy of it.
   */
  incentiveEmailSubject: string | null;
  incentiveEmailHeading: string | null;
  incentiveEmailBody: string | null;
  incentiveEmailFooter: string | null;
  /** The emails switched off one by one at Admin → Notifications (2026-10-07). */
  disabledEmails: EmailKind[];
};

export const NOTIFICATION_DEFAULTS: NotificationSettingsData = {
  emailEnabled: false,
  hrInbox: null,
  financeInbox: null,
  fromName: null,
  verificationLeadDays: 14,
  incentiveEmailSubject: null,
  incentiveEmailHeading: null,
  incentiveEmailBody: null,
  incentiveEmailFooter: null,
  disabledEmails: [],
};

/** The singleton notification settings, or safe defaults (also when the table doesn't exist yet). */
export const getNotificationSettings = cache(
  async (): Promise<NotificationSettingsData> => {
    try {
      const row = await prisma.notificationSettings.findUnique({
        where: { id: "singleton" },
      });
      if (!row) return NOTIFICATION_DEFAULTS;
      return {
        emailEnabled: row.emailEnabled,
        hrInbox: row.hrInbox,
        financeInbox: row.financeInbox,
        fromName: row.fromName,
        verificationLeadDays: row.verificationLeadDays,
        incentiveEmailSubject: row.incentiveEmailSubject,
        incentiveEmailHeading: row.incentiveEmailHeading,
        incentiveEmailBody: row.incentiveEmailBody,
        incentiveEmailFooter: row.incentiveEmailFooter,
        // A key that is no longer in the list (retired) is ignored rather than trusted.
        disabledEmails: (row.disabledEmails ?? []).filter(isEmailKind),
      };
    } catch {
      // Pre-migration DB (no NotificationSettings table) → inert, never throws.
      return NOTIFICATION_DEFAULTS;
    }
  }
);

/**
 * Is this one email switched on? Its own switch only — the main switch (`emailEnabled`) is asked
 * separately, because the two answer different questions on screen ("is email on at all" and
 * "is THIS email on") and a send needs both.
 */
export function isEmailOn(settings: Pick<NotificationSettingsData, "disabledEmails">, kind: EmailKind): boolean {
  return !settings.disabledEmails.includes(kind);
}

/**
 * How long a submitted payment waits before its confirmers get the morning reminder (spec 041).
 *
 * One derivation, asked by the daily job that sends it and by the Notifications page that
 * describes it — so the sentence "while a payment has waited 2 days or more" cannot drift from
 * what the job actually does. Capped low regardless of the holiday lead: a transfer waiting two
 * weeks is a person waiting two weeks.
 */
export function confirmationReminderLeadDays(settings: Pick<NotificationSettingsData, "verificationLeadDays">): number {
  const leadDays = settings.verificationLeadDays > 0 ? settings.verificationLeadDays : 14;
  return Math.min(leadDays, 2);
}
