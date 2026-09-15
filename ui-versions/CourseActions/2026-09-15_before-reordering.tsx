"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCourse, updateCourse } from "@/app/(app)/admin/learning/actions";
import { BTN_GHOST, BTN_NAVY, INPUT, LABEL } from "@/components/learning/ui";

/**
 * Rename and delete a course (mockup-approved 2026-08-25).
 *
 * The two actions had existed on the server since the module shipped with nothing on screen
 * reaching them, so a course could never be renamed after it was created and a draft could never
 * be thrown away — which is how the list filled up with them.
 *
 * ONE MENU, TWO PLACES. `CourseRow` puts it on each row of the Learning list, where you clear
 * drafts out; `CourseHeaderActions` puts the same menu in the course's own header, so you do not
 * have to go back to the list to rename the thing you are looking at. Both drive the same panels
 * below, so a course's name is changed in one place rather than in two that can drift.
 *
 * WHY THE CONFIRMATION IS THE ROW AND NOT A DIALOG: a delete that cannot be undone should read as
 * a sentence naming the course, in the place the course was. A modal that says "Are you sure?" is
 * dismissed on reflex, and after eleven drafts it is dismissed without being read at all.
 *
 * The refusal for a course somebody has started is shown BEFORE the confirmation rather than
 * after it — being asked to confirm and then told no is worse than being told no. The count comes
 * from the page (`_count.enrollments`, exactly what the write counts), and the server refuses
 * again on its own authority, so a course started in the seconds between still cannot go.
 */

type Mode = "idle" | "menu" | "rename" | "confirm" | "refused";

function useCourseActions(courseId: string, afterDelete: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setMode("idle");
    setError(null);
  };

  const rename = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await updateCourse(courseId, formData);
      if (!result.ok) setError(result.error);
      else {
        close();
        router.refresh();
      }
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteCourse(courseId);
      if (!result.ok) setError(result.error);
      else afterDelete();
    });
  };

  return { pending, mode, setMode, error, close, rename, remove };
}

/** Closes the menu on an outside click or Escape — a popover that only closes by re-clicking its
 *  own button is a popover you end up with three of. */
function useDismiss(active: boolean, onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, onDismiss]);
  return ref;
}

const KEBAB =
  "grid h-7 w-7 flex-none place-items-center rounded-lg border border-line bg-surface text-[14px] font-extrabold leading-none text-muted hover:border-navy-200 hover:bg-navy-50 hover:text-navy-800 disabled:opacity-60";

function Menu({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="absolute right-0 top-full z-30 mt-1 w-[196px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
      <button
        type="button"
        onClick={onRename}
        className="flex w-full items-center gap-2.5 border-b border-line px-3 py-2 text-left text-[12.5px] font-semibold text-ink hover:bg-navy-50"
      >
        <span aria-hidden>✎</span> Rename
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] font-semibold text-red-700 hover:bg-red-50"
      >
        <span aria-hidden>🗑</span> Delete course
      </button>
    </div>
  );
}

