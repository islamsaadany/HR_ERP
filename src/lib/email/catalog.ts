import { formatDate, formatEGP2 } from "@/lib/labels";
import { renderMessage } from "@/lib/comms/render";
import { describeBatch } from "@/lib/finance/batches";
import { withWeekday, withWeekdayAr } from "@/lib/timeoff/announcement";
import {
  confirmationReminderLeadDays,
  type NotificationSettingsData,
} from "@/lib/notifications/settings";
import { INCENTIVE_SAMPLE_VALUES, resolveIncentiveMessage } from "./incentive-message";
import { EMAIL_KINDS, type EmailKind } from "./kinds";
import * as T from "./templates";

/**
 * Every email the platform sends, described for the people who run it (2026-10-07).
 *
 * What Admin → Notifications lists: when each email goes, who receives it, where that is decided,
 * and a sample of it. Keyed by `EmailKind`, so the type checker refuses this file until every
 * email in `./kinds.ts` has its row — an email cannot exist without appearing on the page.
 *
 * WHO RECEIVES EACH ONE IS DESCRIBED HERE, NOT DECIDED. The recipients are derived where the email
 * is sent, through the same rules the screens use (the approval queue, the appointed confirmers).
 * This file says so in words and never becomes a second place that decides it.
 *
 * Server-only: it renders the real templates. The page passes plain rows to the browser.
 */

export const EMAIL_AREAS = ["Benefits", "Payback", "Payments", "Time off", "Holidays", "Communications"] as const;
export type EmailArea = (typeof EMAIL_AREAS)[number];

export type EmailRecipient =
  /** One of the two team inboxes typed in at Admin → Notifications. */
  | { type: "inbox"; inbox: "hr" | "finance" }
  /** Somebody the situation decides — the employee, their manager, the appointed confirmer. */
  | { type: "person"; who: string; setIn?: string; setInLink?: { label: string; href: string } };

export type SampleContext = {
  settings: NotificationSettingsData;
  /** The umbrella name above the business unit on Communications emails. */
  groupName: string;
};

export type CatalogEntry = {
  area: EmailArea;
  name: string;
  /** What makes it go. A function because two of them depend on a setting. */
  when: (settings: NotificationSettingsData) => string;
  goesTo: EmailRecipient;
  /** The real template, filled in with made-up details. */
  sample: (ctx: SampleContext) => { subject: string; html: string };
};

// ── Made-up details, shared by every sample so they read as one story ──────────────────────

const PERSON = "Sara Hassan";
const BENEFIT = "Gym membership";
const UNIT = "Forefront Consulting";
const daysFromNow = (n: number) => formatDate(new Date(Date.now() + n * 86_400_000));

const WHO_MOVES_MONEY = { label: "Who moves money", href: "/admin/confirmers" };

