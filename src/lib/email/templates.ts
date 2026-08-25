import { appBaseUrl } from "@/lib/email/client";

// Plain, transactional claim-workflow emails (spec 020). Each returns { subject, html };
// the caller supplies the recipient (HR inbox / Finance inbox / employee). Inline
// styles only (email clients ignore <style>), light navy/gold.

const NAVY = "#0f2444";
// gold-500, not gold-600. MEASURED 2026-08-24: #a8821e on navy-800 #0f2444 is 4.33:1, below the
// 4.5:1 AA requires for text under 18px — and the eyebrow below is 12px. #c9a227 is 6.40:1.
// (spec 039 FR-042. The same trap is why the new Communications header puts the accent in a BAR,
// which is a fill and has no ratio to meet, rather than in type.)
const GOLD = "#c9a227";
const INK = "#16202e";
const MUTED = "#5f6472";
const LINE = "#e7e3da";
const PAPER = "#f5f3ee";

import { formatEGP as egp } from "@/lib/labels";
const link = (path: string) => `${appBaseUrl}${path}`;

/**
 * The house email shell.
 *
 * `eyebrow` and `footer` are overridable because this shell was written for the benefit-claim
 * workflow and its defaults say so. A team announcement is a human message from HR, not a
 * benefits notification and not automated — it passes its own eyebrow and no footer at all.
 */
function layout(
  heading: string,
  bodyHtml: string,
  cta?: { href: string; label: string },
  opts?: { eyebrow?: string; footer?: string | null }
): string {
  // Only render the CTA when it's an absolute URL — a relative link breaks in mail clients.
  const showButton = cta && /^https?:\/\//.test(cta.href);
  const button = showButton
    ? `<div style="padding-top:16px;"><a href="${cta!.href}" style="background:${NAVY};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;display:inline-block;">${cta!.label}</a></div>`
    : "";
  return `
  <div style="background:${PAPER};padding:28px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fefdfb;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
      <tr><td style="background:${NAVY};padding:16px 24px;">
        <span style="color:${GOLD};font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;">${opts?.eyebrow ?? "Forefront People · Benefits"}</span>
      </td></tr>
      <tr><td style="padding:24px;">
        <h1 style="margin:0 0 14px;font-size:19px;color:${INK};">${heading}</h1>
        ${bodyHtml}
        ${button}
      </td></tr>
      ${
        opts?.footer === null
          ? ""
          : `<tr><td style="padding:14px 24px;border-top:1px solid ${LINE};color:${MUTED};font-size:11px;">${
              opts?.footer ?? "Automated notification from the Forefront People benefits workflow."
            }</td></tr>`
      }
    </table>
  </div>`;
}

// One detail line: "Label: value" — renders reliably in every mail client.
const row = (label: string, value: string) =>
  `<p style="margin:0 0 7px;font-size:14px;line-height:1.5;color:${INK};"><span style="color:${MUTED};">${label}:</span> <strong>${value}</strong></p>`;
