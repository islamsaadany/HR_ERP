import { requireAdmin } from "@/lib/roles";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";
import { createAnnouncement, deleteAnnouncement } from "./actions";
import { BackLink } from "@/components/admin/BackLink";
import { ToastResultForm } from "@/components/admin/ToastResultForm";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  await requireAdmin();
  const items = await prisma.announcement.findMany({ orderBy: { publishedAt: "desc" } });

  return (
    <div className="max-w-2xl">
      <BackLink href="/admin/communications" label="Communications" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Communications</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Noticeboard</h1>
      <p className="mt-1 max-w-[66ch] text-muted">
        Posts appear on everyone&rsquo;s dashboard the next time they open the app. Nobody is
        emailed and nobody is chosen &mdash; it is there for whoever looks. To reach chosen people
        in their inbox, use <b>Email</b> instead.
      </p>

      <ToastResultForm action={createAnnouncement} savedMessage="Posted to the noticeboard." resetOnSuccess className="mt-6 space-y-3 rounded-xl border border-line bg-surface p-6">
        <div>
          <label htmlFor={"announcement-title"} className="block text-xs uppercase tracking-wide text-muted mb-1">Title</label>
          <input id={"announcement-title"} name="title" required className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor={"announcement-body"} className="block text-xs uppercase tracking-wide text-muted mb-1">Message</label>
          <textarea id={"announcement-body"} name="body" rows={3} required className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </div>
        <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">Post to the noticeboard</button>
      </ToastResultForm>

      <ul className="mt-6 space-y-3">
        {items.length === 0 ? <li className="text-sm text-muted">Nothing on the noticeboard yet.</li> : null}
        {items.map((a) => (
          <li key={a.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-ink">{a.title}</div>
                <div className="text-xs text-muted">{formatDate(a.publishedAt)}</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{a.body}</p>
              </div>
              <form action={deleteAnnouncement}>
                <input type="hidden" name="id" value={a.id} />
                <ConfirmSubmitButton message={`Delete the announcement “${a.title}”? This can't be undone.`} className="shrink-0 text-sm text-muted hover:text-red-600">Delete</ConfirmSubmitButton>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
