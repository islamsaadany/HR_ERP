import { cache } from "react";
import { prisma } from "@/lib/prisma";

// Non-secret notification config (spec 020). Secrets (RESEND_API_KEY, EMAIL_FROM)
// live in env, never here. Read is cached per request, like lib/brand.ts.

export type NotificationSettingsData = {
  emailEnabled: boolean;
  hrInbox: string | null;
  financeInbox: string | null;
  fromName: string | null;
};

export const NOTIFICATION_DEFAULTS: NotificationSettingsData = {
  emailEnabled: false,
  hrInbox: null,
  financeInbox: null,
  fromName: null,
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
      };
    } catch {
      // Pre-migration DB (no NotificationSettings table) → inert, never throws.
      return NOTIFICATION_DEFAULTS;
    }
  }
);