const para = (text: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:${INK};">${text}</p>`;

/** T1 — new claim submitted → HR inbox. */
export function claimSubmittedToHR(d: {
  employeeName: string;
  benefitName: string;
  amountClaimed: number;
  coveredAmount: number;
}) {
  return {
    subject: `New benefit claim to review — ${d.employeeName}`,
    html: layout(
      "A new claim is awaiting your review",
      para("An employee submitted a flexible benefit claim. Review it to approve or reject.") +
        row("Employee", d.employeeName) +
        row("Benefit", d.benefitName) +
        row("Amount claimed", egp(d.amountClaimed)) +
        row("Covered amount", egp(d.coveredAmount)),
      { href: link("/admin/benefits"), label: "Review claim" }
    ),
  };
}

/** T2 — claim approved → Finance inbox. */
export function claimApprovedToFinance(d: {
  employeeName: string;
  benefitName: string;
  coveredAmount: number;
}) {
  return {
    subject: `Approved claim — release payment to ${d.employeeName}`,
    html: layout(
      "A claim is approved — please release payment",
      para("HR approved this claim. Transfer the covered amount, then confirm it in the payments queue.") +
        row("Payee", d.employeeName) +
        row("Benefit", d.benefitName) +
        row("Amount to transfer", egp(d.coveredAmount)),
      { href: link("/finance"), label: "Open payments queue" }
    ),
  };
}

/** T3 — claim rejected → employee. */
export function claimRejectedToEmployee(d: {
  benefitName: string;
  reason?: string | null;
}) {
  return {
    subject: `Your benefit claim was declined`,
    html: layout(
      "Your benefit claim was declined",
      para(`Your claim for <strong>${d.benefitName}</strong> was reviewed and declined.`) +
        (d.reason ? row("Reason", d.reason) : "") +
        para("If you have questions, please contact HR."),
      { href: link("/benefits"), label: "View my benefits" }
    ),
  };
}

/** T4 — claim reimbursed → employee. */
export function claimReimbursedToEmployee(d: {
  benefitName: string;
  amount: number;
  transferDate: string; // display-formatted
}) {
  return {
    subject: `Your benefit claim has been reimbursed`,
    html: layout(
      "Your claim has been reimbursed",
      para(`Your claim for <strong>${d.benefitName}</strong> has been paid.`) +
        row("Amount reimbursed", egp(d.amount)) +
        row("Transfer date", d.transferDate),
      { href: link("/benefits"), label: "View my benefits" }
    ),
  };
}

/**
 * T5 — a rejected claim is reopened by a Super User → employee.
 *
 * The employee already received the "declined" email (T3), so overturning that decision
 * silently would leave them holding a message that is no longer true. This is the correction:
 * it says the decline no longer stands and the claim is back under review — deliberately NOT
 * promising an approval, because it returns to the normal queue and is decided there.
 */
export function claimReopenedToEmployee(d: {
  benefitName: string;
  reason?: string | null;
}) {
  return {
    subject: `Your benefit claim is being reviewed again`,
    html: layout(
      "Good news — your claim is back under review",
      para(
        `The decision to decline your claim for <strong>${d.benefitName}</strong> has been reversed. ` +
          `It is back with HR to be reviewed again — please ignore the earlier decline email.`
      ) +
        (d.reason ? row("Why it was reopened", d.reason) : "") +
        para("You'll hear from us once it has been reviewed. No action is needed from you."),
      { href: link("/benefits"), label: "View my benefits" }
    ),
  };
}

// ── Official holidays (spec 037) ───────────────────────────────────────────

/**
 * H1 — a date change turned someone's booked day off into an official holiday.
 *
 * Their taken count corrects itself (counting is always live), but nobody would have told
 * them, and a returned day is worth knowing about before they plan around it. Deliberately
 * short and good-news: no action is required and their request is untouched.
 */
export function holidayDayReturned(d: {
  employeeName?: string | null;
  holidayName: string;
  /** Display-formatted (dd/mm/yyyy) days of theirs that became holidays. */
  days: string[];
}) {
  const list = d.days.join(", ");
  const plural = d.days.length === 1 ? "day" : "days";
  return {
    subject: `Good news — your time off on ${d.days[0]} is now a public holiday`,
    html: layout(
      "You got a day back",
      para(`${d.employeeName ? `Hi ${d.employeeName.split(" ")[0]},` : "Hi,"}`) +
        para(
          `<strong>${d.holidayName}</strong> now falls on ${list}, which you had already booked as ` +
            `time off. That ${plural} no longer counts against your days taken — you have it back.`
        ) +
        para("Your request stays exactly as it is; there's nothing for you to do."),
      { href: link("/time-off"), label: "View my time off" }
    ),
  };
}

/**
 * H2 — the daily check asks HR to confirm a tentative holiday's date.
 *
 * Sent once per holiday per window (the send is stamped on the row), so a date that stays
 * unverified does not nag every morning.
 */
export function holidayVerificationReminder(d: {
  holidayName: string;
  /** Display-formatted dates. */
  announced: string;
  observed: string;
  daysAway: number;
}) {
  return {
    subject: `Confirm the date: ${d.holidayName} is ${d.daysAway} day${d.daysAway === 1 ? "" : "s"} away`,
    html: layout(
      `Is ${d.holidayName} still on this date?`,
      para(
        `<strong>${d.holidayName}</strong> is coming up and its date has not been confirmed yet. ` +
          `Fixed holidays rarely move; moon-dependent ones often do.`
      ) +
        row("Announced", d.announced) +
        row("Currently recorded", d.observed) +
        para(
          "Confirm it, or move it to the day it will actually be observed. Working-day counts " +
            "follow the change straight away, and the team can only be told once the date is settled."
        ),
      { href: link("/admin/time-off/holidays"), label: "Review holidays" }
    ),
  };
}

/**
 * H3 — the team announcement for an upcoming holiday: English, then Arabic.
 *
 * Deterministic templates, no model in the loop: HR reviews and edits this text before it
 * goes anywhere, so the draft has to be the same every time and defensible line by line.
 * The tone is the point of the whole feature — it invites rest, travel and family time, and
 * hands the decision to the person ("assuming nothing critical is on your plate") rather
 * than instructing them.
 *
 * The bodies are built as plain text so HR can edit them in a textarea; `renderAnnouncement`
 * below wraps whatever HR finally approved into the house email shell.
 */
export function draftHolidayAnnouncement(d: {
  holidayName: string;
  localName?: string | null;
  /** Display-formatted (dd/mm/yyyy) with weekday, e.g. "Monday 13/04/2026". */
  holidayWhen: string;
  holidayWhenAr: string;
  /** Bridge days, display-formatted; empty when the calendar offers none. */
  bridges: string[];
  bridgesAr: string[];
  /** The whole stretch off if the bridges are taken, and how many days that is. */
  stretch: string | null;
  stretchAr: string | null;
  stretchDays: number;
  isCorrection: boolean;
  /**
   * True when every day of the holiday falls on the Fri/Sat weekend, so it adds no day off.
   * The draft must say so rather than inviting people to "take the break" they don't get —
   * spec 037's honest-calendar rule.
   */
  fallsOnWeekendOnly?: boolean;
}) {
  const arName = d.localName?.trim() || d.holidayName;
  const bridgeCount = d.bridges.length;
  const dayWord = bridgeCount === 1 ? "day" : "days";

  const correctionEn = d.isCorrection
    ? "A correction to what we sent earlier — the dates have changed.\n\n"
    : "";
  const correctionAr = d.isCorrection ? "تصحيح للرسالة اللي بعتناها قبل كده — التواريخ اتغيّرت.\n\n" : "";

  // The calendar sentence changes shape with what the calendar actually offers, so we never
  // promise a bridge that isn't there (spec 037: describe it honestly).
  const calendarEn = d.fallsOnWeekendOnly
    ? `${d.holidayName} falls on ${d.holidayWhen} — our weekend this year, so it doesn't add a day off.`
    : bridgeCount
    ? `${d.holidayName} falls on ${d.holidayWhen}. ${
        bridgeCount === 1 ? `${d.bridges[0]} is the only working day` : `${d.bridges.join(" and ")} are the only working days`
      } standing between it and our weekend — take ${
        bridgeCount === 1 ? "that one day" : "those days"
      } off and you are away ${d.stretch}: ${d.stretchDays} days for ${bridgeCount} ${dayWord} of leave.`
    : `${d.holidayName} falls on ${d.holidayWhen}${
        d.stretchDays >= 3 ? `, giving us ${d.stretchDays} days off in a row` : ""
      }.`;

  const calendarAr = d.fallsOnWeekendOnly
    ? `${arName} ${d.holidayWhenAr} — يعني في الويك إند نفسه السنة دي، فمش هيزوّد يوم إجازة.`
    : bridgeCount
    ? `${arName} ${d.holidayWhenAr}. و${
        bridgeCount === 1 ? `يوم ${d.bridgesAr[0]} هو يوم الشغل الوحيد` : `${d.bridgesAr.join(" و")} هما يومين الشغل الوحيدين`
      } اللي فاصل بينه وبين الويك إند — خدوه إجازة وتبقى إجازتكم ${d.stretchAr}: ${d.stretchDays} أيام مقابل ${bridgeCount === 1 ? "يوم إجازة واحد" : `${bridgeCount} أيام إجازة`}.`
    : `${arName} ${d.holidayWhenAr}${d.stretchDays >= 3 ? `، يعني ${d.stretchDays} أيام إجازة ورا بعض` : ""}.`;

  const inviteEn = d.fallsOnWeekendOnly
    ? `Not much of a break this time, but the day is still worth marking — rest where you can, ` +
      `and keep an eye out for the next one.`
    : `Please use it. Rest properly, travel if you have been meaning to, spend the time with your ` +
      `family, and come back with your energy restored. You know your own commitments best — if ` +
      `nothing critical or urgent is sitting on your plate, take the break. The work will still be here.`;

  const bodyEn =
    `${correctionEn}Hi everyone,\n\n` + `${calendarEn}\n\n` + `${inviteEn}\n\n` + `Happy ${d.holidayName}.`;

  const inviteAr = d.fallsOnWeekendOnly
    ? `مش إجازة طويلة المرة دي، بس المناسبة تستاهل — ارتاحوا قد ما تقدروا، ` +
      `والإجازة الجاية قريبة.`
    : `استغلّوها بجد: ارتاحوا صح، وسافروا لو ناويين، واقضوا وقت مع أهلكم، وارجعوا ` +
      `وانتم مليانين طاقة. انتوا أعرف بظروف شغلكم — لو مفيش حاجة مستعجلة أو حرجة، ` +
      `خدوا إجازتكم؛ الشغل هيفضل مستنيكم.`;

  const bodyAr =
    `${correctionAr}يا جماعة،\n\n` + `${calendarAr}\n\n` + `${inviteAr}\n\n` + `كل سنة وانتوا طيبين.`;

  const subject = d.isCorrection
    ? `Correction: ${d.holidayName} — new dates`
    : bridgeCount
      ? `${d.holidayName} is coming — and there's a bridge worth taking`
      : `${d.holidayName} is coming`;

  return { subject, bodyEn, bodyAr };
}

/**
 * Bold every dd/mm/yyyy date, and stop mail clients turning it into a blue link.
 *
 * Gmail and Apple Mail auto-detect anything date-shaped and linkify it, which made the one
 * fact people actually scan for look like a hyperlink to nowhere. A zero-width space inside
 * the year defeats the pattern matcher while leaving the text visually identical — the date
 * still reads, and still copies, as 27/08/2026.
 */
const DATE_RE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
const emphasiseDates = (html: string) =>
  html.replace(DATE_RE, (_m, d, mo, y) => `<strong>${d}/${mo}/&#8203;${y}</strong>`);

/** Turn plain-text paragraphs into the email shell's paragraph markup. */
const paragraphs = (text: string, rtl = false) =>
  text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:${INK};${
          rtl ? "direction:rtl;text-align:right;" : ""
        }">${emphasiseDates(escapeHtml(block)).replace(/\n/g, "<br>")}</p>`
    )
    .join("");

