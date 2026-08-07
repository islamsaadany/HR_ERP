import { requireAdmin } from "@/lib/roles";
import { EmployeeImportForm } from "@/components/admin/EmployeeImportForm";
import { BackLink } from "@/components/admin/BackLink";

export const dynamic = "force-dynamic";

export default async function ImportEmployeesPage() {
  await requireAdmin();

  return (
    <div>
      <BackLink href="/admin/employees" label="Employees" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Registry
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Import employees</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Upload your employee spreadsheet saved as a CSV. Each row is added or
        updated (matched by email). Dates are read in the sheet&rsquo;s own
        formats; anything the app has to guess or can&rsquo;t read is listed
        after import so you can fix it in the person&rsquo;s profile.
      </p>

      <div className="mt-6 rounded-xl border border-line bg-paper p-5 text-sm text-ink">
        <p className="font-medium">Columns the importer reads</p>
        <p className="mt-2 text-muted">
          Name, Department, Date of Hiring, Title, Contract Type, Email, Phone
          Number, Date of Birth, Marital Status, Number of Kids, and
          &ldquo;Kid (1) / Kid (2) Date of Birth&rdquo;. Only Name and Email are
          required; everything else is optional. Extra columns are ignored.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
          <li>Contract Type: &ldquo;Full Time&rdquo; / &ldquo;Part Time&rdquo;.</li>
          <li>
            Tenure band is calculated from Date of Hiring (people under 6 months
            are flagged).
          </li>
          <li>
            Ambiguous numeric dates like 4/5/1980 are read day-first (4 May) and
            flagged for you to verify.
          </li>
          <li>
            Non-company emails are imported and visible in the directory but
            can&rsquo;t sign in yet.
          </li>
        </ul>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <p className="font-medium text-ink">Start from your current data</p>
        <p className="mt-1 text-sm text-muted">
          Download a sheet pre-filled with everyone you have now (in this exact format), fix the blank
          or wrong cells, and re-upload below to update all entries. Rows are matched by email.
        </p>
        <a
          href="/api/admin/employees/export"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
        >
          ⬇ Download current employees (CSV)
        </a>
        <p className="mt-2 text-xs text-muted">
          Note: role, status, and salary aren&rsquo;t changed by import — set those in a person&rsquo;s profile.
        </p>
      </div>

      <EmployeeImportForm />
    </div>
  );
}
