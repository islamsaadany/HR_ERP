import { Resend } from "resend";
import { getNotificationSettings } from "@/lib/notifications/settings";

// Env-gated, fire-and-forget email (spec 020). The whole subsystem is inert unless
// RESEND_API_KEY + EMAIL_FROM are set AND the in-app master toggle is on. A send
// failure is logged but NEVER thrown into the caller, so a claim's state change is
// never rolled back or blocked by email. Dispatch it AFTER the DB write, not inside
// the transaction.

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM;
const resend = apiKey ? new Resend(apiKey) : null;

export type EmailInput = {
  /** Recipient address; an empty/blank value skips the send (no error). */
  to: string | null | undefined;
  subject: string;
  html: string;
};

/** The public app base for links in emails (best-effort; empty → relative links). */
export const appBaseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");

export async function sendEmail(input: EmailInput): Promise<void> {
  try {
    if (!resend || !from) {
      console.info("[email] disabled (no RESEND_API_KEY / EMAIL_FROM) — skipping:", input.subject);
      return;
    }
    const settings = await getNotificationSettings();
    if (!settings.emailEnabled) {
      console.info("[email] disabled via settings — skipping:", input.subject);
      return;
    }
    const to = (input.to ?? "").trim();
    if (!to) {
      console.warn("[email] no recipient configured — skipping:", input.subject);
      return;
    }
    const fromHeader = settings.fromName ? `${settings.fromName} <${from}>` : from;
    await resend.emails.send({ from: fromHeader, to, subject: input.subject, html: input.html });
  } catch (err) {
    // Fire-and-forget: swallow so the triggering state change is never affected.
    console.error("[email] send failed (ignored):", err);
  }
}
