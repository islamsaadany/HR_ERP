import { requireUser } from "@/lib/roles";
import { isAdmin, isSuperUser } from "@/lib/roles";
import { getDisabledHrefs } from "@/lib/modules";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const hiddenNav = await getDisabledHrefs();
  return (
    <AppShell
      name={user.name}
      email={user.email}
      showAdmin={isAdmin(user.role)}
      showIncentive={isSuperUser(user.role)}
      hiddenNav={hiddenNav}
    >
      {children}
    </AppShell>
  );
}
