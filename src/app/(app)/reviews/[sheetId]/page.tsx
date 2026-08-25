import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRealUser, isOpen, myHalf, sealStep } from "@/lib/reviews/access";
import { requireModuleEnabled } from "@/lib/modules";
import { formatDate } from "@/lib/labels";
import { sectionsFor } from "@/lib/reviews/agenda";
import {
  quarterLabel,
  quarterMonths,
  quarterRange,
  previousQuarter,
  type Quarter,
} from "@/lib/reviews/quarters";
import { buildSystemPack, packIsEmpty } from "@/lib/reviews/pack";
import {
  sheetForRead,
  visibleItems,
  carryForward,
  myJournal,
  promotedEntryIds,
  agreedOneOnOnesInWindow,
  promotedOneOnOneIds,
  myStrengths,
  carriedJournalRefs,
} from "@/lib/reviews/queries";
import { SystemPackTiles } from "@/components/reviews/SystemPackTiles";
import { SealProgress } from "@/components/reviews/SealProgress";
import { SheetHalf } from "@/components/reviews/SheetHalf";
import { SealedHalf } from "@/components/reviews/SealedHalf";
import { OutcomePanel } from "@/components/reviews/OutcomePanel";
import { CarryForwardBand } from "@/components/reviews/CarryForwardBand";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function ReviewSheetPage({
  params,
}: {
  params: Promise<{ sheetId: string }>;
}) {
  const me = await requireRealUser();
  await requireModuleEnabled("reviews");
  const { sheetId } = await params;

  // Not one of the pair is answered as NOT FOUND: a refusal would confirm the
  // sheet exists, which is itself something only the pair should know.
  const sheet = await sheetForRead(sheetId, me.id);
  if (!sheet) notFound();

  const half = myHalf(sheet, me.id);
  if (!half) notFound();

  const ref = { year: sheet.year, quarter: sheet.quarter as Quarter };
  const open = isOpen(sheet);
  const { start, end } = quarterRange(ref);

  const [items, previous, pack, journal, promotedJournal, oneOnOnes, promotedOneOnOnes, strengths] =
    await Promise.all([
      visibleItems(sheet, me.id),
      carryForward(previousQuarter(ref), sheet.employeeId, sheet.managerId),
      buildSystemPack(sheet.employeeId, ref),
      open ? Promise.resolve([]) : myJournal(me.id),
      promotedEntryIds(sheet.id, me.id),
      open
        ? Promise.resolve([])
        : agreedOneOnOnesInWindow(sheet.employeeId, sheet.managerId, start, end),
      promotedOneOnOneIds(sheet.id, me.id),
      myStrengths(me.id),
    ]);

  // Flagged-and-not-yet-carried, so the bring-over list can float them up.
  const carried = open ? new Map() : await carriedJournalRefs(me.id);

  const counterpart = half === "employee" ? sheet.manager : sheet.employee;
  const myItems = items.filter((i) => i.authorId === me.id);
  const theirItems = items.filter((i) => i.authorId !== me.id);

  const mySubmittedAt =
    half === "employee" ? sheet.employeeSubmittedAt : sheet.managerSubmittedAt;
  const myMetConfirmedAt =
    half === "employee" ? sheet.employeeMetConfirmedAt : sheet.managerMetConfirmedAt;

  const myThemes = (strengths?.themes ?? []).map((t) => ({
    code: t.theme.code,
    name: t.theme.name,
    rank: t.rank,
  }));

  return (
    <div className="max-w-5xl">
      <AutoRefresh />

      <Link href="/reviews" className="text-xs font-semibold text-navy-600 hover:underline">
        ← Reviews
      </Link>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        {half === "employee" ? `With ${counterpart.name}` : `Review of ${counterpart.name}`}
      </p>
      <h1 className="mt-1 font-serif text-2xl text-navy-900">{quarterLabel(ref)}</h1>
      <p className="mt-1 text-sm text-muted">{quarterMonths(ref)}</p>

      <div className="mt-5">
        <SealProgress
          step={sealStep(sheet, me.id, sheet)}
          openedAt={sheet.openedAt}
          bothSubmitted={Boolean(sheet.employeeSubmittedAt && sheet.managerSubmittedAt)}
        />
      </div>

      {previous && (
        <div className="mt-5">
          <CarryForwardBand
            outcome={previous}
            label={quarterLabel(previousQuarter(ref))}
          />
        </div>
      )}

      {!packIsEmpty(pack) && (
        <div className="mt-5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">
            What the platform already knows about this quarter
          </p>
          <SystemPackTiles pack={pack} />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SheetHalf
          sheetId={sheet.id}
          sections={sectionsFor(half)}
          items={myItems.map(serialiseItem)}
          editable={!open}
          submittedAt={mySubmittedAt}
          metConfirmedAt={myMetConfirmedAt}
          openedAt={sheet.openedAt}
          title="Your half"
          myThemes={myThemes}
          journal={journal.map((e) => ({
            id: e.id,
            body: e.body,
            occurredOn: formatDate(e.occurredOn),
            section: e.section,
            promoted: promotedJournal.has(e.id),
            toRaise: e.raiseIt && !carried.has(e.id),
          }))}
          oneOnOnes={oneOnOnes.map((o) => ({
            id: o.id,
            heldOn: formatDate(o.heldOn),
            outcome: o.outcome ?? "",
            promoted: promotedOneOnOnes.has(o.id),
          }))}
        />

        {open ? (
          <SheetHalf
            sheetId={sheet.id}
            sections={sectionsFor(half === "employee" ? "manager" : "employee")}
            items={theirItems.map(serialiseItem)}
            editable={false}
            submittedAt={
              half === "employee" ? sheet.managerSubmittedAt : sheet.employeeSubmittedAt
            }
            metConfirmedAt={null}
            openedAt={sheet.openedAt}
            title={`${counterpart.name.split(" ")[0]}'s half`}
            myThemes={[]}
            journal={[]}
            oneOnOnes={[]}
          />
        ) : (
          <SealedHalf
            counterpartName={counterpart.name.split(" ")[0]}
            theySubmitted={Boolean(
              half === "employee" ? sheet.managerSubmittedAt : sheet.employeeSubmittedAt
            )}
          />
        )}
      </div>

      {open && (
        <div className="mt-6">
          <OutcomePanel
            sheetId={sheet.id}
            employeeName={sheet.employee.name.split(" ")[0]}
            managerName={sheet.manager.name.split(" ")[0]}
            outcome={
              sheet.outcome
                ? {
                    priorities: sheet.outcome.priorities,
                    risks: sheet.outcome.risks,
                    successDefinition: sheet.outcome.successDefinition,
                    employeeCommitments: sheet.outcome.employeeCommitments,
                    managerCommitments: sheet.outcome.managerCommitments,
                    employeeAckAt: sheet.outcome.employeeAckAt
                      ? formatDate(sheet.outcome.employeeAckAt)
                      : null,
                    managerAckAt: sheet.outcome.managerAckAt
                      ? formatDate(sheet.outcome.managerAckAt)
                      : null,
                    finalAt: sheet.outcome.finalAt ? formatDate(sheet.outcome.finalAt) : null,
                  }
                : null
            }
            iAcknowledged={Boolean(
              half === "employee" ? sheet.outcome?.employeeAckAt : sheet.outcome?.managerAckAt
            )}
          />
        </div>
      )}
    </div>
  );
}

function serialiseItem(i: {
  id: string;
  questionKey: string;
  body: string;
  sourceKind: string;
  sourceId: string | null;
}) {
  return {
    id: i.id,
    questionKey: i.questionKey,
    body: i.body,
    sourceKind: i.sourceKind as "TYPED" | "JOURNAL" | "ONE_ON_ONE" | "STRENGTH",
  };
}
