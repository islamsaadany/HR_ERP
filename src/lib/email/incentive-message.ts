/**
 * The incentive payment message — its built-in wording, its placeholders, and the checks
 * that keep an edited version sendable (spec 009 FR-006g, 2026-08-26).
 *
 * The CEO: "for the email structure, please make it editable in the settings." So the
 * WORDS live in `NotificationSettings` and are edited at Admin → Email notifications. The
 * figures do not: what somebody was paid and what it was for is the payment itself, not
 * wording, and a message that could be edited into no longer saying the amount would be
 * worse than no message.
 *
 * The defaults live HERE rather than being seeded into the row. A database copy of the
 * default would silently stop tracking the code the day the default is improved; a NULL
 * column means "whatever the product currently says".
 *
 * Pure — no Prisma, no I/O — so the settings screen, the send path and the checks can all
 * ask the same questions of the same text.
 */

export const INCENTIVE_MESSAGE_DEFAULTS = {
  subject: "Your incentive payment has been transferred — {total}",
  heading: "Your incentive payment has been transferred",
  body:
    "Hello {first name},\n\n" +
    "Your incentive for {cycle} has been transferred to your account. " +
    "It may take a little time to appear, depending on your bank.",
  footer: "If anything here doesn't look right, reply to this message or speak to Finance.",
} as const;

/** The only words in braces that mean anything. Anything else is a typo, and is refused. */
export const INCENTIVE_PLACEHOLDERS = [
  "{first name}",
  "{full name}",
  "{cycle}",
  "{total}",
  "{transfer date}",
  "{business unit}",
] as const;

export type IncentiveMessage = { subject: string; heading: string; body: string; footer: string };

/** Stored text falls back to the built-in wording field by field, so a half-edited row works. */
export function resolveIncentiveMessage(stored: Partial<Record<keyof IncentiveMessage, string | null>>): IncentiveMessage {
  return {
    subject: stored.subject?.trim() || INCENTIVE_MESSAGE_DEFAULTS.subject,
    heading: stored.heading?.trim() || INCENTIVE_MESSAGE_DEFAULTS.heading,
    body: stored.body?.trim() || INCENTIVE_MESSAGE_DEFAULTS.body,
    footer: stored.footer?.trim() || INCENTIVE_MESSAGE_DEFAULTS.footer,
  };
}

export type MessageValues = Record<(typeof INCENTIVE_PLACEHOLDERS)[number], string>;

/** Substitute the six placeholders. Anything else in braces has already been refused on save. */
export function fillMessage(text: string, values: MessageValues): string {
  return INCENTIVE_PLACEHOLDERS.reduce((t, k) => t.split(k).join(values[k]), text);
}

/**
 * Everything wrong with a proposed message, at once.
 *
 * Two things are actually checked, and both earn their keep:
 *  - **An unknown placeholder is refused.** A stray `{Total}` with a capital T substitutes
 *    nothing and reaches somebody's inbox as literal text — visible to the recipient and
 *    to nobody else beforehand.
 *  - **`{total}` must appear somewhere.** A message announcing a payment without saying
 *    how much is not a message worth sending.
 */
export function checkIncentiveMessage(m: IncentiveMessage): string[] {
  const errors: string[] = [];
  const all = `${m.subject}\n${m.heading}\n${m.body}\n${m.footer}`;

  if (!m.subject.trim()) errors.push("The subject can't be empty.");
  if (!m.heading.trim()) errors.push("The heading can't be empty.");
  if (!m.body.trim()) errors.push("The message can't be empty.");

  const known = new Set<string>(INCENTIVE_PLACEHOLDERS);
  const unknown = [...new Set((all.match(/\{[^{}\n]*\}/g) ?? []).filter((t) => !known.has(t)))];
  for (const u of unknown) {
    errors.push(`"${u}" isn't one of the placeholders, so it would be sent as it is written.`);
  }

  if (!all.includes("{total}")) {
    errors.push("Put {total} somewhere — otherwise the message announces a payment without saying how much.");
  }
  return errors;
}
