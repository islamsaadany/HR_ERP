"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteLesson,
  deleteSection,
  publishCourse,
  unpublishCourse,
  upsertLesson,
  upsertSection,
  type CompletionChoice,
} from "@/app/(app)/admin/learning/actions";
import { ReopenDialog } from "@/components/learning/ReopenDialog";
import { LessonEditor, type EditableLesson } from "@/components/learning/LessonEditor";
import { RenewalSetting } from "@/components/learning/RenewalSetting";
import { BTN_GHOST, BTN_NAVY, CHIP, INPUT } from "@/components/learning/ui";

export type BuilderSection = { id: string; title: string; lessons: EditableLesson[] };

/**
 * The Content tab: the section → lesson tree, with the lesson editor beside it.
 *
 * The one piece of real behaviour here is the reopen flow. When a lesson edit would raise a
 * published course's required set, the server can come back with `needsDecision` instead of a
 * result — that is not an error, it is the server asking. We hold the pending edit, show the
 * dialog, and resubmit the SAME edit with the answer attached.
 */
export function CourseBuilder({
  courseId,
  status,
  sections,
  renewAfterMonths,
}: {
  courseId: string;
  status: "DRAFT" | "PUBLISHED";
  sections: BuilderSection[];
  renewAfterMonths: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    sections.flatMap((s) => s.lessons)[0]?.id ?? null
  );
  const [newSection, setNewSection] = useState("");
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newLesson, setNewLesson] = useState("");

  /** The edit waiting on a completion decision, held so it can be replayed verbatim. */
  const [awaiting, setAwaiting] = useState<{
    affected: number;
    replay: (choice: CompletionChoice) => Promise<void>;
  } | null>(null);

  const selected = sections.flatMap((s) => s.lessons).find((l) => l.id === selectedId) ?? null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That didn't work.");
      else {
        if (ok) setNotice(ok);
        router.refresh();
      }
    });
  }

  /** Submit a lesson edit, handling the server's "I need a decision first" reply. */
  function submitLesson(
    sectionId: string,
    input: { lessonId: string | null; title: string; isRequired: boolean; estimatedMinutes: number | null; minWatchPercent: number },
    choice?: CompletionChoice
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await upsertLesson(courseId, { sectionId, ...input }, choice);
      if ("needsDecision" in result && result.needsDecision) {
        setAwaiting({
          affected: result.affected,
          replay: async (chosen) => {
            const retry = await upsertLesson(courseId, { sectionId, ...input }, chosen);
            setAwaiting(null);
            if (!retry.ok) setError("error" in retry ? retry.error : "That didn't work.");
            else {
              setNotice(
                chosen === "REOPEN"
                  ? "Lesson added — the course reopened for everyone who had finished it."
                  : "Lesson added — existing completions were left standing."
              );
              router.refresh();
            }
          },
        });
        return;
      }
      if (!result.ok) setError("error" in result ? result.error : "That didn't work.");
      else {
        setNewLesson("");
        setAddingTo(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={status === "PUBLISHED" ? CHIP.done : CHIP.attention}>
            {status === "PUBLISHED" ? "Published" : "Draft"}
          </span>
          {status === "DRAFT" ? (
            <span className="text-xs text-muted">No employee can see this yet.</span>
          ) : null}
        </div>
        <button
          type="button"
          disabled={pending}
          className={status === "PUBLISHED" ? BTN_GHOST : BTN_NAVY}
          onClick={() =>
            run(
              () => (status === "PUBLISHED" ? unpublishCourse(courseId) : publishCourse(courseId)),
              status === "PUBLISHED"
                ? "Back to draft — employees can no longer see it. Nobody's progress was touched."
                : "Published."
            )
          }
        >
          {status === "PUBLISHED" ? "Return to draft" : "Publish"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-3 rounded-r-lg border-l-[3px] border-green-600 bg-green-50 px-3 py-2 text-[12.5px] text-green-700">
          {notice}
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          {sections.map((section) => (
            <div key={section.id} className="mb-2.5 overflow-hidden rounded-xl border border-line bg-surface">
              <div className="flex items-center gap-2 border-b border-line bg-navy-50 px-3 py-2.5">
                <span className="text-[13.5px] font-bold text-navy-800">{section.title}</span>
                <span className="flex-1" />
                <span className={CHIP.muted}>
                  {section.lessons.length} lesson{section.lessons.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  className="text-xs text-red-700 hover:underline"
                  onClick={() => run(() => deleteSection(courseId, section.id), "Section removed.")}
                >
                  Remove
                </button>
              </div>

              {section.lessons.map((lesson) => (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => setSelectedId(lesson.id)}
                  className={`flex w-full items-center gap-2 border-b border-line px-3 py-2.5 text-left text-[13.5px] last:border-b-0 ${
                    lesson.id === selectedId ? "bg-navy-50/50 shadow-[inset_3px_0_0_var(--color-navy-800)]" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{lesson.title}</span>
                    <span className="block text-[11.5px] text-muted">
                      {lesson.blocks.length === 0
                        ? "No content yet"
                        : lesson.blocks.map((b) => b.type.toLowerCase()).join(" + ")}
                      {lesson.estimatedMinutes ? ` · ${lesson.estimatedMinutes} min` : ""}
                      {lesson.minWatchPercent > 0 ? ` · watch ${lesson.minWatchPercent}%` : ""}
                    </span>
                  </span>
                  <span className={lesson.isRequired ? CHIP.navy : CHIP.muted}>
                    {lesson.isRequired ? "Required" : "Optional"}
                  </span>
                </button>
              ))}

              {addingTo === section.id ? (
                <div className="flex gap-2 border-t border-line p-3">
                  <input
                    className={INPUT}
                    value={newLesson}
                    autoFocus
                    placeholder="Lesson title"
                    onChange={(e) => setNewLesson(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={pending || !newLesson.trim()}
                    className={BTN_NAVY}
                    onClick={() =>
                      submitLesson(section.id, {
                        lessonId: null,
                        title: newLesson,
                        isRequired: true,
                        estimatedMinutes: null,
                        minWatchPercent: 0,
                      })
                    }
                  >
                    Add
                  </button>
                </div>
              ) : (
                <div className="border-t border-line p-2">
                  <button
                    type="button"
                    className="text-xs font-semibold text-navy-700 hover:underline"
                    onClick={() => {
                      setAddingTo(section.id);
                      setNewLesson("");
                    }}
                  >
                    + Add lesson
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="mt-3 flex gap-2">
            <input
              className={INPUT}
              value={newSection}
              placeholder="New section title"
              onChange={(e) => setNewSection(e.target.value)}
            />
            <button
              type="button"
              disabled={pending || !newSection.trim()}
              className={BTN_GHOST}
              onClick={() =>
                run(() => upsertSection(courseId, null, newSection), "Section added.")
              }
            >
              + Section
            </button>
          </div>
        </div>

        {selected ? (
          <LessonEditor
            key={selected.id}
            courseId={courseId}
            lesson={selected}
            pending={pending}
            onSave={(input) => {
              const section = sections.find((s) => s.lessons.some((l) => l.id === selected.id));
              if (section) submitLesson(section.id, { lessonId: selected.id, ...input });
            }}
            onDelete={() => {
              setSelectedId(null);
              run(() => deleteLesson(courseId, selected.id), "Lesson removed.");
            }}
          />
        ) : (
          <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
            Select a lesson to edit it, or add one.
          </p>
        )}
      </div>

      <RenewalSetting courseId={courseId} renewAfterMonths={renewAfterMonths} />

      {awaiting ? (
        <ReopenDialog
          affected={awaiting.affected}
          pending={pending}
          onChoose={(choice) => startTransition(() => awaiting.replay(choice))}
          onCancel={() => setAwaiting(null)}
        />
      ) : null}
    </div>
  );
}
