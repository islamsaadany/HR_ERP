import { randomUUID } from "crypto";
import { Resend } from "resend";
import type { EmailOutcome } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getNotificationSettings, isEmailOn } from "@/lib/notifications/settings";
import type { EmailKind } from "@/lib/email/kinds";

// Env-gated, fire-and-forget email (spec 020). The whole subsystem is inert unless
// RESEND_API_KEY + EMAIL_FROM are set AND the in-app master toggle is on. A send
// failure is logged but NEVER thrown into the caller, so a claim's state change is
// never rolled back or blocked by email. Dispatch it AFTER the DB write, not inside
// the transaction.

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM;
const resend = apiKey ? new Resend(apiKey) : null;

export type EmailInput = {
  /**
   * Which email this is. Required, so nothing can be sent that is missing from the list at
   * Admin → Notifications — the list is where its switch and its "last sent" live (2026-10-07).
   */
  kind: EmailKind;
  /** Recipient address; an empty/blank value skips the send, and is recorded as having no address. */
  to: string | null | undefined;
  subject: string;
  html: string;
};

// ─── The record of every send (2026-10-07) ──────────────────────────────────────────────────
//
// Written HERE, by the send functions, and never by a caller — so no path can send an email
// without leaving a row, and "she never got the email" is answered on the Notifications page
// rather than in a server log. Only real sends are recorded. A sample or a test is a rehearsal:
// recording it would show an email as live that has never reached anybody it is meant for.

type SendRecord = {
  kind: EmailKind;
  recipient: string | null;
  subject: string;
  outcome: EmailOutcome;
  error?: string | null;
  providerId?: string | null;
  batchId?: string | null;
};

/** Never throws: a record that cannot be written must not undo or block the send it describes. */
async function recordSends(rows: SendRecord[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await prisma.emailLog.createMany({
      data: rows.map((r) => ({
        kind: r.kind,
        recipient: r.recipient,
        subject: r.subject.slice(0, 500),
        outcome: r.outcome,
        error: r.error ? r.error.slice(0, 500) : null,
        providerId: r.providerId ?? null,
        batchId: r.batchId ?? null,
      })),
    });
  } catch (err) {
    // Pre-migration database, or the database itself is down — the send already happened.
    console.error("[email] could not record the send (ignored):", err);
  }
}

const NO_ADDRESS = "There was no address to send it to.";

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
 * Send ONE rehearsal — a sample of a real email, or a test — and REPORT what happened.
 *
 * Unlike `sendEmail` this reports success or failure, so the screen can say it. It IGNORES both
 * switches — the main one and the email's own — because the point of a sample is to check an
 * email before switching it on. It needs only the env secrets. And it is NOT recorded: a sample
 * reaching the operator says nothing about whether the real email reached anybody.
 */
export async function sendRehearsal(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend || !from) {
    return { ok: false, error: "Email isn't configured — set RESEND_API_KEY and EMAIL_FROM in the environment." };
  }
  const recipient = (input.to ?? "").trim();
  if (!recipient) return { ok: false, error: "Enter a recipient address." };
  const settings = await getNotificationSettings();
  const fromHeader = settings.fromName ? `${settings.fromName} <${from}>` : from;
  try {
    const res = await resend.emails.send({
      from: fromHeader,
      to: recipient,
      subject: input.subject,
      html: input.html,
    });
    if (res.error) return { ok: false, error: plainReason(res.error.message) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }
}

/**
 * The mail provider's refusal, in words a person can act on.
 *
 * Only the refusals that actually turn up are translated; anything else is passed through in the
 * provider's own words rather than guessed at, because a wrong explanation sends somebody to fix
 * the wrong thing.
 */
export function plainReason(message: string | null | undefined): string {
  const m = (message ?? "").trim();
  if (!m) return "The mail provider refused it without saying why.";
  if (/invalid\s+`?to`?/i.test(m)) return "the address isn't valid.";
  if (/your own email address/i.test(m)) {
    return "the company's email domain isn't approved yet, so mail only reaches the account owner.";
  }
  if (/domain is not verified/i.test(m)) return "the sending domain isn't approved with the email provider yet.";
  if (/too many requests|rate limit/i.test(m)) return "too many emails at once; the provider asked us to slow down.";
  return m;
}

