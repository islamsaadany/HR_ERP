import Link from "next/link";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";
import { deleteSection, uploadResource, deleteResource } from "./actions";
import { BackLink } from "@/components/admin/BackLink";

export const dynamic = "force-dynamic";

export default async function AdminHandbookPage({
  searchParams,
}: {
  searchParams: Promise<{ resError?: string }>;
}) {
  await requireAdmin();
  const { resError } = await searchParams;
  const [sections, resources] = await Promise.all([
    prisma.handbookSection.findMany({ orderBy: { order: "asc" } }),
    prisma.resource.findMany({ orderBy: [{ category: "asc" }, { order: "asc" }] }),
  ]);

  return (
    <div>
      <BackLink href="/admin" label="Admin" />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Handbook</p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Handbook &amp; Resources</h1>
        </div>
        <Link href="/admin/handbook/new" className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">+ New section</Link>
      </div>

      <h2 className="mt-8 font-serif text-lg text-ink">Sections</h2>
      <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
        {sections.length === 0 ? (
          <li className="px-4 py-4 text-sm text-muted">No sections yet.</li>
        ) : sections.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <div className="font-medium text-ink">{s.title} {!s.active ? <span className="text-[10px] text-red-500">hidden</span> : null}</div>
              <div className="truncate text-xs text-muted">/{s.slug}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link href={`/admin/handbook/${s.id}`} className="text-sm font-medium text-navy-600 hover:text-navy-800">Edit</Link>
              <form action={deleteSection}><input type="hidden" name="id" value={s.id} /><button className="text-sm text-muted hover:text-red-600">Delete</button></form>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 font-serif text-lg text-ink">Resources</h2>
      {resError ? <p className="mt-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{resError}</p> : null}
      <form action={uploadResource} className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="min-w-[160px] flex-1">
          <label className="block text-xs uppercase tracking-wide text-muted mb-1">Title</label>
          <input name="title" placeholder="e.g. Company profile" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1">Category</label>
          <select name="category" className="rounded-lg border border-line px-3 py-2 text-sm">
            <option>Company profile</option><option>Template</option><option>Policy</option><option>Other</option>
          </select>
        </div>
        <input name="file" type="file" required className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-navy-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
        <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">Upload</button>
      </form>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
        {resources.length === 0 ? (
          <li className="px-4 py-4 text-sm text-muted">No resources yet.</li>
        ) : resources.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-4 py-3">
            <div><div className="text-sm font-medium text-ink">{r.title}</div><div className="text-xs text-muted">{r.category} · {formatDate(r.createdAt)}</div></div>
            <form action={deleteResource}><input type="hidden" name="id" value={r.id} /><button className="text-sm text-muted hover:text-red-600">Delete</button></form>
          </li>
        ))}
      </ul>
    </div>
  );
}
