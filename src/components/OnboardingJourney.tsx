"use client";

import { useState, useTransition } from "react";
import { toggleActivity } from "@/app/(app)/onboarding/actions";

export type JourneyItem = {
  id: string;
  title: string;
  description: string | null;
  type: "POLICY" | "ACTION";
  linkUrl: string | null;
  track: "COMMON_CORE" | "CONSULTING";
  done: boolean;
};
export type JourneyStage = { key: string; label: string; items: JourneyItem[] };

export function OnboardingJourney({ stages }: { stages: JourneyStage[] }) {
  const allIds = stages.flatMap((s) => s.items.map((i) => i.id));
  const [doneSet, setDoneSet] = useState<Set<string>>(
    new Set(stages.flatMap((s) => s.items.filter((i) => i.done).map((i) => i.id)))
  );
  const [pending, startTransition] = useTransition();

  const total = allIds.length;
  const completed = allIds.filter((id) => doneSet.has(id)).length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

  function toggle(item: JourneyItem) {
    const next = new Set(doneSet);
    const willBeDone = !next.has(item.id);
    if (willBeDone) next.add(item.id);
    else next.delete(item.id);
    setDoneSet(next);
    startTransition(async () => {
      const res = await toggleActivity(item.id, willBeDone);
      if (!res.ok) {
        // revert on failure
        setDoneSet((cur) => {
          const rb = new Set(cur);
          if (willBeDone) rb.delete(item.id);
          else rb.add(item.id);
          return rb;
        });
      }
    });
  }

  return (
    <div>
      {/* Progress */}
      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-ink">Your progress</span>
          <span className="text-muted">
            {completed} of {total} · {pct}%
          </span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-navy-50">
          <div
            className="h-full rounded-full bg-gold-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {total > 0 && completed === total ? (
          <p className="mt-2 text-sm font-medium text-navy-700">
            🎉 Onboarding complete — welcome aboard!
          </p>
        ) : null}
      </div>

      {/* Stages */}
      <div className="mt-8 space-y-8">
        {stages.map((stage) =>
          stage.items.length === 0 ? null : (
            <section key={stage.key}>
              <h2 className="font-serif text-xl text-ink">{stage.label}</h2>
              <ul className="mt-3 space-y-2">
                {stage.items.map((item) => {
                  const done = doneSet.has(item.id);
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(item)}
                        disabled={pending}
                        aria-pressed={done}
                        className={
                          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition " +
                          (done
                            ? "border-navy-700 bg-navy-700 text-white"
                            : "border-line bg-surface text-transparent hover:border-navy-400")
                        }
                      >
                        ✓
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              "text-sm font-medium " +
                              (done ? "text-muted line-through" : "text-ink")
                            }
                          >
                            {item.title}
                          </span>
                          <span
                            className={
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                              (item.type === "POLICY"
                                ? "bg-navy-50 text-navy-700"
                                : "bg-gold-100 text-gold-800")
                            }
                          >
                            {item.type === "POLICY" ? "Read" : "Do"}
                          </span>
                          {item.track === "CONSULTING" ? (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-muted">
                              Consulting
                            </span>
                          ) : null}
                        </div>
                        {item.description ? (
                          <p className="mt-0.5 text-sm text-muted">{item.description}</p>
                        ) : null}
                        {item.linkUrl ? (
                          <a
                            href={item.linkUrl}
                            className="mt-1 inline-block text-xs font-semibold text-navy-600 hover:text-navy-800"
                          >
                            Open →
                          </a>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )
        )}
      </div>
    </div>
  );
}
