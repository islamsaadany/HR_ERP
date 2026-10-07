/**
 * Every email the platform sends, by a stable key (2026-10-07).
 *
 * THE ONE LIST. The send functions in `./client.ts` REQUIRE one of these keys, so an email cannot
 * be sent without being on it — which is the point: Admin → Notifications renders this list, and a
 * hand-written list nobody is forced to update is a checklist somebody has to remember (the Payback
 * module shipped without its row in the Modules switch for exactly that reason). Add the key here,
 * then its row in `./catalog.ts`; the type checker refuses the catalog until every key has one.
 *
 * The keys are stored — in `NotificationSettings.disabledEmails` and `EmailLog.kind` — so never
 * rename one. Retire it instead.
 *
 * A plain module with no imports, so the client, the catalog and the settings can all read it
 * without importing each other.
 */
export const EMAIL_KINDS = [
  // Benefits
  "claim.submitted",
  "claim.approved",
  "claim.declined",
  "claim.reopened",
  "claim.reimbursed",
  // Payback
  "payback.submitted",
  "payback.declined",
  "payback.paid",
  // Payments
  "payments.awaiting",
  "payments.reminder",
  "incentive.paid",
  // Time off
  "leave.requested",
  "leave.decided",
  // Holidays
  "holiday.dayReturned",
  "holiday.verify",
  "holiday.announcement",
  // Communications
  "comms.message",
  "comms.nudge",
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number];

export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === "string" && (EMAIL_KINDS as readonly string[]).includes(value);
}
