import Link from "next/link";
import { requireAdmin, isSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

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
  { href: "/admin/benefits", title: "Benefits Management", body: "Plan-year window and submissions.", ready: true },
  { href: "/admin/time-off", title: "Time-Off", body: "View all leave requests; approve or decline as a fallback.", ready: true },
  { href: "/admin/announcements", title: "Announcements", body: "Post company announcements.", ready: true },
  { href: "/admin/departments", title: "Departments", body: "Add, rename, or remove the departments used across records and filters.", ready: true },
];

/** Pending benefit claims in the active plan year — surfaced as a "needs attention" pill. */
async function pendingClaimCount(): Promise<number> {
  const planYears = await prisma.planYear.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, status: true } });
  const active = planYears.find((p) => p.status === "OPEN") ?? planYears[0];
  if (!active) return 0;
  // Claims awaiting HR review.
  return prisma.benefitClaim.count({
    where: { planYearId: active.id, status: "SUBMITTED" },
  });
}

export default async function AdminPage() {
  const actor = await requireAdmin();
  let pendingClaims = 0;
  try {
    pendingClaims = await pendingClaimCount();
  } catch {
    // Benefits tables not migrated yet — leave the pill off rather than break the page.
    pendingClaims = 0;
  }
  const cards = isSuperUser(actor.role)
    ? [
        ...CARDS,
        {
          href: "/admin/impersonate",
          title: "View as Employee",
          body: "See the app exactly as an employee does — for demos or to reproduce an issue.",
          ready: true,
        },
        {
          href: "/admin/modules",
          title: "Modules",
          body: "Switch platform modules on or off to release when ready.",
          ready: true,
        },
        {
          href: "/admin/brand",
          title: "Brand",
          body: "Company name, logo, and brand colors for this deployment.",
          ready: true,
        },
        {
          href: "/admin/notifications",
          title: "Notifications",
          body: "Claim-workflow emails: HR/Finance inboxes, on/off, and a test send.",
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
        {cards.map((c) => {
          const showPending = c.href === "/admin/benefits" && pendingClaims > 0;
          return (
            <Link
              key={c.title}
              href={c.href}
              className={
                "ff-card ff-adcard rounded-xl border border-line bg-surface p-5 hover:border-navy-300" +
                (c.ready ? "" : " pointer-events-none opacity-60")
              }
            >
              {showPending ? (
                <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-2.5 py-1 text-[11px] font-bold text-gold-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold-500" aria-hidden="true" />
                  {pendingClaims} pending
                </span>
              ) : null}
              <div className="ff-ad-title text-[19px] font-semibold tracking-[-0.01em] text-ink">{c.title}</div>
              <p className="ff-ad-details text-sm text-muted">{c.ready ? c.body : "Coming soon"}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
