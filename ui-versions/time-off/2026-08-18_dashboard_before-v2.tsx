import Link from "next/link";
import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { tracksForUser } from "@/lib/onboarding";
import { getActivePlanYear } from "@/lib/benefits/config";
import { getDisabledModules, getDisabledHrefs } from "@/lib/modules";
import { getBrand } from "@/lib/brand";
import { formatDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

const QUICK = [
  { href: "/onboarding", label: "Onboarding" },
  { href: "/benefits", label: "Benefits" },
  { href: "/directory", label: "Team Directory" },
  { href: "/handbook", label: "Handbook & Resources" },
  { href: "/time-off", label: "Time-Off" },
  { href: "/profile", label: "My Profile" },
];

function Tile({ title, children, href }: { title: string; children: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="ff-card rounded-xl border border-line bg-surface p-5 hover:border-navy-300">
      <div className="text-sm font-medium text-ink">{title}</div>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </Link>
  );
}

export default async function DashboardPage() {
  const me = await requireUser();
  const firstName = me.name?.split(" ")[0] ?? "there";

  const brand = await getBrand();
  const dbUser = await prisma.user.findUnique({
    where: { id: me.id },
    select: { department: true, employmentType: true, tenureBand: true },
  });
  const tracks = tracksForUser({ department: dbUser?.department ?? null });

  const planYear = await getActivePlanYear();

  const [assignedCount, completedCount, myPending, approvals, medicalCommitment, announcements, hasReports, teamCount, disabled] =
    await Promise.all([
      prisma.onboardingActivity.count({ where: { active: true, track: { in: tracks } } }),
      prisma.activityCompletion.count({ where: { userId: me.id } }),
      prisma.leaveRequest.count({ where: { userId: me.id, status: "PENDING" } }),
      prisma.leaveRequest.count({ where: { approverId: me.id, status: "PENDING" } }),
      planYear
        ? prisma.medicalCommitment.findFirst({
            // Committed for THIS cycle — including a term committed last cycle that still charges it.
            where: { userId: me.id, OR: [{ cycleCharges: { some: { planYearId: planYear.id } } }, { planYearId: planYear.id }] },
            select: { id: true },
          })
        : Promise.resolve(null),
      prisma.announcement.findMany({ orderBy: { publishedAt: "desc" }, take: 5 }),
      prisma.user.count({ where: { reportsToId: me.id, status: "ACTIVE" } }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      getDisabledModules(),
    ]);

  const disabledHrefs = await getDisabledHrefs();
  const on = (key: string) => !disabled.has(key);

  const onbPct = assignedCount === 0 ? 100 : Math.round((completedCount / assignedCount) * 100);
  const onboardingDone = assignedCount > 0 && completedCount >= assignedCount;

  const benefitsMsg = !planYear
    ? "Selection not open."
    : medicalCommitment
    ? "Medical committed — claim benefits anytime."
    : "Open — commit medical & claim as you spend.";

  // Card visibility: disabled modules never show. Time-Off + Team Directory are the
  // always-on primary cards; Onboarding hides when complete; Benefits shows while open.
  const showOnboarding = on("onboarding") && !onboardingDone;
  const showBenefits = on("benefits") && !!planYear;
  const showTimeOff = on("timeoff");
  const showDirectory = on("directory");
  const showApprovals = on("timeoff") && hasReports > 0;

  const quickLinks = QUICK.filter((q) => !disabledHrefs.includes(q.href));

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Dashboard</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Welcome, {firstName}</h1>
      <p className="mt-2 text-muted">Your {brand.companyName} home.</p>

      <div className="ff-stagger mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Primary, always-on cards (the most-used) */}
        {showTimeOff ? (
          <Tile title="Time-Off" href="/time-off">
            {myPending > 0 ? `${myPending} request(s) pending.` : "Request time off."}
          </Tile>
        ) : null}

        {showDirectory ? (
          <Tile title="Team Directory" href="/directory">
            {teamCount} colleague{teamCount === 1 ? "" : "s"} — find and reach them.
          </Tile>
        ) : null}

        {/* Contextual cards */}
        {showOnboarding ? (
          <Tile title="Onboarding" href="/onboarding">
            {completedCount} of {assignedCount} done · {onbPct}%
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-navy-50">
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${onbPct}%` }} />
            </div>
          </Tile>
        ) : null}

        {showBenefits ? <Tile title="Benefits" href="/benefits">{benefitsMsg}</Tile> : null}

        {showApprovals ? (
          <Tile title="Approvals" href="/time-off">
            {approvals > 0 ? `${approvals} time-off request(s) awaiting you.` : "No pending approvals."}
          </Tile>
        ) : null}
      </div>

      {/* Announcements */}
      <h2 className="mt-10 font-serif text-2xl text-ink">Announcements</h2>
      {announcements.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing new right now.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {announcements.map((a) => (
            <li key={a.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="font-medium text-ink">{a.title}</div>
              <div className="text-xs text-muted">{formatDate(a.publishedAt)}</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{a.body}</p>
            </li>
          ))}
        </ul>
      )}

      {/* Quick links */}
      <h2 className="mt-10 font-serif text-2xl text-ink">Quick links</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {quickLinks.map((q) => (
          <Link key={q.href} href={q.href} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-navy-700 hover:border-navy-300">
            {q.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
