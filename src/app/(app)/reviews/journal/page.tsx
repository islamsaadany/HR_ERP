import Link from "next/link";
import { requireRealUser } from "@/lib/reviews/access";
import { requireModuleEnabled } from "@/lib/modules";
import { formatDate } from "@/lib/labels";
import { myJournal, carriedJournalRefs } from "@/lib/reviews/queries";
import { JournalBoard } from "@/components/reviews/JournalBoard";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const me = await requireRealUser();
  await requireModuleEnabled("reviews");

  // Scoped to the author at the query. There is no version of this read that
  // takes somebody else's id — see lib/reviews/queries.ts.
  const [entries, carried] = await Promise.all([
    myJournal(me.id),
    // Whether a flagged note has been raised is DERIVED from the 1:1 note or
    // sheet item that references it — never a stored flag that could disagree.
    carriedJournalRefs(me.id),
  ]);

  return (
    <div className="max-w-3xl">
      <Link href="/reviews" className="text-xs font-semibold text-navy-600 hover:underline">
        ← Reviews
      </Link>

      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Reviews &amp; 1:1s
      </p>
      <h1 className="mt-1 font-serif text-2xl text-navy-900">Your journal</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Write things down as they happen — nobody remembers March in June. Flag one with the ⚑
        and it waits for you at your next 1:1 and on your review sheet.
      </p>

      <p className="mt-4 inline-block rounded-full border border-navy-200 bg-navy-50 px-3 py-1 text-[11px] font-bold text-navy-700">
        🔒 Only you can ever read this
      </p>

      <div className="mt-5">
        <JournalBoard
          entries={entries.map((e) => ({
            id: e.id,
            body: e.body,
            section: e.section,
            occurredOnLabel: formatDate(e.occurredOn),
            occurredOnISO: e.occurredOn.toISOString().slice(0, 10),
            raiseIt: e.raiseIt,
            carried: (() => {
              const ref = carried.get(e.id);
              return ref ? { label: ref.label, when: formatDate(ref.when) } : null;
            })(),
          }))}
        />
      </div>

      <p className="mt-6 max-w-[70ch] text-xs leading-relaxed text-muted">
        Not your manager, not HR, not a Super User — and not a Super User viewing as you:
        this whole module is closed while anyone is impersonating. Anything you have already
        brought onto a review sheet stays there if you edit or delete the note here.
      </p>
    </div>
  );
}
