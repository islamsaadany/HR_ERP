import { appBaseUrl } from "@/lib/email/client";

// Plain, transactional claim-workflow emails (spec 020). Each returns { subject, html };
// the caller supplies the recipient (HR inbox / Finance inbox / employee). Inline
// styles only (email clients ignore <style>), light navy/gold.

const NAVY = "#0f2444";
const GOLD = "#a8821e";
const INK = "#16202e";
const MUTED = "#5f6472";
const LINE = "#e7e3da";
const PAPER = "#f5f3ee";

import { formatEGP as egp } from "@/lib/labels";
const link = (path: string) => `${appBaseUrl}${path}`;

function layout(heading: string, bodyHtml: string, cta?: { href: string; label: string }): string {
  // Only render the CTA when it's an absolute URL — a relative link breaks in mail clients.
  const showButton = cta && /^https?:\/\//.test(cta.href);
  const button = showButton
    ? `<div style="padding-top:16px;"><a href="${cta!.href}" style="background:${NAVY};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;display:inline-block;">${cta!.label}</a></div>`
    : "";
  return `
  <div style="background:${PAPER};padding:28px;font-family:Helvetica,Arial,sans-serif;color:${INK};">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fefdfb;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
      <tr><td style="background:${NAVY};padding:16px 24px;">
        <span style="color:${GOLD};font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;">Forefront People · Benefits</span>
      </td></tr>
      <tr><td style="padding:24px;">
        <h1 style="margin:0 0 14px;font-size:19px;color:${INK};">${heading}</h1>
        ${bodyHtml}
        ${button}
      </td></tr>
      <tr><td style="padding:14px 24px;border-top:1px solid ${LINE};color:${MUTED};font-size:11px;">
        Automated notification from the Forefront People benefits workflow.
      </td></tr>
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
