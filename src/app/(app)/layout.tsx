import { redirect } from "next/navigation";
import { requireUser, getImpersonation } from "@/lib/roles";
import { hasLearningAppointment } from "@/lib/learning/managers";
import { isAdmin, isFinance, canAccessIncentive } from "@/lib/roles";
import { getDisabledHrefs } from "@/lib/modules";
import { getBrand } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { isLinked, linkKey } from "@/lib/switch-account";
import { AppShell } from "@/components/AppShell";
import { QueryToast } from "@/components/QueryToast";
import { DataRequestLayer } from "@/components/profile/DataRequestLayer";
import { dataRequestSummaryFor, type DataRequestSummary } from "@/lib/profile/campaigns";
import { timeOffBadgeCount } from "@/lib/leave-queries";
import { TimeOffBadgeSync } from "@/components/TimeOffBadgeSync";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const impersonation = await getImpersonation();

  // Two different doors, never both (spec 038 follow-up, 2026-08-22):
  //   • HR Admins and Super Users get "Admin", exactly as they always have;
  //   • an appointed learning manager gets "Manage Learning", straight to the module, because the
  //     admin home would be one row they had just come from.
  const hrAdmin = isAdmin(user.role);
  const showManageLearning = !hrAdmin && (await hasLearningAppointment(user.id));

  // The count on that entry: resources employees have suggested and nobody has reviewed. It is the
  // only thing in Learning that waits on a person — a badge whose number never reaches zero stops
  // being read. Wrapped, because before migration 064 this table does not exist.
  // Congratulations waiting for THIS person to send. Wrapped, because before migration 067 the
  // table does not exist — and a shell that cannot render is worse than a missing count.
  let messagesWaiting = 0;
  try {
    messagesWaiting = await prisma.message.count({
      where: {
        assignedToId: user.id,
        state: "DRAFT",
        kind: { in: ["BIRTHDAY", "WORK_ANNIVERSARY"] },
      },
    });
  } catch {
    messagesWaiting = 0;
  }

  let learningBadge = 0;
  if (showManageLearning) {
    try {
      learningBadge = await prisma.courseResource.count({ where: { status: "PENDING" } });
    } catch {
      learningBadge = 0;
    }
  }

  // Gate anyone on a temporary password to /set-password until they choose their own.
  // Guarded so a pre-migration DB (no mustChangePassword column) never breaks the shell.
  // Skipped while impersonating — the real Super User already passed their own gate,
  // and we must not redirect them based on the target employee's flag.
  if (!impersonation.isImpersonating) {
    let mustChangePassword = false;
    try {
      const flag = await prisma.user.findUnique({
        where: { id: user.id },
        select: { mustChangePassword: true },
      });
      mustChangePassword = !!flag?.mustChangePassword;
    } catch {
      mustChangePassword = false;
    }
    if (mustChangePassword) redirect("/set-password");
  }

  const hiddenNav = await getDisabledHrefs();
  const brand = await getBrand();

  // Data request campaigns (spec 033): what the popup shows + the sidebar count.
  // Guarded so a pre-migration DB (no campaign tables) never breaks the shell.
  let dataRequests: DataRequestSummary | null = null;
  try {
    dataRequests = await dataRequestSummaryFor(user.id);
  } catch {
    dataRequests = null;
  }

  // Time-Off badge first frame (spec 005 FR-014 + spec 035 FR-006): the user's unseen
  // decisions PLUS pending requests awaiting them as the current manager. Kept live after
  // this render by TimeOffBadgeSync (layouts don't re-render on client navigation).
  // Guarded so a pre-migration DB never breaks the shell.
  let timeoffBadge = 0;
  try {
    timeoffBadge = await timeOffBadgeCount(user);
  } catch {
    timeoffBadge = 0;
  }

  // Linked accounts (spec 025): other active accounts sharing this person's
  // Employee ID, for the "Switch account" control. Suppressed while impersonating
  // (that's the actor's context, not the person's own accounts). Guarded for an
  // un-migrated DB (no employeeId column).
  let linkedAccounts: { email: string; label: string }[] = [];
  if (!impersonation.isImpersonating) {
    try {
      const me = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, employeeId: true, status: true },
      });
      // Switching is now password-less (spec 026), so the list of accounts on
      // offer must never be wider than what the server will actually permit.
      // Candidates are fetched on the indexed Employee ID, then passed through
      // the SAME `isLinked` predicate the switch authorises with — so the offer
      // and the permission cannot drift.
      const key = linkKey(me?.employeeId);
      if (me && key) {
        const others = await prisma.user.findMany({
          where: { employeeId: me.employeeId, status: "ACTIVE", NOT: { id: user.id } },
          select: {
            id: true,
            email: true,
            name: true,
            employeeId: true,
            status: true,
            businessUnit: { select: { name: true } },
          },
          orderBy: { name: "asc" },
          take: 10,
        });
        linkedAccounts = others
          .filter((o) => isLinked(me, o))
          .map((o) => ({
            email: o.email,
            label: o.businessUnit?.name ? `${o.name} · ${o.businessUnit.name}` : o.name,
          }));
      }
    } catch {
      linkedAccounts = [];
    }
  }

  return (
    <AppShell
      name={user.name}
      email={user.email}
      showAdmin={hrAdmin}
      showManageLearning={showManageLearning}
      messagesWaiting={messagesWaiting}
      showIncentive={canAccessIncentive(user.role)}
      showPayments={isFinance(user.role)}
      hiddenNav={hiddenNav}
      navBadges={{ "/time-off": timeoffBadge, "/admin/learning": learningBadge }}
      dataRequestCount={dataRequests?.pendingCount ?? 0}
      companyName={brand.platformName}
      shortName={brand.shortName}
      logoUrl={brand.logoUrl}
      linkedAccounts={linkedAccounts}
      impersonation={
        impersonation.isImpersonating
          ? { targetName: impersonation.targetName, targetTitle: impersonation.targetTitle }
          : null
      }
    >
      {children}
      {/* Always mounted: the popup freezes its field list at open, so it must survive the
          re-render after the LAST answer (summary null) until the employee presses Finish. */}
      <DataRequestLayer groups={dataRequests?.groups ?? []} />
      <TimeOffBadgeSync />
      <QueryToast />
    </AppShell>
  );
}
