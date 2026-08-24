"use client";

import { useActionState, useState } from "react";
import type { AgendaSection } from "@/lib/reviews/agenda";
import {
  saveItem,
  deleteItem,
  submitHalf,
  confirmMeetingHeld,
  promoteJournalEntry,
  promoteOneOnOneOutcome,
  setStrengthsPicks,
  type ActionResult,
} from "@/app/(app)/reviews/actions";

export type SheetItem = {
  id: string;
  questionKey: string;
  body: string;
  sourceKind: "TYPED" | "JOURNAL" | "ONE_ON_ONE" | "STRENGTH";
};

export type JournalOption = {
  id: string;
  body: string;
  occurredOn: string;
  section: string | null;
  promoted: boolean;
};

export type OneOnOneOption = {
  id: string;
  heldOn: string;
  outcome: string;
  promoted: boolean;
};

type Theme = { code: string; name: string; rank: number };

/**
 * One half of a review sheet.
 *
 * Rendered read-only for the counterpart's half (only ever passed items once the
 * sheet has opened) and editable for your own before it opens.
 */
export function SheetHalf({
  sheetId,
  sections,
  items,
  editable,
  submittedAt,
  metConfirmedAt,
  openedAt,
  title,
  myThemes,
  journal,
  oneOnOnes,
}: {
  sheetId: string;
  sections: AgendaSection[];
  items: SheetItem[];
  editable: boolean;
  submittedAt: Date | null;
  metConfirmedAt: Date | null;
  openedAt: Date | null;
  title: string;
  myThemes: Theme[];
  journal: JournalOption[];
  oneOnOnes: OneOnOneOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => {
      const intent = String(formData.get("intent") ?? "");
      switch (intent) {
        case "save":
          return saveItem(formData);
        case "delete":
          return deleteItem(formData);
        case "submit":
          return submitHalf(formData);
        case "confirm-met":
          return confirmMeetingHeld(formData);
        case "promote-journal":
          return promoteJournalEntry(formData);
        case "promote-1-1":
          return promoteOneOnOneOutcome(formData);
        case "strengths":
          return setStrengthsPicks(formData);
        default:
          return { ok: false, error: "Nothing to do." };
      }
    },
    null
  );

  const byQuestion = (key: string) => items.filter((i) => i.questionKey === key);
  const submitted = Boolean(submittedAt);

  const chip = openedAt
    ? { text: `🔒 Locked ${openedAt.toLocaleDateString("en-GB")}`, cls: "border-line bg-paper text-muted" }
    : submitted
      ? { text: "Submitted", cls: "border-green-200 bg-green-50 text-green-700" }
      : { text: "Draft", cls: "border-gold-300 bg-gold-100 text-gold-800" };

  return (
    <form action={formAction} className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <input type="hidden" name="sheetId" value={sheetId} />

      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-[16px] text-navy-900">{title}</h3>
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${chip.cls}`}>
          {chip.text}
        </span>
      </div>

      {state && !state.ok && (
        <ErrorBanner message={state.error} />
      )}

      <div className="space-y-4">
        {sections.map((section) => (
          <section key={section.key}>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {section.title}
            </h4>
            <div className="mt-2 space-y-3.5">
              {section.questions.map((q) => (
                <div key={q.key}>
                  <p className="mb-1.5 text-[13px] font-semibold text-navy-800">{q.prompt}</p>
                  {q.hint && <p className="mb-1.5 text-[11px] text-muted">{q.hint}</p>}

                  {q.strengths && editable ? (
                    <StrengthsPicker
                      questionKey={q.key}
                      themes={myThemes}
                      selected={byQuestion(q.key).map((i) => i.body)}
                      pending={pending}
                    />
                  ) : (
                    <ItemList
                      items={byQuestion(q.key)}
                      editable={editable}
                      pending={pending}
                    />
                  )}

                  {editable && !q.strengths && (
                    <AddItem questionKey={q.key} pending={pending} />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {editable && (journal.length > 0 || oneOnOnes.length > 0) && (
        <BringOver
          journal={journal}
          oneOnOnes={oneOnOnes}
          sections={sections}
          pending={pending}
        />
      )}

      {editable && (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {!submitted ? (
            <>
              <button
                type="submit"
                name="intent"
                value="submit"
                disabled={pending}
                className="rounded-lg bg-navy-800 px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-45"
              >
                Submit — I&rsquo;m ready to meet
              </button>
              <span className="text-[11.5px] text-muted">
                You can keep editing until you submit. Submitting does not show anyone your
                answers.
              </span>
            </>
          ) : !metConfirmedAt ? (
            <>
              <button
                type="submit"
                name="intent"
                value="confirm-met"
                disabled={pending}
                className="rounded-lg bg-navy-800 px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-45"
              >
                We met — confirm
              </button>
              <span className="text-[11.5px] text-muted">
                Both of you have to confirm before the halves open.
              </span>
            </>
          ) : (
            <span className="text-[11.5px] text-muted">
              You have confirmed the meeting. Waiting for the other half.
            </span>
          )}
        </div>
      )}
    </form>
  );
}

/**
 * Rejections belong where the eyes are: announced, focusable, and scrolled to.
 * (House rule from the employee-form incident, 2026-08-20 — a reason rendered at
 * the top of a long form while the button sits at the bottom reads as a dead
 * button.)
 */
function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      tabIndex={-1}
      ref={(el) => {
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        el?.focus();
      }}
      className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
    >
      {message}
    </p>
  );
}

function ItemList({
  items,
  editable,
  pending,
}: {
  items: SheetItem[];
  editable: boolean;
  pending: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-[12.5px] italic text-muted">Nothing written.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li
          key={item.id}
          className="flex items-start gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px]"
        >
          <span className="min-w-3 pt-0.5 text-[10.5px] font-extrabold tabular-nums text-navy-300">
            {i + 1}
          </span>
          <span className="flex-1">{item.body}</span>
          {item.sourceKind === "JOURNAL" && <SourceTag kind="journal" />}
          {item.sourceKind === "ONE_ON_ONE" && <SourceTag kind="1:1" />}
          {editable && (
            <button
              type="submit"
              name="intent"
              value="delete"
              disabled={pending}
              formNoValidate
              onClick={(e) => {
                const form = e.currentTarget.form;
                if (!form) return;
                const field = form.querySelector<HTMLInputElement>('input[name="itemId"]');
                if (field) field.value = item.id;
              }}
              className="text-[11px] font-semibold text-muted hover:text-red-700"
              aria-label="Remove this answer"
            >
              ✕
            </button>
          )}
        </li>
      ))}
      {editable && <input type="hidden" name="itemId" defaultValue="" />}
    </ul>
  );
}

function SourceTag({ kind }: { kind: "journal" | "1:1" }) {
  const cls =
    kind === "journal"
      ? "border-navy-100 bg-navy-50 text-navy-500"
      : "border-gold-200 bg-gold-100 text-gold-800";
  return (
    <span
      className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${cls}`}
    >
      From {kind}
    </span>
  );
}