/** Escape anything HR typed — the draft is editable, so it is untrusted markup. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Which script(s) the team receives. */
export type AnnouncementLanguage = "en" | "ar" | "both";

/**
 * Render the announcement HR approved into the house email shell.
 *
 * HR chooses the script per send: English only, Arabic only, or both in one message
 * (English first, then the Arabic block right-to-left under a divider). Everything HR typed
 * is escaped — the draft is editable, so it is untrusted markup.
 */
export function renderHolidayAnnouncement(d: {
  subject: string;
  bodyEn: string;
  bodyAr: string;
  language: AnnouncementLanguage;
  /** yyyy-mm-dd range for the prefilled request, when there is a bridge to suggest. */
  suggested: { startISO: string; endISO: string; label: string; labelAr: string } | null;
}) {
  const href = d.suggested
    ? link(`/time-off?start=${d.suggested.startISO}&end=${d.suggested.endISO}`)
    : "";
  const button = (label: string, rtl: boolean) =>
    `<p style="margin:0 0 6px;${rtl ? "direction:rtl;text-align:right;" : ""}"><a href="${href}" style="background:${NAVY};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;display:inline-block;">${label}</a></p>`;

  const showEn = d.language === "en" || d.language === "both";
  const showAr = d.language === "ar" || d.language === "both";

  const enBlock = showEn
    ? paragraphs(d.bodyEn) +
      (d.suggested
        ? button(`Request ${d.suggested.label} off →`, false) +
          `<p style="margin:0 0 4px;font-size:12px;color:${MUTED};">Goes to your manager like any other request.</p>`
        : "")
    : "";

  const arInner =
    paragraphs(d.bodyAr, true) +
    (d.suggested
      ? button(`اطلب إجازة ${d.suggested.labelAr} ←`, true) +
        `<p style="margin:0;direction:rtl;text-align:right;font-size:12px;color:${MUTED};">الطلب بيروح لمديرك زي أي طلب إجازة.</p>`
      : "");

  // The divider only earns its place when both scripts are in the same message.
  const arBlock = showAr
    ? d.language === "both"
      ? `<div style="border-top:1px solid ${LINE};margin-top:18px;padding-top:14px;">${arInner}</div>`
      : arInner
    : "";

  // Not "· Benefits", and no automated-notification footer: a person wrote this and a person
  // pressed send, so nothing in the frame should claim otherwise.
  return {
    subject: d.subject,
    html: layout(escapeHtml(d.subject), enBlock + arBlock, undefined, {
      eyebrow: "Forefront People",
      footer: null,
    }),
  };
}

