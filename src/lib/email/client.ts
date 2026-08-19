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

/**
 * Absolute base URL for links in emails. Emails have no request context, so a
 * relative link (e.g. "/admin/benefits") would break in a mail client — we must
 * emit a full https URL. Honors an explicit APP_URL / NEXTAUTH_URL / AUTH_URL, and
 * otherwise auto-detects the Vercel deployment URL so it works with no extra config.
 */
export const appBaseUrl = (() => {
  const explicit = process.env.APP_URL || process.env.NEXTAUTH_URL || process.env.AUTH_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "";
})();

/** True when the sending secrets are present (key + from-address). Toggle is separate. */
export function emailConfigured(): boolean {
  return !!(apiKey && from);
}

/** The configured sender address, or null when unset (for the settings status readout). */
export const emailFromAddress = from ?? null;

/**
 * Send a one-off test email. Unlike sendEmail this REPORTS success/failure (so the
 * settings screen can show it) and IGNORES the master toggle — it only needs the
 * env secrets, so an admin can verify delivery before turning notifications on.
 */
export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend || !from) {
    return { ok: false, error: "Email isn't configured — set RESEND_API_KEY and EMAIL_FROM in the environment." };
  }
  const recipient = (to ?? "").trim();
  if (!recipient) return { ok: false, error: "Enter a recipient address." };
  const settings = await getNotificationSettings();
  const fromHeader = settings.fromName ? `${settings.fromName} <${from}>` : from;
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#16202e;padding:24px;">
    <h2 style="margin:0 0 8px;">Test email ✓</h2>
    <p>If you can read this, your Forefront People email sending (Resend) is working.</p>
    <p style="color:#5f6472;font-size:12px;">Sent from ${from}. This is only a test — no action needed.</p>
  </div>`;
  try {
    const res = await resend.emails.send({
      from: fromHeader,
      to: recipient,
      subject: "Test email — Forefront People",
      html,
    });
    if (res.error) return { ok: false, error: res.error.message ?? "Resend rejected the send." };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }
}

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

/**
 * Send ONE message to many people (spec 037 team announcements).
 *
 * Resend's batch endpoint takes at most 100 messages per call, so recipients are chunked;
 * a company of any realistic size is one or two calls. Everything else matches `sendEmail`'s
 * posture exactly — env-gated, master-toggle-gated, and fire-and-forget: a failed send is
 * logged and swallowed so the announcement record (already written) is never rolled back.
 *
 * Returns how many recipients were actually addressed, which the caller records as the
 * announcement's reach. Zero means nothing went out — no configuration, toggle off, or no
 * valid addresses — and is not an error.
 */
export async function sendBulkEmail(input: {
  to: (string | null | undefined)[];
  subject: string;
  html: string;
}): Promise<number> {
  try {
    if (!resend || !from) {
      console.info("[email] disabled (no RESEND_API_KEY / EMAIL_FROM) — skipping bulk:", input.subject);
      return 0;
    }
    const settings = await getNotificationSettings();
    if (!settings.emailEnabled) {
      console.info("[email] disabled via settings — skipping bulk:", input.subject);
      return 0;
    }
    const recipients = Array.from(
      new Set(input.to.map((t) => (t ?? "").trim()).filter((t) => t.length > 0))
    );
    if (recipients.length === 0) {
      console.warn("[email] no recipients — skipping bulk:", input.subject);
      return 0;
    }
    const fromHeader = settings.fromName ? `${settings.fromName} <${from}>` : from;
    const CHUNK = 100; // Resend's per-call ceiling
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const batch = recipients.slice(i, i + CHUNK).map((to) => ({
        from: fromHeader,
        to,
        subject: input.subject,
        html: input.html,
      }));
      await resend.batch.send(batch);
    }
    return recipients.length;
  } catch (err) {
    // Fire-and-forget: a send failure must never undo the state change that triggered it.
    console.error("[email] bulk send failed (ignored):", err);
    return 0;
  }
}

/**
 * Send one email and REPORT what happened, instead of swallowing it.
 *
 * `sendEmail` and `sendBulkEmail` are deliberately silent — a claim or an announcement must
 * never be rolled back because mail failed. But a TEST send has the opposite requirement:
 * its whole purpose is to tell you whether delivery works, so "nothing arrived and nothing
 * was said" is the one useless outcome. This names the blocker — missing key, missing
 * sender, master toggle off, or Resend's own rejection — so the screen can print it.
 */
export async function sendReportedEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY isn't set in the environment." };
  if (!from) return { ok: false, error: "EMAIL_FROM isn't set in the environment." };
  const to = (input.to ?? "").trim();
  if (!to) return { ok: false, error: "No recipient address." };

  const settings = await getNotificationSettings();
  if (!settings.emailEnabled) {
    return {
      ok: false,
      error: "Email notifications are switched off — turn on the master toggle at Admin → Notifications.",
    };
  }
  const fromHeader = settings.fromName ? `${settings.fromName} <${from}>` : from;
  try {
    const res = await resend!.emails.send({
      from: fromHeader,
      to,
      subject: input.subject,
      html: input.html,
    });
    if (res.error) {
      // Resend's own words — usually an unverified sending domain, which no amount of
      // in-app configuration will fix.
      return { ok: false, error: `Resend rejected it: ${res.error.message ?? "unknown error"}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The send failed." };
  }
}
