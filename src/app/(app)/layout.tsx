import { redirect } from "next/navigation";
import { requireUser, getImpersonation } from "@/lib/roles";
import { isAdmin, isFinance, canAccessIncentive } from "@/lib/roles";
import { getDisabledHrefs } from "@/lib/modules";
import { getBrand } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";

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

  return (
    <AppShell
      name={user.name}
      email={user.email}
      showAdmin={isAdmin(user.role)}
      showIncentive={canAccessIncentive(user.role)}
      showPayments={isFinance(user.role)}
      hiddenNav={hiddenNav}
      navBadges={{ "/time-off": timeoffBadge }}
      companyName={brand.companyName}
      shortName={brand.shortName}
      logoUrl={brand.logoUrl}
      impersonation={
        impersonation.isImpersonating
          ? { targetName: impersonation.targetName, targetTitle: impersonation.targetTitle }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
