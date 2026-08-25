import { kickerInk, surfaceFor } from "@/lib/comms/brand";

/**
 * THE email builder (spec 039, research D7 + D8).
 *
 * ONE FUNCTION BUILDS THE HTML. The preview route and every send path call this. A preview drawn
 * any other way — a React component that mirrors the email, say — is a picture of an email nobody
 * will receive: the two drift on the first change, and the drift is invisible until somebody
 * complains about a real message.
 *
 * EMAIL IS NOT THE WEB, and the shape of this file is that sentence:
 *
 *  · TABLES, NOT DIVS. Outlook renders through Word, which has no flexbox, no grid, and no
 *    reliable `max-width` on a block. A table with a fixed width is the only layout every client
 *    agrees on.
 *  · EVERY STYLE INLINE. Gmail strips `<style>` from the head on some clients and keeps it on
 *    others, so a design that depends on it is right half the time.
 *  · COLOURS WRITTEN OUT. `var()` is unsupported in most mail clients — and every colour here
 *    comes from a unit record anyway, so it is interpolated per send.
 *  · NO IMAGE. Unit logos are private blobs behind a sign-in check, and a mail client fetching one
 *    is not signed in; `data:` URIs do not rescue it because Gmail and Outlook block them outright.
 *    So the header is TYPOGRAPHIC. Serving logos publicly is a decision nobody has been asked for.
 *  · `color-scheme: light`. Says the design has a light ground on purpose, so a dark-mode client
 *    does not invert it into something nobody drew.
 *
 * THE IDENTITY, as approved 2026-08-24: the GROUP small above, the UNIT large below, the unit's
 * colour behind both, and a gold hairline under the header that is identical on every email
 * whatever unit sent it. The body is black on white for every unit — brand colours the frame,
 * never the reading.
 */

/** The group's constant thread. The one thing identical across every unit. */
const GROUP_THREAD = "#c9a227";

/** Body ink and furniture — fixed, because the message must read the same for everyone. */
const INK = "#1B2330";
const QUIET = "#6B7686";
const LINE = "#E3E8EF";
const GROUND = "#F4F6FA";

/** What a person with no unit gets: the group's own colour. */
const GROUP_FALLBACK = "#0F2444";

export type RenderUnit = {
  name: string;
  primaryColor: string;
};

export type RenderInput = {
  /** The big line: the recipient's unit. Null when they have none. */
  unit: RenderUnit | null;
  /** The small line above it. Always the group. */
  groupName: string;
  /** Shown in place of the unit name when there is no unit — "Announcement", say. */
  fallbackLabel: string;
  subject: string;
  /** Plain text. Blank lines become paragraphs. */
  body: string;
  cta?: { label: string; href: string } | null;
  /** The closing line — the name of whoever pressed send. */
  signedBy?: string | null;
  /** What a mail list shows beside the subject before anybody opens anything. */
  preheader?: string | null;
};

/** Escaped for markup. A subject and a body are typed by a person and land inside HTML. */
function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A typed message becomes paragraphs.
 *
 * The composer is a textarea, so the line breaks somebody put in are the only structure the
 * message has — and `white-space: pre-line` is not dependable in mail clients, so the breaks are
 * turned into real markup here.
 */
function paragraphs(text: string): string {
  const blocks = String(text ?? "")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks
    .map(
      (b) =>
        `<p style="margin:0 0 14px;font:400 14px/1.6 Helvetica,Arial,sans-serif;color:${INK}">` +
        esc(b).replace(/\n/g, "<br>") +
        `</p>`
    )
    .join("");
}

/** Only an ABSOLUTE link is rendered. A relative one is dead in a mail client — no page to be relative to. */
function isAbsolute(href: string): boolean {
  return /^https?:\/\//i.test(String(href ?? "").trim());
}