export const EMAIL_CATALOG: Record<EmailKind, CatalogEntry> = {
  // ── Benefits ──────────────────────────────────────────────────────────────────────────────
  "claim.submitted": {
    area: "Benefits",
    name: "New claim to review",
    when: () => "An employee submits a claim",
    goesTo: { type: "inbox", inbox: "hr" },
    sample: () =>
      T.claimSubmittedToHR({ employeeName: PERSON, benefitName: BENEFIT, amountClaimed: 3000, coveredAmount: 3000 }),
  },
  "claim.approved": {
    area: "Benefits",
    name: "Approved claim, release payment",
    when: () => "HR approves a claim",
    goesTo: { type: "inbox", inbox: "finance" },
    sample: () => T.claimApprovedToFinance({ employeeName: PERSON, benefitName: BENEFIT, coveredAmount: 3000 }),
  },
  "claim.declined": {
    area: "Benefits",
    name: "Claim declined",
    when: () => "HR declines a claim",
    goesTo: { type: "person", who: "The employee who claimed" },
    sample: () =>
      T.claimRejectedToEmployee({ benefitName: BENEFIT, reason: "The receipt is dated before the plan year started." }),
  },
  "claim.reopened": {
    area: "Benefits",
    name: "Claim being reviewed again",
    when: () => "HR reopens a declined claim",
    goesTo: { type: "person", who: "The employee who claimed" },
    sample: () =>
      T.claimReopenedToEmployee({ benefitName: BENEFIT, reason: "The receipt date was misread; it is inside the plan year." }),
  },
  "claim.reimbursed": {
    area: "Benefits",
    name: "Claim reimbursed",
    when: () => "The bank payment is confirmed",
    goesTo: { type: "person", who: "The employee who claimed" },
    sample: () => T.claimReimbursedToEmployee({ benefitName: BENEFIT, amount: 3000, transferDate: daysFromNow(0) }),
  },

  // ── Payback ───────────────────────────────────────────────────────────────────────────────
  "payback.submitted": {
    area: "Payback",
    name: "Payback request to review",
    when: () => "An employee submits a receipt",
    goesTo: { type: "inbox", inbox: "finance" },
    sample: () =>
      T.paybackSubmittedToFinance({
        requesterName: PERSON,
        amount: formatEGP2(1250),
        datePaid: daysFromNow(-2),
        description: "Taxi to the client's office",
      }),
  },
  "payback.declined": {
    area: "Payback",
    name: "Payback declined",
    when: () => "Finance declines a request",
    goesTo: { type: "person", who: "The employee who asked" },
    sample: () =>
      T.paybackRejectedToEmployee({
        amount: formatEGP2(1250),
        description: "Taxi to the client's office",
        reason: "This was already covered from the petty cash float.",
      }),
  },
  "payback.paid": {
    area: "Payback",
    name: "You’ve been paid back",
    when: () => "The bank payment is confirmed",
    goesTo: { type: "person", who: "The employee who asked" },
    sample: () =>
      T.paybackPaidToEmployee({
        amount: formatEGP2(1250),
        transferDate: daysFromNow(0),
        description: "Taxi to the client's office",
      }),
  },

  // ── Payments ──────────────────────────────────────────────────────────────────────────────
  "payments.awaiting": {
    area: "Payments",
    name: "Waiting for your confirmation",
    when: () => "Finance submits payments for confirmation",
    goesTo: {
      type: "person",
      who: "Whoever is appointed to confirm for that business unit",
      setInLink: WHO_MOVES_MONEY,
    },
    sample: () => {
      const total = formatEGP2(12400);
      return T.transactionsAwaitingConfirmation({
        summary: describeBatch({ type: "EXPENSES", itemCount: 3 }, total),
        reference: "OCT-26-01",
        count: 3,
        total,
        submittedBy: "Finance",
        valueDate: daysFromNow(1),
        businessUnit: UNIT,
      });
    },
  },
  "payments.reminder": {
    area: "Payments",
    name: "Still waiting for your confirmation",
    when: (s) => {
      const days = confirmationReminderLeadDays(s);
      return `Every morning, while a payment has waited ${days} ${days === 1 ? "day" : "days"} or more`;
    },
    goesTo: { type: "person", who: "The same people", setInLink: WHO_MOVES_MONEY },
    sample: () =>
      T.confirmationReminder({ count: 2, total: formatEGP2(12400), oldestDays: 3, businessUnits: [UNIT] }),
  },
  "incentive.paid": {
    area: "Payments",
    name: "Incentive payment",
    when: () => "The bank payment is confirmed",
    goesTo: { type: "person", who: "Each person paid", setIn: "Wording is edited at the bottom of this page" },
    // The operator's OWN wording, so a sample shows what they will actually send.
    sample: ({ settings, groupName }) =>
      T.incentivePaymentToEmployee({
        message: resolveIncentiveMessage({
          subject: settings.incentiveEmailSubject,
          heading: settings.incentiveEmailHeading,
          body: settings.incentiveEmailBody,
          footer: settings.incentiveEmailFooter,
        }),
        values: INCENTIVE_SAMPLE_VALUES,
        amounts: [
          // The editor's preview figures, so the sample and the preview show the same payment.
          { label: "Business Partner Fee", amount: formatEGP2(38880) },
          { label: "Commission", amount: formatEGP2(46250) },
        ],
        total: INCENTIVE_SAMPLE_VALUES["{total}"],
        transferDate: INCENTIVE_SAMPLE_VALUES["{transfer date}"],
        groupName,
        businessUnitName: INCENTIVE_SAMPLE_VALUES["{business unit}"],
      }),
  },

  // ── Time off ──────────────────────────────────────────────────────────────────────────────
  "leave.requested": {
    area: "Time off",
    name: "Time-off request to decide",
    when: () => "Someone requests leave",
    goesTo: {
      type: "person",
      who: "Their manager, or the Super Users if they have none",
      setIn: "Set by “Reports to” on the employee record",
    },
    sample: () =>
      T.leaveRequestedToApprover({
        employeeName: PERSON,
        startDate: daysFromNow(14),
        endDate: daysFromNow(16),
        workingDays: 3,
        note: "A family trip.",
      }),
  },
  "leave.decided": {
    area: "Time off",
    name: "Time-off decided",
    when: () => "A request is approved or declined",
    goesTo: { type: "person", who: "The person who asked" },
    sample: () =>
      T.leaveDecidedToEmployee({
        decision: "APPROVED",
        startDate: daysFromNow(14),
        endDate: daysFromNow(16),
        workingDays: 3,
        deciderName: "Omar Khaled",
        comment: null,
      }),
  },

  // ── Holidays ──────────────────────────────────────────────────────────────────────────────
  "holiday.dayReturned": {
    area: "Holidays",
    name: "Your day off is now a public holiday",
    when: () => "A holiday moves onto someone’s booked leave",
    goesTo: { type: "person", who: "That person" },
    sample: () => T.holidayDayReturned({ employeeName: PERSON, holidayName: "Armed Forces Day", days: [daysFromNow(14)] }),
  },
  "holiday.verify": {
    area: "Holidays",
    name: "Confirm a holiday date",
    when: (s) => `Every morning, for an unconfirmed holiday ${s.verificationLeadDays} ${s.verificationLeadDays === 1 ? "day" : "days"} away`,
    goesTo: { type: "inbox", inbox: "hr" },
    sample: ({ settings }) =>
      T.holidayVerificationReminder({
        holidayName: "Armed Forces Day",
        announced: daysFromNow(settings.verificationLeadDays),
        observed: daysFromNow(settings.verificationLeadDays),
        daysAway: settings.verificationLeadDays,
      }),
  },
  "holiday.announcement": {
    area: "Holidays",
    name: "Holiday announcement",
    when: () => "HR presses Send on the Holidays screen",
    goesTo: { type: "person", who: "Everyone" },
    sample: () => {
      const day = new Date(Date.now() + 14 * 86_400_000);
      const draft = T.draftHolidayAnnouncement({
        holidayName: "Armed Forces Day",
        localName: "عيد القوات المسلحة",
        holidayWhen: withWeekday(day),
        holidayWhenAr: `يوم ${withWeekdayAr(day)}`,
        bridges: [],
        bridgesAr: [],
        stretch: null,
        stretchAr: null,
        stretchDays: 1,
        isCorrection: false,
      });
      return T.renderHolidayAnnouncement({
        subject: draft.subject,
        bodyEn: draft.bodyEn,
        bodyAr: draft.bodyAr,
        language: "both",
        suggested: null,
      });
    },
  },

  // ── Communications ────────────────────────────────────────────────────────────────────────
  "comms.message": {
    area: "Communications",
    name: "Announcements and congratulations",
    when: () => "Someone presses Send in Communications",
    goesTo: { type: "person", who: "The people chosen when sending" },
    sample: ({ groupName }) => {
      const subject = "The office closes early on Thursday";
      const { html } = renderMessage({
        unit: null,
        groupName,
        fallbackLabel: "Announcement",
        subject,
        body:
          "Hi everyone,\n\nThe office will close at 3pm this Thursday for maintenance. " +
          "Please plan any client calls around it.\n\nThank you.",
        cta: null,
        preheader: subject,
      });
      return { subject, html };
    },
  },
  "comms.nudge": {
    area: "Communications",
    name: "Congratulations waiting to be sent",
    when: () => "Every morning, while one is waiting",
    goesTo: { type: "person", who: "The person’s manager, or HR if they have none" },
    sample: () => T.congratulationsWaiting({ waiting: 2 }),
  },
};

/** The list in the order the page shows it — the order of `EMAIL_KINDS`, grouped by area. */
export function catalogInOrder(): { kind: EmailKind; entry: CatalogEntry }[] {
  return EMAIL_KINDS.map((kind) => ({ kind, entry: EMAIL_CATALOG[kind] }));
}

/** Every sample says so in its subject, so nobody mistakes one for the real thing. */
export function sampleOf(kind: EmailKind, ctx: SampleContext): { subject: string; html: string } {
  const { subject, html } = EMAIL_CATALOG[kind].sample(ctx);
  return { subject: `SAMPLE — ${subject}`, html };
}
