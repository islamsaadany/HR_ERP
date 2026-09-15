"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { LearningCourseStatus } from "@prisma/client";
import { reorderCourses } from "@/app/(app)/admin/learning/actions";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/learning/order";

/**
 * The admin course list: the state quick-filters, and dragging a course into place
 * (mockup-approved 2026-09-15, `design-mockups/learning/2026-09-14_course-reordering.html` v3).
 *
 * WHY THE ROWS ARRIVE AS RENDERED NODES rather than as data: the row markup is the one thing this
 * change must not disturb, so it stays exactly where it was — rendered on the server by the page —
 * and this component only decides which rows are on screen and in what order. Re-rendering the row
 * here would have meant re-writing markup that was signed off long ago for no reason.
 *
 * THE HANDLE IS THE ONLY CONTROL (the CEO, 2026-09-15: "remove the option with order move up and
 * down the handling is enough"). Nothing replaced those menu entries, so the handle answers to all
 * three inputs instead: a mouse drag, a press-and-hold on a touchscreen, and the up/down keys while
 * it holds keyboard focus. The last is not a nicety — without it reordering would be this module's
 * only action unreachable without a mouse.
 */

type BoardItem = {
  id: string;
  status: LearningCourseStatus;
  title: string;
  node: ReactNode;
};

type Groups = Record<LearningCourseStatus, string[]>;

/** How long a finger must rest on the handle before the row lifts. */
const HOLD_MS = 350;
/** Movement before the hold fires that means "this is a scroll, not a lift". */
const HOLD_SLOP_PX = 8;
/** Keyboard moves are collapsed into one write, so holding an arrow key is one transaction. */
const KEY_COMMIT_MS = 450;
/** How close to the top or bottom of the window a drag starts scrolling the page. */
const EDGE_PX = 90;
/** The `space-y-2` between rows, which the slot arithmetic has to account for. */
const ROW_GAP_PX = 8;

function groupsFrom(items: BoardItem[]): Groups {
  const groups = {} as Groups;
  for (const status of STATUS_ORDER) groups[status] = [];
  // The page hands them over already in state-then-order sequence, so pushing preserves it.
  for (const item of items) groups[item.status].push(item.id);
  return groups;
}

function moved(ids: string[], from: number, to: number): string[] {
  const next = ids.slice();
  const [taken] = next.splice(from, 1);
  next.splice(to, 0, taken);
  return next;
}

// ─── The handle ─────────────────────────────────────────────────────────

