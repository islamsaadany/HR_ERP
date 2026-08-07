import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";
import { createAnnouncement, deleteAnnouncement } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  await requireAdmin();
  const items = await prisma.announcement.findMany({ orderBy: { publishedAt: "desc" } });

  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Announcements</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Announcements</h1>

      <form action={createAnnouncement} className="mt-6 space-y-3 rounded-xl border border-line bg-surface p-6">
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1">Title</label>
          <input name="title" required className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1">Message</label>
          <textarea name="body" rows={3} required className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </div>
        <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">Post announcement</button>
      </form>

      <ul className="mt-6 space-y-3">
        {items.length === 0 ? <li className="text-sm text-muted">No announcements yet.</li> : null}
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
                <button className="shrink-0 text-sm text-muted hover:text-red-600">Delete</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
