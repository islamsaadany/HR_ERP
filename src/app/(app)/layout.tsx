import { requireUser } from "@/lib/roles";
import { isAdmin, isSuperUser } from "@/lib/roles";
import { getDisabledHrefs } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const hiddenNav = await getDisabledHrefs();

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
      showIncentive={isSuperUser(user.role)}
      hiddenNav={hiddenNav}
      navBadges={{ "/time-off": timeoffBadge }}
    >
      {children}
    </AppShell>
  );
}