// ─── Payback requests (spec 040) ───────────────────────────────────────────
//
// The THIRD email workflow. Email in this product was limited to benefit claims (spec 020) and
// the holiday workflow (spec 037); the CEO asked for this one on 2026-08-24 and the constitution
// was amended to match. Amounts arrive pre-formatted here because petty cash money is
// two-decimal EGP (`formatEGP2`), not the whole-EGP `egp()` the benefits templates use.

/** P1 — payback request submitted → Finance inbox. */
export function paybackSubmittedToFinance(d: {
  requesterName: string;
  amount: string;
  datePaid: string;
  description: string;
}) {
  return {
    subject: `Payback request to review — ${d.requesterName}`,
    html: layout(
      "Someone is out of pocket",
      para("An employee paid for something themselves and has sent the receipt. Review it to approve or decline.") +
        row("Who", d.requesterName) +
        row("Amount", d.amount) +
        row("Paid on", d.datePaid) +
        row("What for", d.description),
      { href: link("/finance"), label: "Review the request" }
    ),
  };
}

/** P2 — payback request declined → the requester. */
export function paybackRejectedToEmployee(d: { amount: string; description: string; reason: string }) {
  return {
    subject: "Your payback request was declined",
    html: layout(
      "Your payback request was declined",
      para(`Your request for <strong>${d.amount}</strong> (${d.description}) was reviewed and declined.`) +
        row("Reason", d.reason) +
        para("If that isn't right, reply to Finance and they'll take another look."),
      { href: link("/payback"), label: "View my requests" }
    ),
  };
}