function RenamePanel({
  title,
  summary,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  summary: string | null;
  pending: boolean;
  error: string | null;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form action={onSubmit} className="rounded-xl border border-line bg-surface p-4">
      <p className="mb-3 text-[13px] font-bold text-navy-800">Course details</p>
      <label className={LABEL} htmlFor="course-title">
        Title
      </label>
      <input id="course-title" name="title" defaultValue={title} className={INPUT} autoFocus />
      <label className={`${LABEL} mt-3`} htmlFor="course-summary">
        One-line description{" "}
        <span className="normal-case tracking-normal">
          — shown under the title on the employee&rsquo;s card
        </span>
      </label>
      <input
        id="course-summary"
        name="summary"
        defaultValue={summary ?? ""}
        className={INPUT}
        placeholder="What this course covers"
      />
      {error ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending} className={BTN_NAVY}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className={BTN_GHOST}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ConfirmStrip({
  title,
  pending,
  error,
  onDelete,
  onCancel,
}: {
  title: string;
  pending: boolean;
  error: string | null;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
    >
      <p className="m-0 min-w-[260px] flex-1 text-[12.5px] text-ink">
        Delete <b>&ldquo;{title}&rdquo;</b>? Its sections, lessons and materials go with it, and
        nobody has started it, so no record is lost. <b>This can&rsquo;t be undone.</b>
        {error ? <span className="mt-1 block font-semibold text-red-700">{error}</span> : null}
      </p>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-surface px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete it"}
      </button>
      <button type="button" onClick={onCancel} disabled={pending} className={BTN_GHOST}>
        Cancel
      </button>
    </div>
  );
}

function RefusedStrip({
  title,
  startedCount,
  onClose,
}: {
  title: string;
  startedCount: number;
  onClose: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-gold-300 bg-gold-100 px-4 py-3"
    >
      <p className="m-0 min-w-[260px] flex-1 text-[12.5px] text-ink">
        <b>
          {startedCount} {startedCount === 1 ? "person has" : "people have"} started &ldquo;{title}
          &rdquo;
        </b>
        , so deleting it would destroy their record. Pause it instead — nobody can open it, and
        everything they have done is kept.
      </p>
      <button type="button" onClick={onClose} className={BTN_GHOST}>
        Close
      </button>
    </div>
  );
}

/**
 * One row of the Learning list: the link to the course, plus the menu.
 *
 * The row's contents are passed in as `children` and rendered on the server — this component owns
 * only the frame, the menu, and which of the three states the row is showing.
 */
export function CourseRow({
  courseId,
  title,
  summary,
  startedCount,
  children,
}: {
  courseId: string;
  title: string;
  summary: string | null;
  startedCount: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { pending, mode, setMode, error, close, rename, remove } = useCourseActions(courseId, () =>
    router.refresh()
  );
  const ref = useDismiss(mode === "menu", close);

  if (mode === "rename") {
    return (
      <RenamePanel
        title={title}
        summary={summary}
        pending={pending}
        error={error}
        onSubmit={rename}
        onCancel={close}
      />
    );
  }
  if (mode === "confirm") {
    return (
      <ConfirmStrip
        title={title}
        pending={pending}
        error={error}
        onDelete={remove}
        onCancel={close}
      />
    );
  }
  if (mode === "refused") {
    return <RefusedStrip title={title} startedCount={startedCount} onClose={close} />;
  }

  return (
    <div
      ref={ref}
      // z-30 ON THE CARD, not just on the menu inside it. `.ff-card:hover` lifts the card with a
      // `transform`, and a transform makes the card its OWN stacking context — so the menu's
      // z-index is trapped inside it and the NEXT course in the list paints straight over the
      // menu. Since the pointer is by definition on the card while its menu is open, this was
      // every time: the menu rendered, and the row below it swallowed the clicks. Same family of
      // trap as `overflow-hidden` silently killing a sticky header. Raising the card itself is
      // what puts the menu above its siblings.
      className={`ff-card relative flex items-center gap-2 rounded-xl border border-line bg-surface pr-3 hover:border-navy-300 ${
        mode === "menu" ? "z-30" : ""
      }`}
    >
      {children}
      <button
        type="button"
        aria-label={`More for ${title}`}
        aria-expanded={mode === "menu"}
        onClick={() => setMode(mode === "menu" ? "idle" : "menu")}
        className={KEBAB}
      >
        ⋯
      </button>
      {/* The arrow is drawn here rather than inside the link, so the menu sits where it was
          signed off — between the course and the arrow. It is decoration either way: the whole
          row is the link. */}
      <span aria-hidden className="text-sm text-muted">
        →
      </span>
      {mode === "menu" ? (
        <Menu
          onRename={() => setMode("rename")}
          onDelete={() => setMode(startedCount > 0 ? "refused" : "confirm")}
        />
      ) : null}
    </div>
  );
}

/**
 * The same menu in the course's own header, beside the status ladder.
 *
 * Deleting from here goes back to the list — staying on the page of a course that no longer
 * exists would land on a 404 the operator did not ask for.
 */
export function CourseHeaderActions({
  courseId,
  title,
  summary,
  startedCount,
}: {
  courseId: string;
  title: string;
  summary: string | null;
  startedCount: number;
}) {
  const router = useRouter();
  const { pending, mode, setMode, error, close, rename, remove } = useCourseActions(courseId, () =>
    router.push("/admin/learning")
  );
  const ref = useDismiss(mode !== "idle", close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More for this course"
        aria-expanded={mode !== "idle"}
        onClick={() => setMode(mode === "idle" ? "menu" : "idle")}
        className={KEBAB}
      >
        ⋯
      </button>

      {mode === "menu" ? (
        <Menu
          onRename={() => setMode("rename")}
          onDelete={() => setMode(startedCount > 0 ? "refused" : "confirm")}
        />
      ) : null}

      {mode === "rename" || mode === "confirm" || mode === "refused" ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-[min(520px,calc(100vw-2rem))] shadow-lg">
          {mode === "rename" ? (
            <RenamePanel
              title={title}
              summary={summary}
              pending={pending}
              error={error}
              onSubmit={rename}
              onCancel={close}
            />
          ) : mode === "confirm" ? (
            <ConfirmStrip
              title={title}
              pending={pending}
              error={error}
              onDelete={remove}
              onCancel={close}
            />
          ) : (
            <RefusedStrip title={title} startedCount={startedCount} onClose={close} />
          )}
        </div>
      ) : null}
    </div>
  );
}
