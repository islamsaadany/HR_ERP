import Link from "next/link";
import { requireAdmin, isSuperUser } from "@/lib/roles";
import { pendingRequestCount } from "@/lib/profile/change-requests";
import { benefitsAttention, pendingLeaveCount, type BenefitsAttention } from "@/lib/benefits/attention";

type Card = { href: string; title: string; body: string; ready: boolean };
type Category = { label: string; superOnly?: boolean; cards: Card[] };

// Admin home, grouped into categories (mockup-approved 2026-08-14). Cards, colors,
// and hover-reveal behavior are unchanged — the category headers are the only new
// device. `superOnly` categories are shown to Super Users only.
//
// Benefits & Time-Off leads (2026-08-16, mockup-approved): it is the daily queue — the only
// section where something is waiting on HR rather than being authored by them. People stays
// second because it is the registry every other module reads from.
const CATEGORIES: Category[] = [
  {
    label: "Benefits & Time-Off",
    cards: [
      { href: "/admin/benefits", title: "Benefits Management", body: "Plan-year window and submissions.", ready: true },
      { href: "/admin/time-off", title: "Time-Off", body: "View all leave requests; approve or decline as a fallback.", ready: true },
    ],
  },
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
        href: "/admin/change-requests",
        title: "Change Requests",
        body: "Corrections employees have asked for — approve a field and it is written to their record.",
        ready: true,
      },
      {
        href: "/admin/data-requests",
        title: "Data Requests",
        body: "Ask the team to fill or verify profile fields — a popup + sidebar reminder until they answer.",
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

/**
 * What each card is flagging, keyed by href. A card with nothing waiting has no entry —
 * zero states never render a "0" pill (mockup-approved 2026-08-16).
 */
type Flag = { count: number; tags: { label: string; tone: "warn" | "bad" }[] };

function benefitsFlag(a: BenefitsAttention): Flag | null {
  if (a.total === 0) return null;
  const tags: Flag["tags"] = [];
  if (a.claimsToReview > 0)
    tags.push({ label: `${a.claimsToReview} claim${a.claimsToReview === 1 ? "" : "s"} to review`, tone: "warn" });
  if (a.overCharged > 0) tags.push({ label: `${a.overCharged} over-charged`, tone: "bad" });
  if (a.coverEnded > 0) tags.push({ label: `${a.coverEnded} cover ended`, tone: "bad" });
  if (a.frozen > 0) tags.push({ label: `${a.frozen} in a closed cycle`, tone: "bad" });
  if (a.blocked > 0)
    tags.push({ label: `${a.blocked} blocked · no date of birth`, tone: "warn" });
  return { count: a.total, tags };
}

function AdminCard({ card, flag }: { card: Card; flag: Flag | null }) {
  return (
    <Link
      href={card.href}
      className={
        "ff-card ff-adcard rounded-xl border bg-surface p-5 hover:border-navy-300 " +
        (flag ? "border-gold-300" : "border-line") +
        (card.ready ? "" : " pointer-events-none opacity-60")
      }
    >
      {flag ? (
        <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-2.5 py-1 text-[11px] font-bold text-gold-800">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-500" aria-hidden="true" />
          {flag.count} need{flag.count === 1 ? "s" : ""} attention
        </span>
      ) : null}
      <div className="ff-ad-title text-[19px] font-semibold tracking-[-0.01em] text-ink">{card.title}</div>
      <p className="ff-ad-details text-sm text-muted">{card.ready ? card.body : "Coming soon"}</p>
      {/* The count says "click"; the breakdown says what you are walking into. Only rendered
          when something is waiting, so a quiet card looks exactly as it always has. */}
      {flag ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {flag.tags.map((t) => (
            <span
              key={t.label}
              className={
                "rounded-md border px-2 py-0.5 text-[11.5px] font-semibold " +
                (t.tone === "bad"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-gold-300 bg-gold-50 text-gold-800")
              }
            >
              {t.label}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

export default async function AdminPage() {
  const actor = await requireAdmin();
  const superUser = isSuperUser(actor.role);

  // Each count is wrapped on its own: an un-migrated table drops that one pill rather than
  // breaking the admin home, which is the only way back into everything else.
  const safe = async <T,>(work: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await work();
    } catch {
      return fallback;
    }
  };
  const [attention, pendingLeave, pendingChangeRequests] = await Promise.all([
    safe(benefitsAttention, {
      claimsToReview: 0, overCharged: 0, coverEnded: 0, frozen: 0, blocked: 0, medical: 0, total: 0,
    } as BenefitsAttention),
    safe(pendingLeaveCount, 0),
    safe(pendingRequestCount, 0),
  ]);

  const flags: Record<string, Flag | null> = {
    "/admin/benefits": benefitsFlag(attention),
    "/admin/time-off":
      pendingLeave > 0
        ? {
            count: pendingLeave,
            tags: [
              {
                label: `${pendingLeave} request${pendingLeave === 1 ? "" : "s"} awaiting a decision`,
                tone: "warn",
              },
            ],
          }
        : null,
    "/admin/change-requests":
      pendingChangeRequests > 0
        ? {
            count: pendingChangeRequests,
            tags: [
              {
                label: `${pendingChangeRequests} correction${pendingChangeRequests === 1 ? "" : "s"} to approve`,
                tone: "warn",
              },
            ],
          }
        : null,
  };

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
                <AdminCard key={card.title} card={card} flag={flags[card.href] ?? null} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
