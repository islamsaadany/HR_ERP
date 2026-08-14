import { requireSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { BackLink } from "@/components/admin/BackLink";
import { ImpersonateList } from "@/components/admin/ImpersonateList";

export const dynamic = "force-dynamic";

export default async function AdminImpersonatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireSuperUser();
  const { error } = await searchParams;

  const employees = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      title: true,
      department: true,
      role: true,
      status: true,
    },
  });

  return (
    <div className="max-w-3xl">
      <BackLink href="/admin" label="Admin" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · View as employee</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">View as employee</h1>
      <p className="mt-2 text-muted">
        Open the app exactly as an employee sees it — to walk through it in a demo, or to reproduce an issue they
        reported. A banner stays on screen the whole time, and you can exit back here at any moment. Your own account
        and data are never shown.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <ImpersonateList employees={employees} myId={me.id} />
    </div>
  );
}
