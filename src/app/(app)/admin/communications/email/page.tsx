import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/roles";
import { formatDate } from "@/lib/labels";
import { BackLink } from "@/components/admin/BackLink";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CHIP } from "@/components/learning/ui";
import { recentMessages } from "@/lib/comms/queries";
import { getCommsSettings } from "@/lib/comms/settings";
import { createAnnouncement } from "../actions";

export const dynamic = "force-dynamic";

export default async function EmailAnnouncementsPage() {
  await requireAdmin();
  const [messages, settings] = await Promise.all([recentMessages(), getCommsSettings()]);

  async function start() {
    "use server";
    const form = new FormData();
    form.set("subject", "Untitled announcement");
    form.set("body", "Write your message here.");
    const result = await createAnnouncement(form);
    if (result.ok && result.data) redirect(`/admin/communications/${result.data.id}`);
  }

  return (
    <div>
      {/* Somebody else may send while this sits open. */}
      <AutoRefresh />
      <BackLink href="/admin/communications" label="Communications" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Communications</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Email</h1>
      <p className="mt-1 max-w-[70ch] text-muted">
        Lands in the inbox of the people you choose. Each person receives their own copy, branded
        with their own business unit — nobody sees anybody else&rsquo;s address, and once it has
        gone it cannot be recalled.
      </p>

      <div className="mt-2 text-sm">
        <Link href="/admin/communications/settings" className="text-muted hover:text-ink">
          Sender, group name and delivery →
        </Link>
      </div>

      {!settings.emailEnabled ? (
        <p className="mt-4 rounded-r-lg border-l-[3px] border-gold-500 bg-gold-100 px-3 py-2 text-[12.5px] text-gold-800">
          Email sending is switched off. Drafts can be written and previewed; nothing will send
          until it is turned on at Admin → Notifications.
        </p>
      ) : null}

      <form action={start} className="mt-4">
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
        >
          + New email
        </button>
      </form>

      {messages.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          Nothing yet. An email is written when there is something to say — nothing here is created
          automatically.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {messages.map((m) => (
            <li key={m.id}>
              <Link
                href={`/admin/communications/${m.id}`}
                className="ff-card flex items-center gap-4 rounded-xl border border-line bg-surface p-4 hover:border-navy-300"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-bold text-navy-800">{m.subject}</span>
                    <span className={m.state === "SENT" ? CHIP.done : CHIP.attention}>
                      {m.state === "SENT" ? "Sent" : "Draft"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {m.state === "SENT" ? (
                      <>
                        {m.recipientCount} {m.recipientCount === 1 ? "person" : "people"}
                        {m.sentAt ? <> · {formatDate(m.sentAt)}</> : null}
                        {m.sentBy?.name ? <> · by {m.sentBy.name}</> : null}
                      </>
                    ) : (
                      <>started {formatDate(m.createdAt)}</>
                    )}
                  </span>
                </span>
                <span className="text-sm text-muted">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
