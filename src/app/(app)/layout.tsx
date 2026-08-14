import { redirect } from "next/navigation";
import { requireUser, getImpersonation } from "@/lib/roles";
import { isAdmin, isFinance, canAccessIncentive } from "@/lib/roles";
import { getDisabledHrefs } from "@/lib/modules";
import { getBrand } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";
import { QueryToast } from "@/components/QueryToast";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const impersonation = await getImpersonation();

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

  // In-app cue (FR-014): count the user's decided-but-unseen time-off requests.
  // Guarded so a pre-migration DB (no decisionSeenAt column) never breaks the shell.
  let timeoffBadge = 0;
  try {
    timeoffBadge = await prisma.leaveRequest.count({
      where: {
        userId: user.id,
        status: { in: ["APPROVED", "DECLINED"] },
        decisionSeenAt: null,
      },
    });
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
        select: { employeeId: true },
      });
      if (me?.employeeId) {
        const others = await prisma.user.findMany({
          where: { employeeId: me.employeeId, status: "ACTIVE", NOT: { id: user.id } },
          select: { email: true, name: true, businessUnit: { select: { name: true } } },
          orderBy: { name: "asc" },
          take: 10,
        });
        linkedAccounts = others.map((o) => ({
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
      showAdmin={isAdmin(user.role)}
      showIncentive={canAccessIncentive(user.role)}
      showPayments={isFinance(user.role)}
      hiddenNav={hiddenNav}
      navBadges={{ "/time-off": timeoffBadge }}
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
      <QueryToast />
    </AppShell>
  );
}
