import Link from "next/link";
import { requireAdmin } from "@/lib/roles";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    href: "/admin/employees",
    title: "Employee Registry",
    body: "Create and edit employee records, employment, reporting lines, and roles.",
    ready: true,
  },
  { href: "/admin/onboarding", title: "Onboarding Content", body: "Author onboarding stages and activities.", ready: true },
  { href: "/admin", title: "Benefits Configuration", body: "Plan-year window, ceilings, catalog, rate card.", ready: false },
  { href: "/admin", title: "Announcements", body: "Post company announcements.", ready: false },
];

export default async function AdminPage() {
  await requireAdmin();
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">HR Admin</h1>
      <p className="mt-2 text-muted">Manage the platform.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className={
              "rounded-xl border border-line bg-surface p-5 transition hover:border-navy-300" +
              (c.ready ? "" : " pointer-events-none opacity-60")
            }
          >
            <div className="font-medium text-ink">{c.title}</div>
            <div className="mt-1 text-sm text-muted">{c.body}</div>
            <div className="mt-3 text-xs font-medium text-gold-600">
              {c.ready ? "Open →" : "Coming soon"}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
