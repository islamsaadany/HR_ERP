import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { BackLink } from "@/components/admin/BackLink";
import { AutoRefresh } from "@/components/AutoRefresh";
import { getCommsSettings } from "@/lib/comms/settings";

export const dynamic = "force-dynamic";

/**
 * Communications — one door, three ways of reaching people (mockup-approved 2026-08-25).
 *
 * Announcements and Communications used to be two separate admin tiles whose names meant almost
 * the same thing, and which knew nothing about each other: posting to the dashboard emailed
 * nobody, emailing an announcement put nothing on the dashboard, and telling everyone something
 * important meant remembering to do both, in two places, twice.
 *
 * They are one entry now, and you choose by WHERE THE MESSAGE LANDS — which is the only difference
 * that matters to the person deciding. The three are kept apart rather than merged into one
 * "compose" screen because their requirements genuinely differ: the noticeboard has no audience,
 * no preview and nothing irreversible; email has all three; congratulations are written by the
 * platform and sent by somebody else entirely.
 */
export default async function CommunicationsPage() {
  await requireAdmin();

  const [settings, posted, drafts, sent, waiting] = await Promise.all([
    getCommsSettings(),
    prisma.announcement.count(),
    prisma.message.count({ where: { kind: "ANNOUNCEMENT", state: "DRAFT" } }),
    prisma.message.count({ where: { kind: "ANNOUNCEMENT", state: "SENT" } }),
    prisma.message.count({
      where: { kind: { in: ["BIRTHDAY", "WORK_ANNIVERSARY"] }, state: "DRAFT" },
    }),
  ]);

  const options = [
    {
      href: "/admin/communications/noticeboard",
      glyph: "▤",
      name: "Noticeboard",
      what: "Appears on everyone's dashboard when they next open the app. Nobody is emailed and nobody is chosen — it is there for whoever looks.",
      count: `${posted} ${posted === 1 ? "post" : "posts"}`,
      settings: null,
    },
    {
      href: "/admin/communications/email",
      glyph: "✉",
      name: "Email",
      what: "Lands in the inbox of the people you choose, each copy branded with that person's own business unit. It cannot be recalled.",
      count: `${drafts} ${drafts === 1 ? "draft" : "drafts"} · ${sent} sent`,
      settings: "/admin/communications/settings",
    },
    {
      href: "/admin/communications/queue",
      glyph: "✦",
      name: "Congratulations",
      what: "Birthdays and joining anniversaries, written in advance and put in the manager's hands. Nothing sends on its own.",
      count: `${waiting} waiting`,
      settings: "/admin/communications/settings",
    },
  ];

  return (
    <div>
      {/* Somebody else may post or send while this sits open. */}
      <AutoRefresh />
      <BackLink href="/admin" label="Admin" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Communications</h1>
      <p className="mt-1 max-w-[70ch] text-muted">
        Three ways to reach people. The difference is where the message lands.
      </p>

      {!settings.emailEnabled ? (
        <p className="mt-4 max-w-[70ch] rounded-r-lg border-l-[3px] border-gold-500 bg-gold-100 px-3 py-2 text-[12.5px] text-gold-800">
          Email sending is switched off at <b>Admin → Notifications</b>. Drafts can be written and
          previewed and the noticeboard still works; nothing will reach an inbox until it is on.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => (
          <div
            key={o.href}
            className="ff-card flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4"
          >
            <Link href={o.href} className="flex items-center gap-2.5 hover:text-navy-700">
              <span
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy-50 text-[15px] text-navy-800"
              >
                {o.glyph}
              </span>
              <span className="text-[15px] font-bold text-navy-800">{o.name}</span>
            </Link>
            <p className="flex-1 text-[12.8px] text-muted">{o.what}</p>
            <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
              <Link href={o.href} className="text-[12.5px] text-muted hover:text-ink">
                {o.count} →
              </Link>
              {o.settings ? (
                <Link
                  href={o.settings}
                  className="border-b border-dashed border-navy-200 text-[12px] text-navy-700 hover:text-navy-800"
                >
                  Settings
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
