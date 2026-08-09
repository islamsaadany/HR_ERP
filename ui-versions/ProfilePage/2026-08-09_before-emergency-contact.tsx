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
import { uploadMyDocument, deleteMyDocument } from "./documents-actions";
import { ChangePasswordCard } from "@/components/ChangePasswordCard";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-line last:border-b-0">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-ink">{value ?? "—"}</div>
    </div>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ docError?: string }>;
}) {
  const sessionUser = await requireUser();
  const { docError } = await searchParams;
  const me = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: {
      reportsTo: { select: { name: true, title: true } },
      dependants: { orderBy: { dateOfBirth: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
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

      {/* My Documents (spec 001 · US6) */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-serif text-lg text-ink">My Documents</h2>
        <p className="mt-1 text-sm text-muted">
          Your personal documents (ID, certificates, contract). Only you and HR can see these.
        </p>

        {docError ? (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {docError}
          </p>
        ) : null}

        <form action={uploadMyDocument} encType="multipart/form-data" className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1">
              Title (optional)
            </label>
            <input
              name="title"
              placeholder="e.g. National ID"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
            />
          </div>
          <input
            name="file"
            type="file"
            required
            className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-navy-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-navy-700"
          />
          <button
            type="submit"
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
          >
            Upload
          </button>
        </form>

        <ul className="mt-5 divide-y divide-line">
          {me.documents.length === 0 ? (
            <li className="py-3 text-sm text-muted">No documents yet.</li>
          ) : (
            me.documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <a
                    href={`/api/documents/${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-navy-700 hover:text-navy-900 hover:underline"
                  >
                    {doc.title}
                  </a>
                  <div className="text-xs text-muted">
                    {formatDate(doc.createdAt)}
                    {doc.sizeBytes
                      ? ` · ${Math.max(1, Math.round(doc.sizeBytes / 1024))} KB`
                      : ""}
                  </div>
                </div>
                <form action={deleteMyDocument}>
                  <input type="hidden" name="id" value={doc.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-red-300 hover:text-red-600"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Sign-in password (self-service) */}
      <section className="mt-6">
        <ChangePasswordCard hasPassword={Boolean(me.passwordHash)} />
      </section>
    </div>
  );
}
