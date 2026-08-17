import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ageFromDob, yearsOfService } from "@/lib/derive";
import {
  EMPLOYMENT_TYPE_LABEL,
  MARITAL_STATUS_LABEL,
  ROLE_LABEL,
  tenureBandDisplay,
  formatDate,
} from "@/lib/labels";
import { uploadMyDocument, deleteMyDocument } from "./documents-actions";
import {
  updateOwnPhone,
  updateOwnLegalName,
  updateOwnLegalNameAr,
  updateOwnNationalId,
} from "./request-actions";
import { ChangePasswordCard } from "@/components/ChangePasswordCard";
import { SelfEditField } from "@/components/profile/SelfEditField";
import { RequestableSection } from "@/components/profile/RequestableSection";
import { ChangeRequestPanel, type PanelRequest, type RequestRow } from "@/components/profile/ChangeRequestPanel";
import {
  openRequestFor,
  lastDecidedRequestFor,
  fieldDescriptors,
} from "@/lib/profile/change-requests";
import { displayValue, fieldLabel, currentValue } from "@/lib/profile/requestable";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-line last:border-b-0">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-ink">{value ?? "—"}</div>
    </div>
  );
}

/** The one ownership pill (unified attributes, 2026-08-17): HR alone edits this card. */
function ManagedByHr() {
  return (
    <span className="rounded-full bg-navy-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-navy-700">
      Managed by HR
    </span>
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

  // Spec 029. The "current" side of every row is read HERE, not stored on the request, so a
  // record HR edited while the request sat in the queue is never misrepresented (FR-010).
  const [openReq, decidedReq] = await Promise.all([
    openRequestFor(me.id),
    lastDecidedRequestFor(me.id),
  ]);
  const toPanel = (
    req: Awaited<ReturnType<typeof openRequestFor>>
  ): PanelRequest | null =>
    req
      ? {
          id: req.id,
          submittedAt: formatDate(req.createdAt) ?? "",
          reason: req.reason,
          rows: req.fields.map<RequestRow>((f) => ({
            id: f.id,
            label: fieldLabel(f.field),
            was: displayValue(f.field, currentValue(f.field, me)),
            now: displayValue(f.field, f.requestedValue),
            status: f.status,
            reason: f.decisionReason,
            decidedBy: f.decidedBy?.name ?? null,
            decidedAt: f.decidedAt ? formatDate(f.decidedAt) : null,
          })),
        }
      : null;

  const age = ageFromDob(me.dateOfBirth);
  const yos = yearsOfService(me.startDate);
  const descriptors = fieldDescriptors(me);

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

      {/* Public / contact — HR-managed card with two self-edit exceptions (phone, legal name) */}
      <section className="mt-8 rounded-xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-ink">Contact</h2>
          <ManagedByHr />
        </div>
        <Field label="Email" value={me.email} />
        <SelfEditField
          label="Phone"
          name="phone"
          type="tel"
          value={me.phone}
          action={updateOwnPhone}
        />
        <SelfEditField
          label="Legal name (English)"
          name="legalName"
          value={me.legalName}
          placeholder="e.g. Omar Ahmed Mahmoud Hassan"
          hint="Your full official name in English, as on your passport or ID. Visible to you and HR only."
          action={updateOwnLegalName}
        />
        <SelfEditField
          label="Legal name (Arabic)"
          name="legalNameAr"
          value={me.legalNameAr}
          placeholder="مثال: عمر أحمد محمود حسن"
          hint="Your full official name in Arabic, exactly as written on your national ID. Visible to you and HR only."
          dir="rtl"
          lang="ar"
          action={updateOwnLegalNameAr}
        />
        <Field label="Department" value={me.department} />
        <Field label="Title" value={me.title} />
      </section>

      {/* Employment (read-only to employee) */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-ink">Employment</h2>
          <ManagedByHr />
        </div>
        <Field
          label="Employment type"
          value={me.employmentType ? EMPLOYMENT_TYPE_LABEL[me.employmentType] : "—"}
        />
        <Field
          label="Tenure band"
          value={tenureBandDisplay(me.startDate)}
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

      {/* Personal — HR-managed, correctable by request from the card itself (spec 029) */}
      <RequestableSection
        title="Personal"
        descriptors={descriptors.filter((d) => d.group === "Personal")}
        hasOpenRequest={Boolean(openReq)}
      >
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
            me.dependants.length === 0 ? (
              "None"
            ) : (
              <div className="mt-1">
                {me.dependants.map((d) => {
                  const a = ageFromDob(d.dateOfBirth);
                  return (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-baseline gap-2 border-b border-dashed border-line py-2 last:border-b-0"
                    >
                      <span className="text-sm font-semibold text-ink">
                        {d.name ?? (d.kind === "SPOUSE" ? "Spouse" : "Child")}
                      </span>
                      <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-navy-700">
                        {d.kind === "SPOUSE" ? "Spouse" : "Child"}
                      </span>
                      <span className="text-sm text-muted">
                        {formatDate(d.dateOfBirth)}
                        {a !== null ? ` · ${a} yrs` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )
          }
        />
      </RequestableSection>

      {/* Emergency contact — HR-managed, correctable by request from the card itself (spec 029) */}
      <RequestableSection
        title="Emergency contact"
        descriptors={descriptors.filter((d) => d.group === "Emergency contact")}
        hasOpenRequest={Boolean(openReq)}
      >
        <Field label="Name" value={me.emergencyContactName} />
        <Field label="Relationship" value={me.emergencyContactRelationship} />
        <Field label="Phone" value={me.emergencyContactPhone} />
      </RequestableSection>

      {/* Change requests (spec 029) — the receipt: pending state, withdraw, HR's decisions. */}
      <ChangeRequestPanel
        open={toPanel(openReq)}
        decided={openReq ? null : toPanel(decidedReq)}
      />

      {/* My Documents (spec 001 · US6) */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-serif text-lg text-ink">My Documents</h2>
        <p className="mt-1 text-sm text-muted">
          Your personal documents (ID, certificates, contract). Only you and HR can see these.
        </p>

        {/* National ID number — self-edited like the legal names (2026-08-17). */}
        <div className="mt-2">
          <SelfEditField
            label="National ID"
            name="nationalId"
            value={me.nationalId}
            placeholder="e.g. 29105141234567"
            hint="Your national ID number. Visible to you and HR only."
            action={updateOwnNationalId}
          />
        </div>

        {docError ? (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {docError}
          </p>
        ) : null}

        <form action={uploadMyDocument} encType="multipart/form-data" className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label htmlFor={"profile-title"} className="block text-xs uppercase tracking-wide text-muted mb-1">
              Title (optional)
            </label>
            <input id={"profile-title"}
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