/** P3 — payback paid → the requester. */
export function paybackPaidToEmployee(d: { amount: string; transferDate: string; description: string }) {
  return {
    subject: `You've been paid back — ${d.amount}`,
    html: layout(
      "Your money is on its way back",
      para(`Finance has transferred your payback for <strong>${d.description}</strong>.`) +
        row("Amount transferred", d.amount) +
        row("Transferred on", d.transferDate),
      { href: link("/payback"), label: "View my requests" }
    ),
  };
}

// ─── Bank confirmations (spec 041) ─────────────────────────────────────────
//
// SC-007: no payee name and no individual amount may appear in either of these. The CEO's
// choice, and the right default — an emailed list of who was paid what lives in an inbox
// forever and gets forwarded by accident. The detail is one tap away, behind the same sign-in
// as everything else. `summary` comes from `describeBatch`, which takes counts and a total and
// has nowhere to put a name.

/** C1 — transactions submitted → every appointed confirmer. */
export function transactionsAwaitingConfirmation(d: {
  summary: string;
  reference: string;
  count: number;
  total: string;
  submittedBy: string;
  valueDate: string;
  /** Whose account these leave from (2026-08-25). Named in the subject: somebody who confirms for
   *  two units needs to know which one this is before opening anything. */
  businessUnit: string;
}) {
  return {
    subject: `${d.businessUnit}: ${d.count} ${d.count === 1 ? "transaction is" : "transactions are"} waiting for your confirmation`,
    html: layout(
      d.summary,
      para(
        `${d.submittedBy} has created these in ${d.businessUnit}'s bank account and submitted them ` +
          `for confirmation.`
      ) +
        row("Business unit", d.businessUnit) +
        row("Reference", d.reference) +
        row("Transactions", String(d.count)) +
        row("Total", d.total) +
        row("Value date", d.valueDate),
      { href: link("/confirmations"), label: "See the transactions" }
    ),
  };
}

/** C2 — the daily nudge, when something has been waiting. Confirmers only, never employees. */
export function confirmationReminder(d: {
  count: number;
  total: string;
  oldestDays: number;
  /** The units this person is being nudged about — they may hold several (2026-08-25). */
  businessUnits: string[];
}) {
  const units = d.businessUnits.length ? d.businessUnits.join(", ") : "your business units";
  return {
    subject: `${d.count} still waiting for your confirmation`,
    html: layout(
      "Still waiting for you",
      para(
        `${d.count === 1 ? "One set of transactions has" : `${d.count} sets of transactions have`} been waiting ` +
          `${d.oldestDays === 1 ? "since yesterday" : `up to ${d.oldestDays} days`}. Until they are confirmed at the bank, ` +
          `nobody in them has been paid.`
      ) +
        row("Business unit", units) +
        row("Combined total", d.total),
      { href: link("/confirmations"), label: "Open confirmations" }
    ),
  };
}