type HandleApi = {
  place: (courseId: string) => { index: number; total: number; title: string } | null;
  draggingId: string | null;
  onPointerDown: (courseId: string, event: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (courseId: string, event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

const BoardContext = createContext<HandleApi | null>(null);

const GRIP = (
  <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true" className="block">
    <g fill="currentColor">
      <circle cx="2.5" cy="3" r="1.35" />
      <circle cx="7.5" cy="3" r="1.35" />
      <circle cx="2.5" cy="8" r="1.35" />
      <circle cx="7.5" cy="8" r="1.35" />
      <circle cx="2.5" cy="13" r="1.35" />
      <circle cx="7.5" cy="13" r="1.35" />
    </g>
  </svg>
);

/**
 * Rendered INSIDE the course row, so the handle sits within the card rather than beside it. It
 * reads the board through context because the row itself is built on the server, which cannot hand
 * a drag handler down as a prop.
 */
export function CourseDragHandle({ courseId }: { courseId: string }) {
  const api = useContext(BoardContext);
  const place = api?.place(courseId);
  if (!api || !place) return null;

  // Alone in its state: there is nowhere to go, and a live-looking handle that does nothing is
  // worse than a faded one. Same reasoning as a row that cannot be acted on saying why.
  const solo = place.total < 2;
  const dragging = api.draggingId === courseId;

  return (
    <>
      <button
        type="button"
        disabled={solo}
        aria-label={
          solo
            ? `${place.title} is the only course here`
            : `Reorder ${place.title} — position ${place.index + 1} of ${place.total}. Drag, or press the up and down keys.`
        }
        onPointerDown={(e) => api.onPointerDown(courseId, e)}
        onKeyDown={(e) => api.onKeyDown(courseId, e)}
        className={`ml-1 grid h-[30px] w-[22px] flex-none touch-none place-items-center rounded-md border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500 ${
          solo
            ? "cursor-default text-line"
            : dragging
              ? "cursor-grabbing bg-navy-50 text-navy-700"
              : "cursor-grab text-navy-300 hover:bg-navy-50 hover:text-navy-400"
        }`}
      >
        {GRIP}
      </button>
      <span
        aria-hidden
        className="w-4 flex-none text-right text-[11px] font-bold tabular-nums text-navy-300 max-sm:hidden"
      >
        {place.index + 1}
      </span>
    </>
  );
}

// ─── The board ──────────────────────────────────────────────────────────

type Filter = "ALL" | LearningCourseStatus;

export function CourseBoard({ items }: { items: BoardItem[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [filter, setFilter] = useState<Filter>("ALL");
  const [groups, setGroups] = useState<Groups>(() => groupsFrom(items));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dy, setDy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  /**
   * The live order, readable synchronously.
   *
   * A pointer can move several times before React re-renders, and a handler reading `groups` from
   * its own render's closure would then compute the move against an order one or more swaps out of
   * date — so a quick drag lands short of where it was dropped. Measured in a real browser before
   * this ref existed: flicking a course from the top of eight to the bottom stopped four rows
   * early. Every read inside an event handler goes through the ref; `groups` is for rendering.
   */
  const groupsRef = useRef(groups);
  const applyGroups = (next: Groups) => {
    groupsRef.current = next;
    setGroups(next);
  };

  // Resync when the server sends a different list. The page refreshes itself every 30 seconds and
  // on focus, so this fires while somebody is looking at it — but NEVER mid-drag, which would pull
  // the row out from under the pointer. A drag that finishes after a refresh commits against the
  // set the server now has, and the write refuses if that set is no longer the one being arranged.
  const signature = items.map((i) => `${i.id}:${i.status}`).join("|");
  const [syncedTo, setSyncedTo] = useState(signature);
  if (signature !== syncedTo && draggingId === null) {
    setSyncedTo(signature);
    applyGroups(groupsFrom(items));
  }

  const rows = useRef(new Map<string, HTMLLIElement>());
  const drag = useRef<{
    id: string;
    status: LearningCourseStatus;
    /** Where inside the row the pointer took hold of it. */
    grabOffset: number;
    /** Each row's height, frozen at the start of the drag. */
    heights: Map<string, number>;
    /** The top of the first row of this state, in page coordinates. */
    groupTop: number;
  } | null>(null);
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const dyRef = useRef(0);
  const pointerY = useRef(0);
  const keyTimer = useRef<number | null>(null);
  const autoScroll = useRef<number | null>(null);
  const windowHandlers = useRef<{ move: (e: PointerEvent) => void; up: () => void } | null>(null);
  const maxScroll = useRef(0);

  const byId = new Map(items.map((i) => [i.id, i]));
  const counts = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, groups[s].length])
  ) as Record<LearningCourseStatus, number>;
  const shown = STATUS_ORDER.filter((s) => counts[s] > 0);
  const visible = shown.filter((s) => filter === "ALL" || filter === s);

  useEffect(() => {
    return () => {
      if (hold.current) window.clearTimeout(hold.current.timer);
      if (keyTimer.current) window.clearTimeout(keyTimer.current);
      if (autoScroll.current !== null) window.cancelAnimationFrame(autoScroll.current);
      const attached = windowHandlers.current;
      if (attached) {
        window.removeEventListener("pointermove", attached.move);
        window.removeEventListener("pointerup", attached.up);
        window.removeEventListener("pointercancel", attached.up);
      }
    };
  }, []);

  function save(status: LearningCourseStatus, next: string[]) {
    const settled = groupsFrom(items)[status];
    if (settled.join("|") === next.join("|")) return;
    startTransition(async () => {
      const result = await reorderCourses(status, next);
      if (result.ok) {
        setError(null);
        router.refresh();
      } else {
        // Never leave a new order on screen that is not stored — the row goes back where it was
        // and the reason is said out loud.
        setError(result.error);
        applyGroups(groupsFrom(items));
      }
    });
  }

  /**
   * Glue the lifted row to the pointer and work out which slot it is now over.
   *
   * EVERY MEASUREMENT IS FROZEN AT THE START OF THE DRAG and the rest is arithmetic — nothing here
   * reads the layout. Reading live rectangles instead is the obvious way to write this and it is
   * wrong: each swap re-lays-out the list, and a pointer moving faster than the browser repaints
   * then measures the PREVIOUS arrangement, so the row lands short of where it was dropped. Seen
   * in a real browser: the same drag landed correctly at 60ms between moves and three rows short
   * at 25ms — and a real mouse reports roughly every 8ms.
   *
   * Called on every pointer move AND on every auto-scroll frame, since a page scrolling under a
   * still finger moves the row relative to the list with no pointer event to announce it.
   */
  function placeAt(clientY: number) {
    const active = drag.current;
    if (!active) return;
    const ids = groupsRef.current[active.status];
    const from = ids.indexOf(active.id);
    if (from === -1) return;

    const height = (id: string) => active.heights.get(id) ?? 0;
    const slot = (id: string) => height(id) + ROW_GAP_PX;

    // Where the lifted row's own middle now sits, in page coordinates.
    const top = clientY + window.scrollY - active.grabOffset;
    const middle = top + height(active.id) / 2;

    // The other courses keep their relative order throughout, so walking them in the current order
    // and accumulating their frozen heights gives exactly the slots they occupy with this one
    // taken out of the list.
    let edge = active.groupTop;
    let to = 0;
    for (const id of ids) {
      if (id === active.id) continue;
      if (middle > edge + height(id) / 2) to++;
      edge += slot(id);
    }

    // The resting top of the slot it is about to occupy — computed the same way, so the row is
    // glued to the pointer in the very render that moves it rather than one frame later.
    let resting = active.groupTop;
    let seen = 0;
    for (const id of ids) {
      if (id === active.id) continue;
      if (seen === to) break;
      resting += slot(id);
      seen++;
    }

    const next = top - resting;
    dyRef.current = next;
    setDy(next);
    if (to !== from) applyGroups({ ...groupsRef.current, [active.status]: moved(ids, from, to) });
  }

  /**
   * Scroll the page while the pointer rests near an edge.
   *
   * Without this a course can only be dragged as far as the screen: a pointer cannot leave the
   * viewport, so a row below the fold has no midpoint the pointer can ever get past and the drag
   * silently stalls at the last visible slot. Found by dragging a course from the top of a list of
   * eleven to the bottom in a real browser and watching it stop one row short — the list was
   * taller than the window, and nothing about it looked broken.
   */
  function startAutoScroll() {
    stopAutoScroll();
    const step = () => {
      if (!drag.current) return;
      const y = pointerY.current;
      const bottom = window.innerHeight - y;
      const speed = y < EDGE_PX ? -Math.ceil((EDGE_PX - y) / 4) : bottom < EDGE_PX ? Math.ceil((EDGE_PX - bottom) / 4) : 0;
      if (speed !== 0) {
        const before = window.scrollY;
        // Clamped to the page's height as it was BEFORE the row was lifted. A translated row
        // sticks out past the bottom of the document and lengthens it, so an unclamped scroll
        // finds fresh "bottom" on every frame and runs away into blank space under a still finger.
        const to = Math.max(0, Math.min(maxScroll.current, before + speed));
        if (to !== before) {
          window.scrollTo(0, to);
          placeAt(y);
        }
      }
      autoScroll.current = window.requestAnimationFrame(step);
    };
    autoScroll.current = window.requestAnimationFrame(step);
  }

  function stopAutoScroll() {
    if (autoScroll.current !== null) window.cancelAnimationFrame(autoScroll.current);
    autoScroll.current = null;
  }

  function beginDrag(id: string, status: LearningCourseStatus, clientY: number) {
    const el = rows.current.get(id);
    if (!el) return;

    const ids = groupsRef.current[status];
    const heights = new Map<string, number>();
    let groupTop = Infinity;
    for (const each of ids) {
      const row = rows.current.get(each);
      if (!row) continue;
      const box = row.getBoundingClientRect();
      heights.set(each, box.height);
      groupTop = Math.min(groupTop, box.top + window.scrollY);
    }
    if (!Number.isFinite(groupTop)) return;

    drag.current = {
      id,
      status,
      grabOffset: clientY - el.getBoundingClientRect().top,
      heights,
      groupTop,
    };
    dyRef.current = 0;
    pointerY.current = clientY;
    setDy(0);
    setError(null);
    setDraggingId(id);
    maxScroll.current = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    startAutoScroll();
  }

  function clearHold() {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  }

  /**
   * The drag is followed on the WINDOW, not on the handle.
   *
   * `setPointerCapture` on the handle is the obvious way and it breaks on the first swap: React
   * reorders the list by moving the `<li>` nodes, and an element that leaves the document loses
   * pointer capture — so the handle stops receiving moves and the drag freezes half way, with the
   * row still lifted and following nothing. Measured before this: a drag down a list of eight
   * stopped dead at the sixth row, every time, and the last pointer position the component ever
   * saw was the one just before the first reorder. The window cannot be reordered out from under
   * a listener.
   */
  function onWindowMove(event: PointerEvent) {
    pointerY.current = event.clientY;

    if (hold.current) {
      const shift = Math.abs(event.clientY - hold.current.y) + Math.abs(event.clientX - hold.current.x);
      if (shift > HOLD_SLOP_PX) {
        clearHold();
        unlisten();
      }
      return;
    }
    if (!drag.current) return;
    event.preventDefault();
    placeAt(event.clientY);
  }

  function onWindowUp() {
    clearHold();
    stopAutoScroll();
    unlisten();
    const active = drag.current;
    drag.current = null;
    dyRef.current = 0;
    setDy(0);
    setDraggingId(null);
    if (active) save(active.status, groupsRef.current[active.status]);
  }

  function listen() {
    unlisten();
    window.addEventListener("pointermove", onWindowMove, { passive: false });
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowUp);
    windowHandlers.current = { move: onWindowMove, up: onWindowUp };
  }

  function unlisten() {
    const attached = windowHandlers.current;
    if (!attached) return;
    window.removeEventListener("pointermove", attached.move);
    window.removeEventListener("pointerup", attached.up);
    window.removeEventListener("pointercancel", attached.up);
    windowHandlers.current = null;
  }

  const api: HandleApi = {
    draggingId,
    place(courseId) {
      const item = byId.get(courseId);
      if (!item) return null;
      const ids = groups[item.status];
      const index = ids.indexOf(courseId);
      if (index === -1) return null;
      return { index, total: ids.length, title: item.title };
    },

    onPointerDown(courseId, event) {
      const item = byId.get(courseId);
      if (!item || groupsRef.current[item.status].length < 2) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerY.current = event.clientY;
      listen();

      if (event.pointerType === "mouse") {
        beginDrag(courseId, item.status, event.clientY);
        return;
      }
      // Touch and pen: the row lifts only after a deliberate hold, so brushing past the handle
      // while reading the list can never rearrange it.
      const y = event.clientY;
      const x = event.clientX;
      clearHold();
      hold.current = {
        x,
        y,
        timer: window.setTimeout(() => {
          hold.current = null;
          beginDrag(courseId, item.status, y);
        }, HOLD_MS),
      };
    },

    onKeyDown(courseId, event) {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      const item = byId.get(courseId);
      if (!item) return;
      const ids = groupsRef.current[item.status];
      const from = ids.indexOf(courseId);
      const to = event.key === "ArrowUp" ? from - 1 : from + 1;
      event.preventDefault();
      if (from === -1 || to < 0 || to >= ids.length) return;

      const next = moved(ids, from, to);
      applyGroups({ ...groupsRef.current, [item.status]: next });
      setError(null);
      setAnnouncement(`${item.title} moved to position ${to + 1} of ${ids.length}.`);

      // Held arrow keys become ONE write rather than a queue of transactions racing each other
      // into the database out of order.
      if (keyTimer.current) window.clearTimeout(keyTimer.current);
      keyTimer.current = window.setTimeout(() => save(item.status, next), KEY_COMMIT_MS);
    },
  };

  const chip = (active: boolean) =>
    `inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold ${
      active
        ? "border-navy-800 bg-navy-800 text-white"
        : "border-line bg-surface text-muted hover:border-navy-200 hover:bg-navy-50 hover:text-navy-800"
    }`;
  const tally = (active: boolean) =>
    `rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
      active ? "bg-white/15 text-white" : "border border-line bg-paper text-muted"
    }`;

  return (
    <BoardContext.Provider value={api}>
    <div className="mt-6">
      {/* One state's worth of courses needs no filter — a single chip is a label pretending to be
          a control. */}
      {shown.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setFilter("ALL")} className={chip(filter === "ALL")}>
            All <span className={tally(filter === "ALL")}>{items.length}</span>
          </button>
          {shown.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={chip(filter === status)}
            >
              {STATUS_LABEL[status]} <span className={tally(filter === status)}>{counts[status]}</span>
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] font-semibold text-red-700"
        >
          {error}
        </p>
      ) : null}

      {/* Keyboard moves are silent otherwise — the list re-orders with nothing said. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {visible.map((status) => (
        <section key={status}>
          {filter === "ALL" && shown.length > 1 ? (
            <div className="mb-2 mt-5 flex flex-wrap items-baseline gap-x-2.5 border-b border-line pb-1.5">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
                {STATUS_LABEL[status]}
              </h2>
              {status === "PUBLISHED" ? (
                <span className="text-[11.5px] text-muted">
                  this is the order employees see them in
                </span>
              ) : null}
            </div>
          ) : null}

          <ul className={filter === "ALL" && shown.length > 1 ? "space-y-2" : "mt-4 space-y-2"}>
            {groups[status].map((id) => {
              const item = byId.get(id);
              if (!item) return null;
              const lifted = draggingId === id;
              return (
                <li
                  key={id}
                  ref={(el) => {
                    if (el) rows.current.set(id, el);
                    else rows.current.delete(id);
                  }}
                  style={lifted ? { transform: `translateY(${dy}px)` } : undefined}
                  className={lifted ? "relative z-20 [&_.ff-card]:shadow-xl" : ""}
                >
                  {item.node}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
    </BoardContext.Provider>
  );
}
