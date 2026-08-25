import type { SealStep } from "@/lib/reviews/access";

/**
 * The four-step bar at the top of a sheet.
 *
 * It exists so nobody has to remember the rule: submitting is not the same as
 * showing, and it takes BOTH people confirming the meeting to open the halves.
 */
export function SealProgress({
  step,
  openedAt,
  bothSubmitted,
}: {
  step: SealStep;
  openedAt: Date | null;
  bothSubmitted: boolean;
}) {
  const steps = [
    { key: "write", label: "Write your half", detail: "Save as often as you like" },
    { key: "submit", label: "Both submit", detail: "Means “ready to meet”" },
    { key: "met", label: "Both confirm you met", detail: "Both of you, not one" },
    { key: "open", label: "Halves open & lock", detail: "Agree the outcome" },
  ] as const;

  const reached =
    step === "open" ? 4 : step === "waiting-met" ? 3 : step === "waiting-submit" ? 2 : 1;

  return (
    <ol className="flex flex-wrap overflow-hidden rounded-xl border border-line bg-surface">
      {steps.map((s, i) => {
        const index = i + 1;
        const done = index < reached || (step === "open" && index <= 4);
        const now = index === reached && step !== "open";
        return (
          <li
            key={s.key}
            className={`min-w-[150px] flex-1 border-r border-line px-3 py-2.5 last:border-r-0 ${
              now ? "bg-navy-800" : done ? "bg-green-50" : ""
            }`}
          >
            <div
              className={`text-[9.5px] font-extrabold uppercase tracking-wider ${
                now ? "text-gold-300" : done ? "text-green-700" : "text-muted"
              }`}
            >
              {now ? "Now" : done ? "Done" : "Then"}
            </div>
            <div
              className={`mt-0.5 text-[12.5px] font-semibold ${now ? "text-white" : "text-ink"}`}
            >
              {s.label}
            </div>
            <div className={`mt-0.5 text-[11px] ${now ? "text-white/75" : "text-muted"}`}>
              {s.key === "open" && openedAt
                ? `Locked ${openedAt.toLocaleDateString("en-GB")}`
                : s.key === "submit" && bothSubmitted
                  ? "Both ready"
                  : s.detail}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