export async function sendEmail(input: EmailInput): Promise<void> {
  const to = (input.to ?? "").trim();
  const base = { kind: input.kind, recipient: to || null, subject: input.subject };
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
    if (!isEmailOn(settings, input.kind)) {
      console.info(`[email] "${input.kind}" is switched off at Admin → Notifications — skipping:`, input.subject);
      return;
    }
    if (!to) {
      console.warn("[email] no recipient configured — skipping:", input.subject);
      await recordSends([{ ...base, outcome: "NO_ADDRESS", error: NO_ADDRESS }]);
      return;
    }
    const fromHeader = settings.fromName ? `${settings.fromName} <${from}>` : from;
    // Resend does NOT throw when it refuses a message — it RETURNS `{ error }`. This line used
    // to ignore the result, so a refused send left no trace anywhere, not even a log line, and
    // "she never got the email" could not be diagnosed (2026-10-04). Read it, and log BOTH
    // outcomes with the recipient: a missing email must always leave a line saying which.
    const res = await resend.emails.send({ from: fromHeader, to, subject: input.subject, html: input.html });
    if (res.error) {
      console.error(
        `[email] REFUSED by Resend — to: ${to} · subject: ${input.subject} · reason: ${res.error.message ?? "unknown"}`
      );
      await recordSends([{ ...base, outcome: "REFUSED", error: plainReason(res.error.message) }]);
      return;
    }
    console.info(`[email] sent — to: ${to} · subject: ${input.subject} · id: ${res.data?.id ?? "?"}`);
    await recordSends([{ ...base, outcome: "SENT", providerId: res.data?.id ?? null }]);
  } catch (err) {
    // Fire-and-forget: swallow so the triggering state change is never affected.
    console.error("[email] send failed (ignored):", err);
    await recordSends([
      { ...base, outcome: "FAILED", error: err instanceof Error ? err.message : "The send failed." },
    ]);
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
  kind: EmailKind;
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
    if (!isEmailOn(settings, input.kind)) {
      console.info(`[email] "${input.kind}" is switched off at Admin → Notifications — skipping bulk:`, input.subject);
      return 0;
    }
    const recipients = Array.from(
      new Set(input.to.map((t) => (t ?? "").trim()).filter((t) => t.length > 0))
    );
    if (recipients.length === 0) {
      console.warn("[email] no recipients — skipping bulk:", input.subject);
      await recordSends([
        { kind: input.kind, recipient: null, subject: input.subject, outcome: "NO_ADDRESS", error: NO_ADDRESS },
      ]);
      return 0;
    }
    const fromHeader = settings.fromName ? `${settings.fromName} <${from}>` : from;
    const CHUNK = 100; // Resend's per-call ceiling
    // Every copy of this one broadcast shares a batch id, so the page can say "to 48 people".
    const batchId = randomUUID();
    let addressed = 0;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const chunk = recipients.slice(i, i + CHUNK);
      const base = (to: string) => ({ kind: input.kind, recipient: to, subject: input.subject, batchId });
      try {
        const batch = chunk.map((to) => ({
          from: fromHeader,
          to,
          subject: input.subject,
          html: input.html,
        }));
        // Same as sendEmail: Resend returns a refusal rather than throwing it, so a refused
        // chunk is logged by name and not counted as reached.
        const res = await resend.batch.send(batch);
        if (res.error) {
          console.error(
            `[email] bulk chunk REFUSED by Resend — ${chunk.length} recipient(s): ${chunk.join(", ")} · subject: ${input.subject} · reason: ${res.error.message ?? "unknown"}`
          );
          const error = plainReason(res.error.message);
          await recordSends(chunk.map((to) => ({ ...base(to), outcome: "REFUSED" as const, error })));
          continue;
        }
        const ids = (res.data?.data ?? []) as Array<{ id?: string }>;
        await recordSends(
          chunk.map((to, j) => ({ ...base(to), outcome: "SENT" as const, providerId: ids[j]?.id ?? null }))
        );
        addressed += chunk.length;
      } catch (err) {
        // One chunk failing must not stop the rest of the company being reached.
        console.error("[email] bulk chunk failed (ignored):", err);
        const error = err instanceof Error ? err.message : "The send failed.";
        await recordSends(chunk.map((to) => ({ ...base(to), outcome: "FAILED" as const, error })));
      }
    }
    console.info(`[email] bulk sent — ${addressed} of ${recipients.length} · subject: ${input.subject}`);
    return addressed;
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
export async function sendBatch(
  messages: BatchMessage[],
  /**
   * Which email this is, so every copy is recorded for Admin → Notifications — or `null` for a
   * test, which is a rehearsal and is never recorded. Required rather than optional so a new
   * broadcast cannot forget to say (2026-10-07).
   */
  kind: EmailKind | null,
): Promise<BatchResult[]> {
  if (messages.length === 0) return [];
  if (!resend || !from) {
    const error = "Email isn't configured — set RESEND_API_KEY and EMAIL_FROM in the environment.";
    return messages.map((m) => ({ ref: m.ref, ok: false as const, error }));
  }

  const settings = await getNotificationSettings();
  const fromHeader = settings.fromName ? `${settings.fromName} <${from}>` : from;
  const results: BatchResult[] = [];
  const batchId = randomUUID();

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

  if (kind) {
    const byRef = new Map(messages.map((m) => [m.ref, m]));
    await recordSends(
      results.map((r) => {
        const m = byRef.get(r.ref);
        return {
          kind,
          recipient: m?.to ?? null,
          subject: m?.subject ?? "",
          batchId,
          ...(r.ok
            ? { outcome: "SENT" as const, providerId: r.providerId }
            : { outcome: "REFUSED" as const, error: plainReason(r.error) }),
        };
      })
    );
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
      // A SENDING-ONLY key is the recommended kind for production, and it is allowed to send but
      // not to list domains. Its refusal mentions "API key" too, so without this it read as "the
      // key is refused" on a key that sends perfectly well (2026-10-07). It tells us nothing
      // about the domain, so it is UNKNOWN — never a verdict either way.
      if (res.error.name === "restricted_api_key" || /restricted/i.test(message)) {
        return {
          state: "UNKNOWN",
          detail:
            "The API key is allowed to send but not to look up domains, so whether the domain is approved can't be checked from here. Check it on the email provider's Domains page.",
        };
      }
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
