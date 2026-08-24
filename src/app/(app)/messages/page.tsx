import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DraftRow, type DraftItem } from "@/components/comms/DraftRow";

export const dynamic = "force-dynamic";

/**
 * A manager's own waiting messages (spec 039 US2, gate G2 approved 2026-08-24).
 *
 * The same drafts HR sees on `/admin/communications/queue`, and the same row component — this is a
 * SHORTCUT to them, not a new capability and not a new permission. What a person sees here is
 * exactly what is assigned to them, which the server already enforces on every write.
 *
 * No `requireAdmin`, deliberately: the whole point is that an ordinary employee who happens to
 * manage somebody can reach their own queue. The query is scoped to `assignedToId = me`, so there
 * is nothing here to widen.
 *
 * And no module gate. Communications is deliberately NOT in `MODULES`: a listed module gets a nav
 * entry for everybody, and this page is meant to appear only for the person who has something
 * waiting. The release switch that matters already exists — the master email toggle at
 * Admin → Notifications — and with it off nothing can be sent from here anyway.
 */
export default async function MyMessagesPage() {
  const me = await requireUser();

  const drafts = await prisma.message.findMany({
    where: {
      assignedToId: me.id,
      state: "DRAFT",
      kind: { in: ["BIRTHDAY", "WORK_ANNIVERSARY"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      subject: true,
      body: true,
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
    // Deliberately no assignee line: a manager already knows these are theirs. HR's queue shows it
    // because HR is looking across everybody's.
  }));

  return (
    <div>
      {/* HR can send one of these from their queue while this sits open. */}
      <AutoRefresh />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Your team</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Messages to send</h1>
      <p className="mt-1 max-w-[64ch] text-muted">
        Written for you already. Read them, change anything that doesn&rsquo;t sound like you, and
        send. Nothing goes out on its own.
      </p>

      {items.length === 0 ? (
        <p className="mt-6 max-w-[820px] rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          Nothing waiting. A birthday or joining anniversary in your team appears here a few days
          beforehand.
        </p>
      ) : (
        <ul className="mt-5 max-w-[820px] space-y-2">
          {items.map((item) => (
            // No preview link: the preview route is an admin surface, and a manager does not need
            // one to read the words they are about to send.
            <DraftRow key={item.id} item={item} canPreview={false} />
          ))}
        </ul>
      )}
    </div>
  );
}
