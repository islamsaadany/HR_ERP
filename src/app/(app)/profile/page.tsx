import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ageFromDob, yearsOfService } from "@/lib/derive";
import {
  EMPLOYMENT_TYPE_LABEL,
  MARITAL_STATUS_LABEL,
  ROLE_LABEL,
  TENURE_BAND_LABEL,
  formatDate,
} from "@/lib/labels";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-line last:border-b-0">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-ink">{value ?? "—"}</div>
    </div>
  );
}

export default async function ProfilePage() {
  const sessionUser = await requireUser();
  const me = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: {
      reportsTo: { select: { name: true, title: true } },
      dependants: { orderBy: { dateOfBirth: "asc" } },
    },
  });

  if (!me) {
    return <p className="text-muted">Profile not found.</p>;
  }

  const age = ageFromDob(me.dateOfBirth);
  const yos = yearsOfService(me.startDate);

  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        My Profile
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">{me.name}</h1>
      <p className="mt-1 text-muted">
        {me.title ?? "—"}
        {me.department ? ` · ${me.department}` : ""}
      </p>

      {/* Public / contact */}
      <section className="mt-8 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-serif text-lg text-ink">Contact</h2>
        <Field label="Email" value={me.email} />
        <Field label="Phone" value={me.phone} />
        <Field label="Department" value={me.department} />
        <Field label="Title" value={me.title} />
      </section>

      {/* Employment (read-only to employee) */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg text-ink">Employment</h2>
          <span className="text-xs text-muted">Managed by HR</span>
        </div>
        <Field
          label="Employment type"
          value={me.employmentType ? EMPLOYMENT_TYPE_LABEL[me.employmentType] : "—"}
        />
        <Field
          label="Tenure band"
          value={me.tenureBand ? TENURE_BAND_LABEL[me.tenureBand] : "—"}
        />
        <Field label="Start date" value={formatDate(me.startDate)} />
        <Field
          label="Years of service"
          value={yos !== null ? `${yos}` : "—"}
        />
        <Field label="Role" value={ROLE_LABEL[me.role]} />
        <Field
          label="Reports to"
          value={me.reportsTo ? me.reportsTo.name : "—"}
        />
      </section>

      {/* Personal */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-serif text-lg text-ink">Personal</h2>
        <Field
          label="Date of birth"
          value={
            me.dateOfBirth
              ? `${formatDate(me.dateOfBirth)}${age !== null ? ` · ${age} yrs` : ""}`
              : "—"
          }
        />
        <Field
          label="Marital status"
          value={me.maritalStatus ? MARITAL_STATUS_LABEL[me.maritalStatus] : "—"}
        />
        <Field
          label="Dependants"
          value={
            me.dependants.length === 0
              ? "None"
              : me.dependants
                  .map((d) => {
                    const a = ageFromDob(d.dateOfBirth);
                    return `${d.name ?? "Child"}${a !== null ? ` (${a})` : ""}`;
                  })
                  .join(", ")
          }
        />
      </section>

      {/* My Documents — placeholder for the upload UI (spec 001 · US6) */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-serif text-lg text-ink">My Documents</h2>
        <p className="mt-1 text-sm text-muted">
          Upload and view your personal documents (ID, certificates, contract).
        </p>
        <p className="mt-3 text-xs italic text-muted">Coming soon</p>
      </section>
    </div>
  );
}
