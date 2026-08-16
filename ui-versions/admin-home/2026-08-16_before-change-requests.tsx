import Link from "next/link";
import { requireAdmin, isSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

type Card = { href: string; title: string; body: string; ready: boolean };
type Category = { label: string; superOnly?: boolean; cards: Card[] };

// Admin home, grouped into categories (mockup-approved 2026-08-14). Cards, colors,
// and hover-reveal behavior are unchanged — the category headers are the only new
// device. `superOnly` categories are shown to Super Users only.
const CATEGORIES: Category[] = [
  {
    label: "People",
    cards: [
      {
        href: "/admin/employees",
        title: "Employee Registry",
        body: "Create and edit employee records, employment, reporting lines, and roles.",
        ready: true,
      },
      {
        href: "/admin/departments",
        title: "Departments",
        body: "Add, rename, or remove the departments used across records and filters.",
        ready: true,
      },
    ],
  },
  {
    label: "Benefits & Time-Off",
    cards: [
      { href: "/admin/benefits", title: "Benefits Management", body: "Plan-year window and submissions.", ready: true },
      { href: "/admin/time-off", title: "Time-Off", body: "View all leave requests; approve or decline as a fallback.", ready: true },
    ],
  },
  {
    label: "Content & Communications",
    cards: [
      { href: "/admin/onboarding", title: "Onboarding Content", body: "Author onboarding stages and activities.", ready: true },
      { href: "/admin/handbook", title: "Handbook & Resources", body: "Author handbook sections and upload resources.", ready: true },
      { href: "/admin/knowledge", title: "Knowledge Base", body: "Author consulting reads & references (paste from the Claude prompt).", ready: true },
      { href: "/admin/announcements", title: "Announcements", body: "Post company announcements.", ready: true },
    ],
  },
  {
    label: "Platform",
    superOnly: true,
    cards: [
      {
        href: "/admin/impersonate",
        title: "View as Employee",
        body: "See the app exactly as an employee does — for demos or to reproduce an issue.",
        ready: true,
      },
      { href: "/admin/modules", title: "Modules", body: "Switch platform modules on or off to release when ready.", ready: true },
      {
        href: "/admin/brand",
        title: "Branding",
        body: "Each business unit's name, logo, and colors — employees see their unit's look.",
        ready: true,
      },
      {
        href: "/admin/notifications",
        title: "Notifications",
        body: "Claim-workflow emails: HR/Finance inboxes, on/off, and a test send.",
        ready: true,
      },
    ],
  },
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

function AdminCard({ card, pendingClaims }: { card: Card; pendingClaims: number }) {
  const showPending = card.href === "/admin/benefits" && pendingClaims > 0;
  return (
    <Link
      href={card.href}
      className={
        "ff-card ff-adcard rounded-xl border border-line bg-surface p-5 hover:border-navy-300" +
        (card.ready ? "" : " pointer-events-none opacity-60")
      }
    >
      {showPending ? (
        <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-2.5 py-1 text-[11px] font-bold text-gold-800">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-500" aria-hidden="true" />
          {pendingClaims} pending
        </span>
      ) : null}
      <div className="ff-ad-title text-[19px] font-semibold tracking-[-0.01em] text-ink">{card.title}</div>
      <p className="ff-ad-details text-sm text-muted">{card.ready ? card.body : "Coming soon"}</p>
    </Link>
  );
}

export default async function AdminPage() {
  const actor = await requireAdmin();
  const superUser = isSuperUser(actor.role);
  let pendingClaims = 0;
  try {
    pendingClaims = await pendingClaimCount();
  } catch {
    // Benefits tables not migrated yet — leave the pill off rather than break the page.
    pendingClaims = 0;
  }

  const categories = CATEGORIES.filter((cat) => !cat.superOnly || superUser);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">HR Admin</h1>
      <p className="mt-2 text-muted">Manage the platform.</p>

      <div className="mt-9 flex flex-col gap-8">
        {categories.map((cat) => (
          <section key={cat.label}>
            <div className="mb-3.5 flex items-center gap-3">
              <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full bg-gold-500" aria-hidden="true" />
              <span className="whitespace-nowrap text-xs font-bold uppercase tracking-[0.12em] text-navy-700">
                {cat.label}
              </span>
              <span className="h-px flex-1 bg-line" aria-hidden="true" />
              <span className="whitespace-nowrap text-xs text-muted">
                {cat.superOnly ? `Super User · ${cat.cards.length}` : cat.cards.length}
              </span>
            </div>
            <div className="ff-stagger grid gap-4 sm:grid-cols-2">
              {cat.cards.map((card) => (
                <AdminCard key={card.title} card={card} pendingClaims={pendingClaims} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
