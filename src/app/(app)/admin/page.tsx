import Link from "next/link";
import { requireAdmin, isSuperUser } from "@/lib/roles";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    href: "/admin/employees",
    title: "Employee Registry",
    body: "Create and edit employee records, employment, reporting lines, and roles.",
    ready: true,
  },
  { href: "/admin/onboarding", title: "Onboarding Content", body: "Author onboarding stages and activities.", ready: true },
  { href: "/admin/handbook", title: "Handbook & Resources", body: "Author handbook sections and upload resources.", ready: true },
  { href: "/admin/knowledge", title: "Knowledge Base", body: "Author consulting reads & references (paste from the Claude prompt).", ready: true },
  { href: "/admin/benefits", title: "Benefits Configuration", body: "Plan-year window and submissions.", ready: true },
  { href: "/admin/announcements", title: "Announcements", body: "Post company announcements.", ready: true },
];

export default async function AdminPage() {
  const actor = await requireAdmin();
  const cards = isSuperUser(actor.role)
    ? [
        ...CARDS,
        {
          href: "/admin/modules",
          title: "Modules",
          body: "Switch platform modules on or off to release when ready.",
          ready: true,
        },
      ]
    : CARDS;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">HR Admin</h1>
      <p className="mt-2 text-muted">Manage the platform.</p>
      <div className="ff-stagger mt-8 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className={
              "ff-card rounded-xl border border-line bg-surface p-5 hover:border-navy-300" +
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
