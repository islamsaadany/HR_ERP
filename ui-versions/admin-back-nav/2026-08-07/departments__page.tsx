import Link from "next/link";
import { requireAdmin } from "@/lib/roles";
import { getDepartmentsWithUsage } from "@/lib/departments";
import { DepartmentsManager } from "@/components/admin/DepartmentsManager";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  await requireAdmin();
  const departments = await getDepartmentsWithUsage();

  return (
    <div>
      <Link href="/admin" className="text-sm text-muted hover:text-ink">
        ← Admin
      </Link>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Departments</h1>
      <p className="mt-1 text-muted">
        Manage the list of departments used across employee records, the directory, and filters.
        Add a department, rename one (everyone in it is updated), or remove one that no longer has
        anybody assigned.
      </p>

      <DepartmentsManager departments={departments} />
    </div>
  );
}
