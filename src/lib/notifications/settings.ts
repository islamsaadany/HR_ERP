import { cache } from "react";
import { prisma } from "@/lib/prisma";

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
      };
    } catch {
      // Pre-migration DB (no NotificationSettings table) → inert, never throws.
      return NOTIFICATION_DEFAULTS;
    }
  }
);
