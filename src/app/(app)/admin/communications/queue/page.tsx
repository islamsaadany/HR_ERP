import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { BackLink } from "@/components/admin/BackLink";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DraftRow, type DraftItem } from "@/components/comms/DraftRow";

export const dynamic = "force-dynamic";

/**
 * HR's view of every waiting congratulation (spec 039 US4).
 *
 * The safety net: a manager on holiday otherwise means a birthday silently missed, and nobody
 * finds out until the person mentions it. HR can send any of these — the record shows who did.
 */
export default async function CommsQueuePage() {
  await requireAdmin();

  const drafts = await prisma.message.findMany({
    where: { state: "DRAFT", kind: { in: ["BIRTHDAY", "WORK_ANNIVERSARY"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      subject: true,
      body: true,
      assignedTo: { select: { name: true } },
      subjectUser: {
        select: { name: true, businessUnit: { select: { name: true, primaryColor: true } } },
      },
      occasion: { select: { occasionDate: true, years: true } },
    },
  });

  const items: DraftItem[] = drafts.map((d) => ({
    id: d.id,
    kind: d.kind as DraftItem["kind"],
    subject: d.subject,
    body: d.body,
    personName: d.subjectUser?.name ?? "Someone",
    unitName: d.subjectUser?.businessUnit?.name ?? null,
    unitColor: d.subjectUser?.businessUnit?.primaryColor ?? null,
    occasionDate: d.occasion?.occasionDate ?? null,
    years: d.occasion?.years ?? null,
    assigneeName: d.assignedTo?.name ?? null,
  }));

  return (
    <div>
      {/* Managers send from here while this sits open. */}
      <AutoRefresh />
      <BackLink href="/admin/communications" label="Communications" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Communications
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Messages waiting to send</h1>
      <p className="mt-1 max-w-[70ch] text-muted">
        Every congratulation the platform has prepared, and who it is waiting on. You can send any
        of them — useful when a manager is away, because a message that misses its day is closed
        rather than sent late.
      </p>

      {items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          Nothing waiting. Birthdays and joining anniversaries appear here a few days before the
          day, drawn from the dates on people&rsquo;s records.
        </p>
      ) : (
        <ul className="mt-5 max-w-[820px] space-y-2">
          {items.map((item) => (
            <DraftRow key={item.id} item={item} canPreview />
          ))}
        </ul>
      )}
    </div>
  );
}
