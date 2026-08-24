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

// ─── Broadcast sending (spec 039, research D1 + D2) ─────────────────────────────────────────
//
// Everything above this line is the TRANSACTIONAL path: one person, one message, because of
// something they did, fire-and-forget so a claim's state change is never blocked by email.
//
// Everything below is the BROADCAST path, and it is different in the one way that matters: the
// caller has to know what happened. A broadcast that quietly half-failed is worse than one that
// failed loudly, so these REPORT rather than swallow.

/** The most separate messages Resend accepts in one batch request. */
export const BATCH_MAX = 100;

export type BatchMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Whatever the caller needs to match a result back to a row. Not sent anywhere. */
  ref: string;
};

export type BatchResult =
  | { ref: string; ok: true; providerId: string | null }
  | { ref: string; ok: false; error: string };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Send many SEPARATE messages — one per person — reporting per person.
 *
 * NEVER a shared `to` and never BCC. Three things follow from that, and all three are
 * requirements rather than preferences:
 *   · nobody sees anybody else's address;
 *   · each copy can carry its own branding, which is the whole point of the unit design;
 *   · a failure names WHICH person, instead of one verdict for the whole send.
 *
 * That is normally the choice between privacy and 148 HTTP calls — which a serverless function
 * does not have the seconds for, and which would die halfway with no record of where it stopped.
 * Resend's batch endpoint takes up to 100 separate messages in one request, so it is neither.
 *
 * Unlike `sendEmail`, this does NOT consult the master toggle: the caller checks that before it
 * writes any recipient rows, so that a refusal is reported to the operator rather than discovered
 * as silence. It does still require the env secrets, and says so.
 */
export async function sendBatch(messages: BatchMessage[]): Promise<BatchResult[]> {
  if (messages.length === 0) return [];
  if (!resend || !from) {
    const error = "Email isn't configured — set RESEND_API_KEY and EMAIL_FROM in the environment.";
    return messages.map((m) => ({ ref: m.ref, ok: false as const, error }));
  }

  const settings = await getNotificationSettings();
  const fromHeader = settings.fromName ? `${settings.fromName} <${from}>` : from;
  const results: BatchResult[] = [];

  for (const group of chunk(messages, BATCH_MAX)) {
    try {
      const res = await resend.batch.send(
        group.map((m) => ({
          from: fromHeader,
          to: m.to,
          subject: m.subject,
          html: m.html,
          ...(m.text ? { text: m.text } : {}),
        }))
      );

      if (res.error) {
        // The whole chunk was refused. Every message in it failed, and each says why — a chunk
        // failing must not leave 100 rows sitting at PENDING forever with nothing recorded.
        const error = res.error.message ?? "Resend rejected the batch.";
        group.forEach((m) => results.push({ ref: m.ref, ok: false, error }));
        continue;
      }

      // Resend returns ids positionally. Anything without one is reported as failed rather than
      // assumed successful — an unmatched send is exactly the case worth knowing about.
      const data = (res.data?.data ?? []) as Array<{ id?: string }>;
      group.forEach((m, i) => {
        const id = data[i]?.id;
        if (id) results.push({ ref: m.ref, ok: true, providerId: id });
        else results.push({ ref: m.ref, ok: false, error: "Resend accepted the batch but returned no id for this message." });
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Send failed.";
      group.forEach((m) => results.push({ ref: m.ref, ok: false, error }));
    }
  }

  return results;
}

export type Readiness =
  | { state: "READY"; detail: string }
  | { state: "OWNER_ONLY"; detail: string }
  | { state: "KEY_REFUSED"; detail: string }
  | { state: "NOT_CONFIGURED"; detail: string }
  | { state: "UNKNOWN"; detail: string };

/**
 * Whether email will actually reach people — asked of Resend, not assumed.
 *
 * THE TRAP THIS EXISTS FOR: until a sending domain is verified, Resend delivers only to the
 * address the account was opened with. An administrator testing with their own address sees
 * success and concludes it works; the first real broadcast reaches nobody and reports no error.
 *
 * A REFUSED KEY IS NOT A VERDICT ON THE DOMAIN. Saying so is the difference between "your domain
 * is not verified" — which sends somebody to fix DNS for a week — and the truth, which is that
 * nothing about the domain was learned. Resend answers an invalid key with 400, NOT 401, so the
 * message is matched as well as the status.
 *
 * And a network answer we did not get is not a verdict either: UNKNOWN says we could not ask,
 * rather than reporting a domain unverified on no evidence.
 */
export async function deliveryReadiness(): Promise<Readiness> {
  if (!apiKey || !from) {
    return {
      state: "NOT_CONFIGURED",
      detail: "RESEND_API_KEY and EMAIL_FROM are not both set, so nothing can be sent.",
    };
  }
  const domain = from.includes("@") ? from.slice(from.lastIndexOf("@") + 1).toLowerCase() : "";
  if (!domain) {
    return { state: "NOT_CONFIGURED", detail: `EMAIL_FROM (${from}) is not an address.` };
  }

  try {
    const res = await resend!.domains.list();
    if (res.error) {
      const message = res.error.message ?? "";
      if (/api[_ ]?key/i.test(message) || /unauthor/i.test(message)) {
        return {
          state: "KEY_REFUSED",
          detail: "Resend does not accept this API key. That says nothing about the domain.",
        };
      }
      return { state: "UNKNOWN", detail: `Resend answered: ${message || "an error"}.` };
    }

    const list = (res.data?.data ?? []) as Array<{ name?: string; status?: string }>;
    const hit = list.find((d) => String(d.name ?? "").toLowerCase() === domain);
    if (!hit) {
      return {
        state: "OWNER_ONLY",
        detail: `${domain} is not a domain on this Resend account, so mail reaches only the account owner.`,
      };
    }
    if (hit.status === "verified") {
      return { state: "READY", detail: `${domain} is verified — messages reach everyone.` };
    }
    return {
      state: "OWNER_ONLY",
      detail: `${domain} is on the account but not verified (${hit.status ?? "pending"}), so mail reaches only the account owner. Everyone else silently receives nothing.`,
    };
  } catch {
    return { state: "UNKNOWN", detail: "Could not reach Resend just now, so this is unchecked." };
  }
}
