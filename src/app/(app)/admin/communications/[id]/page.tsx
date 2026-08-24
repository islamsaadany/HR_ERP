import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { formatDate } from "@/lib/labels";
import { BackLink } from "@/components/admin/BackLink";
import { CHIP } from "@/components/learning/ui";
import { AnnouncementEditor } from "@/components/comms/AnnouncementEditor";
import type { FieldSpec } from "@/components/audience/AudienceFields";
import { audienceFor, deliveriesFor, labelChoices } from "@/lib/comms/queries";
import { getCommsSettings } from "@/lib/comms/settings";
import { reachedUserIds } from "@/lib/audience/reach";
import {
  AUDIENCE_FIELDS,
  AUDIENCE_FIELD_HINT,
  AUDIENCE_FIELD_LABEL,
  TENURE_BAND_LABEL,
  type AudienceField,
} from "@/lib/audience/types";

export const dynamic = "force-dynamic";

export default async function AnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const message = await prisma.message.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      state: true,
      subject: true,
      body: true,
      ctaLabel: true,
      ctaHref: true,
      sentAt: true,
      recipientCount: true,
      sentBy: { select: { name: true } },
    },
  });
  if (!message) notFound();

  // A sent message is a record: it shows what went, to whom, and what failed. Nothing to edit.
  if (message.state === "SENT") {
    const deliveries = await deliveriesFor(id);
    const failed = deliveries.filter((d) => d.state === "FAILED");
    return (
      <div>
        <BackLink href="/admin/communications" label="Communications" />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-3xl text-ink">{message.subject}</h1>
          <span className={CHIP.done}>Sent</span>
        </div>
        <p className="mt-1 text-muted">
          {message.recipientCount} {message.recipientCount === 1 ? "person" : "people"}
          {message.sentAt ? <> · {formatDate(message.sentAt)}</> : null}
          {message.sentBy?.name ? <> · sent by {message.sentBy.name}</> : null}
        </p>

        {failed.length > 0 ? (
          <div className="mt-4 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <b>{failed.length} could not be delivered.</b> The rest arrived — a failure here names
            who, so you know exactly who to reach another way.
          </div>
        ) : null}

        <div className="ff-data-scroll mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="ff-data-table w-full text-[13px]">
            <thead>
              <tr>
                <th className="px-2.5 py-2 text-left">Person</th>
                <th className="px-2.5 py-2 text-left">Address it went to</th>
                <th className="px-2.5 py-2 text-left">Branded as</th>
                <th className="px-2.5 py-2 text-left">Delivery</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td className="px-2.5 py-2">{d.user.name}</td>
                  <td className="px-2.5 py-2 text-muted">{d.email}</td>
                  <td className="px-2.5 py-2 text-muted">{d.businessUnit?.name ?? "—"}</td>
                  <td className="px-2.5 py-2">
                    {d.state === "ACCEPTED" ? (
                      <span className={CHIP.done}>Accepted</span>
                    ) : d.state === "FAILED" ? (
                      <span className={CHIP.danger} title={d.error ?? undefined}>
                        Failed
                      </span>
                    ) : (
                      <span className={CHIP.muted}>Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] text-muted">
          &ldquo;Accepted&rdquo; means the mail provider took it. What happens after that — a full
          mailbox, a spam folder — is outside what this platform can know.
        </p>
      </div>
    );
  }

  const [audience, settings, departments, businessUnits, groups, employees, managers] =
    await Promise.all([
      audienceFor(id),
      getCommsSettings(),
      prisma.department.findMany({ orderBy: { order: "asc" }, select: { name: true } }),
      prisma.businessUnit.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.learnerGroup.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, _count: { select: { members: true } } },
      }),
      prisma.user.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, department: true },
      }),
      prisma.user.findMany({
        where: { status: "ACTIVE", reports: { some: { status: "ACTIVE" } } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

  const labels = await labelChoices(audience.rows);
  const chosenValues = (field: AudienceField) =>
    new Set(audience.rows.filter((r) => r.field === field).map((r) => r.value));

  // Somebody the message ALREADY reaches is offered but not tickable — adding them again would
  // make a second row that changes nothing, then a puzzle about why removing one did nothing.
  const alreadyReached = new Set(
    await reachedUserIds(audience.rows.map(({ field, value }) => ({ field, value })))
  );

  const optionsFor = (field: AudienceField) => {
    const chosen = chosenValues(field);
    switch (field) {
      case "DEPARTMENT":
        return departments.filter((d) => !chosen.has(d.name)).map((d) => ({ value: d.name, label: d.name }));
      case "BUSINESS_UNIT":
        return businessUnits.filter((b) => !chosen.has(b.id)).map((b) => ({ value: b.id, label: b.name }));
      case "GROUP":
        return groups
          .filter((g) => !chosen.has(g.id))
          .map((g) => ({ value: g.id, label: g.name, reach: g._count.members }));
      case "PERSON":
        return employees
          .filter((e) => !chosen.has(e.id))
          .map((e) => ({
            value: e.id,
            label: e.name,
            hint: e.department,
            reach: null,
            covered: alreadyReached.has(e.id),
          }));
      case "REPORTS_TO":
        return managers.filter((m) => !chosen.has(m.id)).map((m) => ({ value: m.id, label: m.name }));
      case "TENURE_BAND":
        return Object.entries(TENURE_BAND_LABEL)
          .filter(([v]) => !chosen.has(v))
          .map(([value, label]) => ({ value, label }));
      case "EMPLOYMENT_TYPE":
        return [
          { value: "FULL_TIME", label: "Full-time" },
          { value: "PART_TIME", label: "Part-time" },
        ].filter((o) => !chosen.has(o.value));
    }
  };

  const displayLabel = (field: AudienceField, value: string) => {
    if (field === "TENURE_BAND") return TENURE_BAND_LABEL[value] ?? value;
    if (field === "EMPLOYMENT_TYPE") return value === "FULL_TIME" ? "Full-time" : "Part-time";
    return labels.get(value) ?? value;
  };

  const fields: FieldSpec[] = AUDIENCE_FIELDS.map((field) => ({
    field,
    label: AUDIENCE_FIELD_LABEL[field],
    hint: AUDIENCE_FIELD_HINT[field],
    searchable: field === "PERSON" || (optionsFor(field)?.length ?? 0) > 8,
    chosen: audience.rows
      .filter((r) => r.field === field)
      .map((r) => ({
        rowId: r.id,
        label: displayLabel(field, r.value),
        reach: field === "PERSON" ? null : r.reach,
      })),
    options: optionsFor(field) ?? [],
  }));

  return (
    <div>
      <BackLink href="/admin/communications" label="Communications" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="font-serif text-3xl text-ink">{message.subject}</h1>
        <span className={CHIP.attention}>Draft</span>
        <Link href="/admin/communications" className="text-sm text-muted hover:text-ink">
          All messages
        </Link>
      </div>

      <AnnouncementEditor
        messageId={id}
        initial={{
          subject: message.subject,
          body: message.body,
          ctaLabel: message.ctaLabel ?? "",
          ctaHref: message.ctaHref ?? "",
        }}
        fields={fields}
        totalReach={audience.total}
        units={[
          // First, deliberately: somebody with no business unit is a real case and the one most
          // likely to look wrong if nobody previews it.
          { id: "", name: "Somebody with no unit" },
          ...businessUnits,
        ]}
        emailEnabled={settings.emailEnabled}
      />
    </div>
  );
}
