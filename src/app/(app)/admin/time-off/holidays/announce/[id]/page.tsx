import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getHolidaySet, announcementOutdated, alreadyAnnounced, isUpcoming } from "@/lib/holidays";
import { buildAnnouncementDraft, withWeekday } from "@/lib/timeoff/announcement";
import { addDays } from "@/lib/timeoff/breaks";
import { isOffDay } from "@/lib/timeoff/breaks";
import { formatDate } from "@/lib/labels";
import { dayKey } from "@/lib/workdays";
import { BackLink } from "@/components/admin/BackLink";
import { ComposerForm } from "./ComposerForm";

export const dynamic = "force-dynamic";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The announcement composer (spec 037, FR-008/009/010 — mockup signed off 2026-08-19).
 *
 * The platform drafts; HR decides. The calendar strip shows why the draft says what it says
 * (which days are weekend, holiday, bridge), the text is fully editable, and nothing leaves
 * this screen without an explicit Send.
 */
export default async function AnnounceHolidayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const holiday = await prisma.publicHoliday.findUnique({
    where: { id },
    include: { announcements: { orderBy: { sentAt: "desc" }, take: 5 } },
  });
  if (!holiday) notFound();

  const holidaySet = await getHolidaySet();
  const employees = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, email: true, department: true },
    orderBy: { name: "asc" },
  });
  const outdated = announcementOutdated(holiday);
  const announced = alreadyAnnounced(holiday);
  const isCorrection = outdated;
  const draft = buildAnnouncementDraft(holiday, holidaySet, { isCorrection });
  const last = holiday.announcements[0];
  const tentative = holiday.status === "TENTATIVE";

  // The strip: two days either side of the whole stretch, so the shape is visible in context.
  const stripStart = addDays(draft.shape.stretchStart, -1);
  const stripEnd = addDays(draft.shape.stretchEnd, 1);
  const strip: { date: Date; kind: "work" | "weekend" | "holiday" | "bridge" }[] = [];
  for (let d = stripStart; d.getTime() <= stripEnd.getTime(); d = addDays(d, 1)) {
    const iso = dayKey(d);
    const isBridge = draft.bridgeISO.includes(iso);
    const isHoliday = holidaySet.has(iso);
    strip.push({
      date: new Date(d.getTime()),
      kind: isBridge ? "bridge" : isHoliday ? "holiday" : isOffDay(d, holidaySet) ? "weekend" : "work",
    });
  }
  const cellCls: Record<string, string> = {
    work: "border-line bg-surface text-ink",
    weekend: "border-navy-100 bg-navy-50 text-navy-700",
    holiday: "border-navy-800 bg-navy-800 text-white",
    bridge: "border-gold-300 bg-gold-100 text-gold-800",
  };
  const tagFor: Record<string, string> = {
    work: "work",
    weekend: "weekend",
    holiday: "holiday",
    bridge: "bridge",
  };

  return (
    <div className="max-w-5xl">
      <BackLink href="/admin/time-off/holidays" label="Public holidays" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Time-Off · Announcement
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">{holiday.name} — tell the team</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        {holiday.draftSubject || holiday.draftBodyEn || holiday.draftBodyAr
          ? "Opened with your saved draft. Edit anything before sending; what you send is what people read."
          : "Drafted from the calendar. Edit anything before sending; what you send is what people read."}
      </p>

      {tentative ? (
        <p className="mt-4 rounded-lg border border-gold-300 bg-gold-100 px-4 py-3 text-sm text-gold-800">
          <b>This date isn&apos;t confirmed yet.</b> Verify it on the holidays screen first — the team
          shouldn&apos;t be told a date that might still move.
        </p>
      ) : null}

      {!isUpcoming(holiday) ? (
        <p className="mt-4 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-muted">
          This holiday has already passed — there is nothing left to announce.
        </p>
      ) : null}

      {outdated && last ? (
        <p className="mt-4 rounded-lg border border-gold-300 bg-gold-100 px-4 py-3 text-sm text-gold-800">
          <b>Announced with an outdated date.</b> On {formatDate(last.sentAt)} the team were told{" "}
          {formatDate(last.announcedStart)}
          {last.announcedEnd.getTime() !== last.announcedStart.getTime()
            ? ` → ${formatDate(last.announcedEnd)}`
            : ""}
          . The draft below is a correction.
        </p>
      ) : announced && last ? (
        <p className="mt-4 rounded-lg border border-navy-100 bg-navy-50 px-4 py-3 text-sm text-navy-700">
          Already announced on {formatDate(last.sentAt)} to {last.recipientCount} people. Sending again
          reaches everyone a second time.
        </p>
      ) : null}

      {/* ── What the calendar gives us ─────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gold-600">
          What the calendar gives us
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          {holiday.name} falls on <b>{withWeekday(holiday.actualStart)}</b>
          {holiday.actualEnd.getTime() !== holiday.actualStart.getTime() ? (
            <>
              {" "}
              through <b>{withWeekday(holiday.actualEnd)}</b>
            </>
          ) : null}
          .{" "}
          {draft.shape.bridges.length ? (
            <>
              <b>
                {draft.shape.bridges.map((b) => withWeekday(b)).join(" and ")}{" "}
                {draft.shape.bridges.length === 1 ? "is a bridge" : "are bridges"}
              </b>{" "}
              — taking {draft.shape.bridges.length === 1 ? "that day" : "those days"} turns this into{" "}
              <b>{draft.shape.stretchDays} days off in a row</b>.
            </>
          ) : draft.shape.totalDaysOff >= 3 ? (
            <>
              That is <b>{draft.shape.totalDaysOff} days off in a row</b> with the weekend. No bridge
              this time — the days either side are ordinary working days.
            </>
          ) : (
            <>No bridge and no long weekend this time — the draft says so plainly.</>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {strip.map((c) => (
            <div
              key={dayKey(c.date)}
              className={"w-[58px] rounded-lg border px-1 py-1.5 text-center " + cellCls[c.kind]}
            >
              <div className="text-[9.5px] uppercase tracking-wide opacity-80">
                {DOW[c.date.getUTCDay()]}
              </div>
              <div className="text-sm font-bold tabular-nums">{c.date.getUTCDate()}</div>
              <div className="text-[8.5px] uppercase tracking-wide opacity-80">{tagFor[c.kind]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* The editing surface is a client component: the script picker, the people popup and
          the test field are all local state, and the server actions do the work. */}
      <ComposerForm
        holidayId={holiday.id}
        people={employees}
        initial={{
          // A saved draft is what HR last chose to keep — it wins over a fresh generation.
          subject: holiday.draftSubject ?? draft.subject,
          bodyEn: holiday.draftBodyEn ?? draft.bodyEn,
          bodyAr: holiday.draftBodyAr ?? draft.bodyAr,
        }}
        canSend={!tentative}
        sendLabel={
          isCorrection ? "Send correction to everyone" : announced ? "Send again to everyone" : "Send to everyone"
        }
        resendConfirmed={announced && !outdated}
        suggestedLabel={draft.suggested?.label ?? null}
      />

      {holiday.announcements.length > 0 ? (
        <section className="mt-8 rounded-xl border border-line bg-surface p-5">
          <h2 className="font-serif text-lg text-ink">Already sent</h2>
          <ul className="mt-2 divide-y divide-dashed divide-line text-sm">
            {holiday.announcements.map((a) => (
              <li key={a.id} className="py-2">
                <span className="tabular-nums text-muted">{formatDate(a.sentAt)}</span>
                <span className="text-ink"> · {a.subject}</span>
                <span className="text-muted">
                  {" "}
                  · {a.recipientCount} recipient{a.recipientCount === 1 ? "" : "s"}
                  {a.kind === "CORRECTION" ? " · correction" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