function AddItem({ questionKey, pending }: { questionKey: string; pending: boolean }) {
  const [value, setValue] = useState("");
  return (
    <div className="mt-1.5 flex gap-2">
      <input
        type="text"
        name="body"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add an answer…"
        maxLength={2000}
        className="flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px]"
      />
      <button
        type="submit"
        name="intent"
        value="save"
        disabled={pending || value.trim() === ""}
        onClick={(e) => {
          const form = e.currentTarget.form;
          const field = form?.querySelector<HTMLInputElement>('input[name="questionKey"]');
          if (field) field.value = questionKey;
        }}
        className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-[12px] font-semibold text-navy-700 disabled:opacity-45"
      >
        Add
      </button>
      <input type="hidden" name="questionKey" defaultValue="" />
    </div>
  );
}

/** Picks from the author's OWN themes — you cannot claim a strength you do not have. */
function StrengthsPicker({
  questionKey,
  themes,
  selected,
  pending,
}: {
  questionKey: string;
  themes: Theme[];
  selected: string[];
  pending: boolean;
}) {
  const [picked, setPicked] = useState<string[]>(
    themes.filter((t) => selected.includes(t.name)).map((t) => t.code)
  );

  if (themes.length === 0) {
    return (
      <p className="text-[12.5px] text-muted">
        No CliftonStrengths profile on file for you yet, so answer in your own words above.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {themes.map((t) => {
          const on = picked.includes(t.code);
          return (
            <button
              key={t.code}
              type="button"
              onClick={() =>
                setPicked((p) => (on ? p.filter((c) => c !== t.code) : [...p, t.code]))
              }
              className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${
                on
                  ? "border-navy-800 bg-navy-800 text-white"
                  : "border-navy-200 bg-navy-50 text-navy-700"
              }`}
            >
              {t.name}
            </button>
          );
        })}
      </div>
      {picked.map((code) => (
        <input key={code} type="hidden" name="themeCode" value={code} />
      ))}
      <button
        type="submit"
        name="intent"
        value="strengths"
        disabled={pending}
        onClick={(e) => {
          const form = e.currentTarget.form;
          const field = form?.querySelector<HTMLInputElement>('input[name="questionKey"]');
          if (field) field.value = questionKey;
        }}
        className="mt-2 rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-[12px] font-semibold text-navy-700 disabled:opacity-45"
      >
        Save these
      </button>
    </div>
  );
}

/** Journal notes and agreed 1:1 outcomes you can bring onto the sheet. */
function BringOver({
  journal,
  oneOnOnes,
  sections,
  pending,
}: {
  journal: JournalOption[];
  oneOnOnes: OneOnOneOption[];
  sections: AgendaSection[];
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const questions = sections.flatMap((s) => s.questions.filter((q) => !q.strengths));
  const available = journal.filter((j) => !j.promoted).length + oneOnOnes.filter((o) => !o.promoted).length;

  return (
    <div className="mt-5 border-t border-line pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[12px] font-semibold text-navy-700 hover:underline"
      >
        {open ? "Hide" : `Bring something over (${available})`}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted">
            Add it to
            <select
              name="questionKey"
              className="mt-1 block w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-normal normal-case tracking-normal text-ink"
            >
              {questions.map((q) => (
                <option key={q.key} value={q.key}>
                  {q.prompt}
                </option>
              ))}
            </select>
          </label>

          {journal.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                From your journal
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {journal.map((j) => (
                  <li
                    key={j.id}
                    className="flex items-start gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12.5px]"
                  >
                    <span className="shrink-0 tabular-nums text-muted">{j.occurredOn}</span>
                    <span className="flex-1">{j.body}</span>
                    {j.promoted ? (
                      <span className="shrink-0 text-[10.5px] font-bold text-green-700">
                        Added
                      </span>
                    ) : (
                      <button
                        type="submit"
                        name="intent"
                        value="promote-journal"
                        disabled={pending}
                        onClick={(e) => {
                          const form = e.currentTarget.form;
                          const field = form?.querySelector<HTMLInputElement>(
                            'input[name="entryId"]'
                          );
                          if (field) field.value = j.id;
                        }}
                        className="shrink-0 text-[11px] font-semibold text-navy-700 hover:underline"
                      >
                        Add
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <input type="hidden" name="entryId" defaultValue="" />
            </div>
          )}

          {oneOnOnes.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Agreed in a 1:1 this quarter
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {oneOnOnes.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-start gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12.5px]"
                  >
                    <span className="shrink-0 tabular-nums text-muted">{o.heldOn}</span>
                    <span className="flex-1">{o.outcome}</span>
                    {o.promoted ? (
                      <span className="shrink-0 text-[10.5px] font-bold text-green-700">
                        Added
                      </span>
                    ) : (
                      <button
                        type="submit"
                        name="intent"
                        value="promote-1-1"
                        disabled={pending}
                        onClick={(e) => {
                          const form = e.currentTarget.form;
                          const field = form?.querySelector<HTMLInputElement>(
                            'input[name="oneOnOneId"]'
                          );
                          if (field) field.value = o.id;
                        }}
                        className="shrink-0 text-[11px] font-semibold text-navy-700 hover:underline"
                      >
                        Add
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <input type="hidden" name="oneOnOneId" defaultValue="" />
            </div>
          )}

          <p className="text-[11px] text-muted">
            Bringing something over copies the words onto your half. Editing or deleting the
            original afterwards will not change what is on the sheet.
          </p>
        </div>
      )}
    </div>
  );
}
