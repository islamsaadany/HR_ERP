import Link from "next/link";
import { isAdmin, isSuperUser, requireUser } from "@/lib/roles";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canManageLearning } from "@/lib/learning/managers";
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
      {
        href: "/admin/learning",
        title: "Learning",
        body: "Build training courses and choose who they reach.",
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
      {
        href: "/admin/communications",
        title: "Communications",
        body: "Email the team — announcements, and birthday or anniversary notes a manager sends.",
        ready: true,
      },
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
      {
        href: "/admin/confirmers",
        title: "Who confirms transactions",
        body: "Appoint who confirms bank transactions and marks them complete.",
        ready: true,
      },
      {
        href: "/admin/expense-lists",
        title: "Expense lists",
        body: "Sections and categories for petty cash lines and payback requests.",
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

/** One-glyph marks. Deliberately not emoji: they inherit the text colour and stay on-brand. */
const GLYPH: Record<string, string> = {
  "/admin/benefits": "◆",
  "/admin/time-off": "▤",
  "/admin/employees": "☰",
  "/admin/change-requests": "✎",
  "/admin/data-requests": "◫",
  "/admin/departments": "⌗",
  "/admin/learning": "◎",
  "/admin/onboarding": "▶",
  "/admin/handbook": "▣",
  "/admin/knowledge": "◈",
  "/admin/announcements": "✦",
  "/admin/communications": "✉",
  "/admin/impersonate": "◉",
  "/admin/modules": "⊞",
  "/admin/brand": "◐",
  "/admin/notifications": "✉",
  "/admin/expense-lists": "☰",
  "/admin/confirmers": "✓",
};

/**
 * One destination, as a row (compact layout B, approved 2026-08-21).
 *
 * The description moved into a HOVER so fifteen destinations fit one screen instead of scrolling.
 * The count stays on the row, because "something is waiting" has to be visible without hovering —
 * that is the whole point of the flag. The BREAKDOWN ("2 claims to review", "1 over-charged") joins
 * the description in the hover: it was added in August so a card says what you are walking into,
 * and losing it entirely would undo that, but it does not have to be on screen at rest.
 *
 * The hover is CSS-only and also opens on keyboard focus, so it is not mouse-only.
 */
function AdminRow({ card, flag }: { card: Card; flag: Flag | null }) {
  return (
    <Link
      href={card.href}
      className={
        "group relative flex items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] first:rounded-t-xl last:rounded-b-xl last:border-b-0 hover:bg-navy-50/40 " +
        (card.ready ? "" : "pointer-events-none opacity-60")
      }
    >
      <span
        aria-hidden
        className={
          "grid h-[22px] w-[22px] flex-none place-items-center rounded-md text-[12px] " +
          (flag ? "bg-gold-100 text-gold-800" : "bg-navy-50 text-navy-700")
        }
      >
        {GLYPH[card.href] ?? "•"}
      </span>

      <span className="min-w-0 flex-1 truncate font-semibold text-navy-800">{card.title}</span>

      {flag ? (
        <span className="ml-auto inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gold-500 px-1.5 text-[10.5px] font-extrabold text-navy-900">
          {flag.count}
        </span>
      ) : null}

      {/* The hover card. `pointer-events-none` so it can never sit between the cursor and the row. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-3 z-20 w-[250px] rounded-lg bg-navy-900 px-2.5 py-2 text-[11.5px] font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {card.ready ? card.body : "Coming soon"}
        {flag ? (
          <span className="mt-1 block font-semibold text-gold-300">
            {flag.tags.map((t) => t.label).join(" · ")}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * Deal the sections into two columns, balancing by CARD COUNT rather than section count.
 *
 * With four sections a naive two-and-two split leaves a short column next to a long one, and an HR
 * Admin (who never sees the Super-User section) would get three-and-one. Filling whichever column
 * is currently shorter keeps both roughly level for either audience, and keeps each section whole.
 *
 * Sections are taken in SOURCE ORDER, never sorted: Benefits & Time-Off leads on purpose (it is the
 * daily queue — the only section where something is waiting on HR rather than being authored by
 * them), and People follows because it is the registry every other module reads from. Sorting by
 * size to get a tidier split would quietly undo that. A column three rows longer is the cheaper
 * price.
 */
function splitIntoColumns(cats: Category[]): [Category[], Category[]] {
  const columns: [Category[], Category[]] = [[], []];
  const heights = [0, 0];
  for (const cat of cats) {
    const target = heights[0] <= heights[1] ? 0 : 1;
    columns[target].push(cat);
    heights[target] += cat.cards.length + 1; // +1 for the section heading
  }
  return columns;
}

export default async function AdminPage() {
  // A learning manager has their own sidebar door straight to the module, so this page would be a
  // single row they had just come from. Sending them on means a stray bookmark or an old link
  // cannot strand them on it (2026-08-22). Everyone else who is not HR goes home.
  const actor = await requireUser();
  if (!isAdmin(actor.role)) {
    if (await canManageLearning(actor)) redirect("/admin/learning");
    redirect("/dashboard");
  }
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

  // Resources employees have suggested and HR has not yet approved or declined (spec 038
  // materials). Wrapped like the others: before migration 064 runs, this table does not exist.
  // Congratulations waiting for somebody to send. HR's card carries the count because a message
  // that misses its day is closed, not sent late — so an unnoticed queue is a missed birthday.
  const pendingCongrats = await safe(
    () =>
      prisma.message.count({
        where: { state: "DRAFT", kind: { in: ["BIRTHDAY", "WORK_ANNIVERSARY"] } },
      }),
    0
  );

  const pendingSuggestions = await safe(
    () => prisma.courseResource.count({ where: { status: "PENDING" } }),
    0
  );

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
    "/admin/communications":
      pendingCongrats > 0
        ? {
            count: pendingCongrats,
            tags: [
              {
                label: `${pendingCongrats} ${pendingCongrats === 1 ? "message" : "messages"} waiting to send`,
                tone: "warn",
              },
            ],
          }
        : null,
    "/admin/learning":
      pendingSuggestions > 0
        ? {
            count: pendingSuggestions,
            tags: [
              {
                label: `${pendingSuggestions} suggested resource${pendingSuggestions === 1 ? "" : "s"} to review`,
                tone: "warn",
              },
            ],
          }
        : null,
  };

  const categories = CATEGORIES.filter((cat) => !cat.superOnly || superUser);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="font-serif text-2xl text-ink">HR Admin</h1>
        <p className="text-sm text-muted">Manage the platform.</p>
      </div>

      {/* Two REAL grid columns, not CSS multi-column.
          Multicol was the obvious way to balance four sections across two columns, but each row
          carries an absolutely-positioned hover card and browsers place those inconsistently
          inside a multicol formatting context. A plain grid with the sections dealt into two
          buckets is predictable, and balancing by CARD COUNT (rather than section count) keeps the
          columns even when the Super-User section is hidden from an HR Admin. */}
      <div className="mt-6 grid gap-x-6 md:grid-cols-2">
        {splitIntoColumns(categories).map((column, ci) => (
        <div key={ci}>
        {column.map((cat) => (
          <section key={cat.label} className="mb-4">
            <div className="mb-1.5 flex items-center gap-2.5">
              <span className="h-[6px] w-[6px] flex-shrink-0 rounded-full bg-gold-500" aria-hidden="true" />
              <span className="whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.09em] text-navy-700">
                {cat.label}
              </span>
              <span className="h-px flex-1 bg-line" aria-hidden="true" />
              <span className="whitespace-nowrap text-[10px] text-muted">
                {cat.superOnly ? `Super User · ${cat.cards.length}` : cat.cards.length}
              </span>
            </div>
            {/* NO `overflow-hidden` here: it would clip the hover card, which sits above its row.
                The corners are rounded on the first and last rows instead. */}
            <div className="rounded-xl border border-line bg-surface">
              {cat.cards.map((card) => (
                <AdminRow key={card.title} card={card} flag={flags[card.href] ?? null} />
              ))}
            </div>
          </section>
        ))}
        </div>
        ))}
      </div>
    </div>
  );
}
