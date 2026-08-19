import Link from "next/link";
import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { tracksForUser } from "@/lib/onboarding";
import { getActivePlanYear } from "@/lib/benefits/config";
import { getDisabledModules } from "@/lib/modules";
import { getBrand } from "@/lib/brand";
import { formatDate } from "@/lib/labels";
import { pendingApprovalWhere } from "@/lib/leave-queries";

export const dynamic = "force-dynamic";

// The Quick links section was removed 2026-08-18 (user request) — it duplicated the cards
// and the sidebar nav. The cards are the dashboard: Benefits · Time-Off · Approvals (for
// people with reports) · Onboarding while it's still in progress.

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

  const [assignedCount, completedCount, myPending, approvals, medicalCommitment, announcements, hasReports, disabled] =
    await Promise.all([
      prisma.onboardingActivity.count({ where: { active: true, track: { in: tracks } } }),
      prisma.activityCompletion.count({ where: { userId: me.id } }),
      prisma.leaveRequest.count({ where: { userId: me.id, status: "PENDING" } }),
      // Current-org-chart approvals (spec 035, FR-007) — same query as the queue itself.
      prisma.leaveRequest.count({ where: pendingApprovalWhere(me) }),
      planYear
        ? prisma.medicalCommitment.findFirst({
            // Committed for THIS cycle — including a term committed last cycle that still charges it.
            where: { userId: me.id, OR: [{ cycleCharges: { some: { planYearId: planYear.id } } }, { planYearId: planYear.id }] },
            select: { id: true },
          })
        : Promise.resolve(null),
      prisma.announcement.findMany({ orderBy: { publishedAt: "desc" }, take: 5 }),
      prisma.user.count({ where: { reportsToId: me.id, status: "ACTIVE" } }),
      getDisabledModules(),
    ]);

  const on = (key: string) => !disabled.has(key);

  const onbPct = assignedCount === 0 ? 100 : Math.round((completedCount / assignedCount) * 100);
  const onboardingDone = assignedCount > 0 && completedCount >= assignedCount;

  const benefitsMsg = !planYear
    ? "Selection not open."
    : medicalCommitment
    ? "Medical committed — claim benefits anytime."
    : "Open — commit medical & claim as you spend.";

  // Card visibility: disabled modules never show. Benefits + Time-Off are the primary
  // cards; Approvals only for people with reports; Onboarding hides when complete.
  const showOnboarding = on("onboarding") && !onboardingDone;
  const showBenefits = on("benefits") && !!planYear;
  const showTimeOff = on("timeoff");
  const showApprovals = on("timeoff") && hasReports > 0;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Dashboard</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Welcome, {firstName}</h1>
      <p className="mt-2 text-muted">Your {brand.companyName} home.</p>

      <div className="ff-stagger mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showBenefits ? <Tile title="Benefits" href="/benefits">{benefitsMsg}</Tile> : null}

        {showTimeOff ? (
          <Tile title="Time-Off" href="/time-off">
            {myPending > 0 ? `${myPending} request(s) pending.` : "Request time off."}
          </Tile>
        ) : null}

        {showApprovals ? (
          <Tile title="Approvals" href="/time-off">
            {approvals > 0 ? `${approvals} time-off request(s) awaiting you.` : "No pending approvals."}
          </Tile>
        ) : null}

        {/* Contextual: only while onboarding is still in progress */}
        {showOnboarding ? (
          <Tile title="Onboarding" href="/onboarding">
            {completedCount} of {assignedCount} done · {onbPct}%
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-navy-50">
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${onbPct}%` }} />
            </div>
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
    </div>
  );
}