/** The plain-text alternative. A message with no text part scores worse with filters and is unreadable in a text-only client. */
function plainText(input: RenderInput): string {
  const who = input.unit ? `${input.unit.name}, part of ${input.groupName}` : input.groupName;
  const lines = [input.subject, "", String(input.body ?? "").trim()];
  if (input.cta && isAbsolute(input.cta.href)) lines.push("", `${input.cta.label}: ${input.cta.href}`);
  if (input.signedBy) lines.push("", `— ${input.signedBy}`);
  lines.push("", who);
  return lines.join("\n");
}

export function renderMessage(input: RenderInput): { html: string; text: string } {
  const brand = input.unit?.primaryColor || GROUP_FALLBACK;
  const surface = surfaceFor(brand);
  const kicker = kickerInk(surface);
  const bigLine = input.unit?.name ?? input.fallbackLabel;

  // The button takes the unit's colour with the SAME derived ink. Never the unit colour as type on
  // white: a colour that works as a fill routinely fails as text, which is the trap this whole
  // module exists to avoid.
  const button =
    input.cta && input.cta.label && isAbsolute(input.cta.href)
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px">` +
        `<tr><td bgcolor="${surface.background}" style="border-radius:6px">` +
        `<a href="${esc(input.cta.href)}" style="display:inline-block;padding:11px 20px;` +
        `font:600 13.5px/1 Helvetica,Arial,sans-serif;color:${surface.ink};text-decoration:none">` +
        `${esc(input.cta.label)}</a></td></tr></table>`
      : "";

  const signature = input.signedBy
    ? `<p style="margin:6px 0 16px;font:400 14px/1.6 Helvetica,Arial,sans-serif;color:${INK}">— ${esc(input.signedBy)}</p>`
    : "";

  const footerLine = input.unit
    ? `${esc(input.unit.name)}, part of ${esc(input.groupName)}`
    : esc(input.groupName);

  const html =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<title>${esc(input.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${GROUND}">` +
    // Hidden, and the one piece of text most people read before deciding to open anything.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(input.preheader ?? input.subject)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND}">` +
    `<tr><td align="center" style="padding:26px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:600px;max-width:100%;background:#FFFFFF;border:1px solid ${LINE};border-radius:10px;overflow:hidden">` +
    // The header: group small above, unit large below, the unit's colour behind both.
    `<tr><td bgcolor="${surface.background}" style="padding:17px 24px">` +
    `<div style="font:700 9.5px/1.4 Helvetica,Arial,sans-serif;color:${kicker};letter-spacing:.18em;text-transform:uppercase">${esc(input.groupName)}</div>` +
    `<div style="font:700 20px/1.25 Helvetica,Arial,sans-serif;color:${surface.ink};padding-top:3px">${esc(bigLine)}</div>` +
    `</td></tr>` +
    // The group's thread. A FILL, so it has no contrast ratio to meet — which is exactly why the
    // accent lives here rather than in type.
    `<tr><td bgcolor="${GROUP_THREAD}" style="font-size:0;line-height:0;height:3px">&nbsp;</td></tr>` +
    `<tr><td style="padding:22px 24px 4px">` +
    `<h1 style="margin:0 0 12px;font:700 19px/1.3 Helvetica,Arial,sans-serif;color:${INK}">${esc(input.subject)}</h1>` +
    paragraphs(input.body) +
    button +
    signature +
    `</td></tr>` +
    `<tr><td style="padding:0 24px"><div style="border-top:1px solid ${LINE}"></div></td></tr>` +
    `<tr><td style="padding:14px 24px 20px">` +
    `<p style="margin:0;font:400 11.5px/1.55 Helvetica,Arial,sans-serif;color:${QUIET}">${footerLine}</p>` +
    `</td></tr>` +
    `</table>` +
    // Nothing below the card. There used to be a second, smaller group name printed on the page
    // background beneath it — the group already appears in the coloured header AND in the footer
    // line inside the card, so a third mention was repetition sitting on its own in grey.
    `</td></tr></table></body></html>`;

  return { html, text: plainText(input) };
}
