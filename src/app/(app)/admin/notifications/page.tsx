import { requireSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { IncentiveMessageEditor } from "@/components/admin/IncentiveMessageEditor";
import { WhoGetsWhat, type EmailRowData } from "@/components/admin/WhoGetsWhat";
import { resolveIncentiveMessage } from "@/lib/email/incentive-message";
import { getNotificationSettings, isEmailOn } from "@/lib/notifications/settings";
import { deliveryReadiness, emailConfigured, emailFromAddress } from "@/lib/email/client";
import { EMAIL_CATALOG, catalogInOrder } from "@/lib/email/catalog";
import { EMAIL_KINDS, isEmailKind } from "@/lib/email/kinds";
import { lastSendByKind, recentFailures, sendTotals, type LastSend } from "@/lib/email/status";
import { unitsWithConfirmers } from "@/lib/finance/confirmers";
import { formatDateTime } from "@/lib/labels";
import { BackLink } from "@/components/admin/BackLink";
import { ToastResultForm } from "@/components/admin/ToastResultForm";
import { updateNotificationSettings } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Admin → Notifications (2026-10-07, approved mockup
 * `design-mockups/notification-settings/2026-10-07_who-gets-what.html`).
 *
 * Three things, top to bottom: a health check that says in ticks and warnings whether email is
 * actually working; every email the platform sends, with who receives it, when it last went, a
 * switch and a sample; and the settings form as it was. Super User only.
 */

type Check = {
  /** true = working, false = needs attention, null = could not be checked. */
  ok: boolean | null;
  title: string;
  detail: string;
  link?: { label: string; href: string };
};

const dateOf = (d: Date) => formatDateTime(d).split(" · ")[0];
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** "Last sent", in words. A broadcast reads as one send to many people. */
function describeLast(last: LastSend | undefined): EmailRowData["last"] {
  if (!last) return null;
  const when = formatDateTime(last.at);
  if (last.people > 1) {
    if (last.failed === 0) return { tone: "ok", title: when, detail: `to ${people(last.people)}` };
    return {
      tone: "bad",
      title: when,
      detail: `to ${last.people - last.failed} of ${people(last.people)} · ${last.failed} not sent: ${last.error ?? "no reason given"}`,
    };
  }
  switch (last.outcome) {
    case "SENT":
      return { tone: "ok", title: when, detail: `to ${last.recipient ?? "?"}` };
    case "NO_ADDRESS":
      return { tone: "bad", title: `Not sent ${when}`, detail: last.error ?? "There was no address to send it to." };
    case "REFUSED":
      return { tone: "bad", title: `Refused ${when}`, detail: `to ${last.recipient ?? "?"}: ${last.error ?? "no reason given"}` };
    default:
      return { tone: "bad", title: `Failed ${when}`, detail: `to ${last.recipient ?? "?"}: ${last.error ?? "no reason given"}` };
  }
}

export default async function AdminNotificationsPage() {
  const actor = await requireSuperUser();
  const [settings, readiness, lastByKind, totals, failures, units, covered] = await Promise.all([
    getNotificationSettings(),
    deliveryReadiness(),
    lastSendByKind(),
    sendTotals(30),
    recentFailures(7),
    prisma.businessUnit.findMany({ select: { id: true, name: true }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
    unitsWithConfirmers(),
  ]);
  const configured = emailConfigured();
  const domain = emailFromAddress?.includes("@") ? emailFromAddress.slice(emailFromAddress.lastIndexOf("@") + 1) : null;
  const unitsWithoutConfirmer = units.filter((u) => !covered.has(u.id)).map((u) => u.name);
  const onCount = EMAIL_KINDS.filter((k) => isEmailOn(settings, k)).length;

  // ── The health check ──────────────────────────────────────────────────────────────────────
  const checks: Check[] = [];

  checks.push(
    configured
      ? { ok: true, title: "Sending is set up", detail: `Emails go out as ${emailFromAddress}.` }
      : {
          ok: false,
          title: "Sending isn't set up",
          detail:
            "The sending key and address aren't set. They go in Vercel's environment settings, followed by a redeploy. Until then nothing is sent.",
        }
  );

  switch (readiness.state) {
    case "READY":
      checks.push({
        ok: true,
        title: "Everyone can receive them",
        detail: `${domain} is approved with the email provider, so mail reaches every inbox, not just yours.`,
      });
      break;
    case "OWNER_ONLY":
      checks.push({
        ok: false,
        title: "Only you would receive them",
        detail: `${domain ?? "The sending domain"} isn't approved with the email provider yet, so mail reaches only the account owner. A sample sent to yourself will arrive and prove nothing.`,
      });
      break;
    case "KEY_REFUSED":
      checks.push({
        ok: false,
        title: "The email provider refuses the sending key",
        detail: "Nothing can be sent until the key in Vercel's environment settings is replaced.",
      });
      break;
    case "NOT_CONFIGURED":
      checks.push({ ok: null, title: "Can't check who receives them yet", detail: "Set up sending first." });
      break;
    default:
      checks.push({ ok: null, title: "Couldn't check who receives them", detail: readiness.detail });
  }

  checks.push(
    settings.emailEnabled
      ? { ok: true, title: "Emails are switched on", detail: "The main switch in Settings below is on." }
      : {
          ok: false,
          title: "Emails are switched off",
          detail: "Nothing is sent while the main switch in Settings below is off, whatever is ticked.",
          link: { label: "Go to Settings ↓", href: "#settings" },
        }
  );

  const missingInboxes = [!settings.hrInbox && "HR", !settings.financeInbox && "Finance"].filter(Boolean);
  checks.push(
    missingInboxes.length === 0
      ? {
          ok: true,
          title: "HR and Finance inboxes are filled in",
          detail: `${settings.hrInbox} · ${settings.financeInbox}`,
        }
      : {
          ok: false,
          title:
            missingInboxes.length === 2 ? "The HR and Finance inboxes are empty" : `The ${missingInboxes[0]} inbox is empty`,
          detail: "Emails meant for it have nowhere to go.",
          link: { label: "Fill it in ↓", href: "#settings" },
        }
  );

  // Only an email concern while the email that needs a confirmer is on.
  if (units.length > 0 && isEmailOn(settings, "payments.awaiting")) {
    checks.push(
      unitsWithoutConfirmer.length === 0
        ? { ok: true, title: "Every business unit has someone to confirm payments", detail: "Each one's confirmation emails have somebody to go to." }
        : {
            ok: false,
            title:
              unitsWithoutConfirmer.length === 1
                ? `${unitsWithoutConfirmer[0]} has nobody to confirm its payments`
                : `${unitsWithoutConfirmer.join(", ")} have nobody to confirm their payments`,
            detail: "Their “waiting for your confirmation” emails have no one to go to.",
            link: { label: "Appoint someone →", href: "/admin/confirmers" },
          }
    );
  }

  if (failures.count === 0 || !failures.latest) {
    checks.push({ ok: true, title: "No email was refused this week", detail: "Every email in the last 7 days went out." });
  } else {
    const f = failures.latest;
    const name = isEmailKind(f.kind) ? EMAIL_CATALOG[f.kind].name : f.kind;
    const to = f.recipient ? ` to ${f.recipient}` : "";
    // Where the address lives, so the fix is one click away: a person's record, or an inbox here.
    const person = f.recipient
      ? await prisma.user.findFirst({
          where: { email: { equals: f.recipient, mode: "insensitive" } },
          select: { id: true },
        })
      : null;
    const isInbox = !!f.recipient && [settings.hrInbox, settings.financeInbox].includes(f.recipient);
    const link = person
      ? { label: "Fix the address →", href: `/admin/employees/${person.id}` }
      : isInbox || !f.recipient
        ? { label: "Fix the address ↓", href: "#settings" }
        : undefined;
    checks.push({
      ok: false,
      title:
        failures.count === 1 ? "1 email was refused this week" : `${failures.count} emails were refused this week`,
      detail:
        `“${name}”${to} on ${dateOf(f.createdAt)}: ${f.error ?? "no reason given"}` +
        (failures.count > 1 ? " That is the latest; the others show on their rows below." : ""),
      link,
    });
  }

  const needing = checks.filter((c) => c.ok === false).length;
  const allGood = needing === 0;

  // ── The list ──────────────────────────────────────────────────────────────────────────────
  const rows: EmailRowData[] = catalogInOrder().map(({ kind, entry }) => {
    const inbox = entry.goesTo.type === "inbox" ? entry.goesTo.inbox : null;
    const addr = inbox === "hr" ? settings.hrInbox : inbox === "finance" ? settings.financeInbox : null;
    const last = lastByKind[kind];
    let warn: string | null = null;
    if (inbox && !addr) warn = "Empty: fill it in under Settings";
    if (kind === "payments.awaiting" && unitsWithoutConfirmer.length > 0) {
      warn = `${unitsWithoutConfirmer.join(", ")}: nobody appointed`;
    }
    return {
      kind,
      area: entry.area,
      name: entry.name,
      when: entry.when(settings),
      who:
        entry.goesTo.type === "inbox"
          ? entry.goesTo.inbox === "hr"
            ? "HR inbox"
            : "Finance inbox"
          : entry.goesTo.who,
      addr: addr ?? null,
      setIn: entry.goesTo.type === "person" ? entry.goesTo.setIn ?? null : null,
      setInLink: entry.goesTo.type === "person" ? entry.goesTo.setInLink ?? null : null,
      warn,
      on: isEmailOn(settings, kind),
      last: describeLast(last),
      lastDate: last ? dateOf(last.at) : null,
    };
  });

  const label = "block text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted mb-1";
  const input =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

  return (
    <div className="max-w-[1100px]">
      <BackLink href="/admin" label="Admin" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Notifications</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Email notifications</h1>
      <p className="mt-1 text-muted">Who gets which email, and whether it is working. Super User only.</p>

      {/* 1 · Is it working? */}
      <section
        className={`mt-6 rounded-xl border px-5 py-[18px] bg-gradient-to-b to-surface to-70% ${
          allGood ? "border-green-200 from-green-50" : "border-gold-300 from-gold-50"
        }`}
      >
        <p className={`m-0 font-serif text-xl font-semibold ${allGood ? "text-green-700" : "text-gold-800"}`}>
          {allGood ? "Everything is working" : needing === 1 ? "1 thing needs you" : `${needing} things need you`}
        </p>
        <p className="mt-0.5 text-[12.5px] tabular-nums text-muted">
          {onCount} of {EMAIL_KINDS.length} emails switched on · {totals.sent} sent in the last 30 days ·{" "}
          {totals.notSent} refused
        </p>
        <ul className="mt-3.5 grid list-none gap-x-[22px] gap-y-2 p-0 sm:grid-cols-2">
          {checks.map((c) => (
            <li
              key={c.title}
              className={`grid grid-cols-[22px_minmax(0,1fr)] items-start gap-2.5 border-t border-line py-[9px] ${
                c.ok === false ? "-mx-2 rounded-b-lg bg-red-50 px-2" : ""
              }`}
            >
              <span
                aria-label={c.ok === true ? "Working" : c.ok === false ? "Needs attention" : "Not checked"}
                className={`mt-px grid h-5 w-5 place-items-center rounded-full border text-xs font-bold leading-none ${
                  c.ok === true
                    ? "border-green-200 bg-green-50 text-green-700"
                    : c.ok === false
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-dashed border-navy-200 bg-surface text-navy-300"
                }`}
              >
                {c.ok === true ? "✓" : c.ok === false ? "!" : "?"}
              </span>
              <span className="min-w-0">
                <b className="block text-[13px] font-semibold text-ink">{c.title}</b>
                <span className="block break-words text-xs text-muted">{c.detail}</span>
                {c.link ? (
                  <a
                    href={c.link.href}
                    className="text-xs font-semibold text-navy-700 underline underline-offset-2"
                  >
                    {c.link.label}
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 2 · Who gets what */}
      <WhoGetsWhat rows={rows} defaultSampleTo={actor.email ?? ""} />

      {/* 3 · Settings — the form as it was, now below the list */}
      <div id="settings" className="scroll-mt-6">
        <ToastResultForm
          action={updateNotificationSettings}
          savedMessage="Settings saved."
          className="mt-4 rounded-xl border border-line bg-surface px-5 py-[18px]"
        >
          <h2 className="text-sm font-bold text-ink">Settings</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">The main switch, the team inboxes and the sender name.</p>

          <label className="mt-3.5 flex items-center justify-between gap-3 rounded-[10px] border border-line bg-paper px-3.5 py-[11px]">
            <span>
              <span className="block text-[13.5px] font-semibold text-ink">Send workflow emails</span>
              <span className="block text-xs text-muted">Main switch. Off = nothing is sent, whatever is ticked above.</span>
            </span>
            <input
              type="checkbox"
              name="emailEnabled"
              defaultChecked={settings.emailEnabled}
              className="h-5 w-5 flex-none accent-navy-800"
            />
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="notif-hrInbox" className={label}>HR team inbox</label>
              <input id="notif-hrInbox" name="hrInbox" type="email" defaultValue={settings.hrInbox ?? ""} placeholder="hr@…" className={input} />
            </div>
            <div>
              <label htmlFor="notif-financeInbox" className={label}>Finance team inbox</label>
              <input id="notif-financeInbox" name="financeInbox" type="email" defaultValue={settings.financeInbox ?? ""} placeholder="finance@…" className={input} />
            </div>
            <div>
              <label htmlFor="notif-fromName" className={label}>From name (shown on emails)</label>
              <input id="notif-fromName" name="fromName" defaultValue={settings.fromName ?? ""} placeholder="Forefront People" className={input} />
            </div>
            <div>
              {/* Holiday reminders (spec 037) — how far ahead HR is asked to confirm a date. */}
              <label htmlFor="notif-lead" className={label}>Holiday reminders: days ahead</label>
              <input
                id="notif-lead"
                name="verificationLeadDays"
                type="number"
                min={1}
                max={60}
                defaultValue={settings.verificationLeadDays}
                className={input}
              />
              <p className="mt-1 text-[11.5px] text-muted">Appears in the “Confirm a holiday date” row above.</p>
            </div>
          </div>

          <div className="mt-3.5">
            <button className="rounded-lg bg-navy-800 px-[18px] py-[9px] text-[13px] font-semibold text-white hover:bg-navy-700">
              Save settings
            </button>
          </div>
        </ToastResultForm>
      </div>

      <IncentiveMessageEditor
        stored={resolveIncentiveMessage({
          subject: settings.incentiveEmailSubject,
          heading: settings.incentiveEmailHeading,
          body: settings.incentiveEmailBody,
          footer: settings.incentiveEmailFooter,
        })}
      />
    </div>
  );
}
