"use client";

import { useMemo, useState, useTransition } from "react";
import {
  STEP,
  evaluateBasket,
  computeMedicalPremium,
  type MedicalConfig,
} from "@/lib/benefits/rules";
import { coveredAmount, outOfPocket } from "@/lib/benefits/coverage";
import { saveBasket, reopenOwnSelection, type SelectionPayload } from "@/app/(app)/benefits/actions";

type CatalogItem = {
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  isMedical: boolean;
  coverageRate: number; // company coverage %, 0–100 (spec 012)
};
type Rate = {
  self: number;
  spouse: number;
  childUnder18: number;
  child18Plus: number;
};

const egp = (n: number) => "EGP " + Math.round(n).toLocaleString();

/** The Cost · Company pays (r%) · You pay line shown under a selected benefit (spec 012, DC-3). */
function CoverageLine({ cost, rate }: { cost: number; rate: number }) {
  const covered = coveredAmount(cost, rate);
  const you = outOfPocket(cost, rate);
  return (
    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
      <span className="text-muted">
        Cost <span className="font-semibold tabular-nums text-ink">{egp(cost)}</span>
      </span>
      <span className="text-line">·</span>
      <span className="text-muted">
        Company pays ({rate}%){" "}
        <span className="font-semibold tabular-nums text-navy-700">{egp(covered)}</span>
      </span>
      <span className="text-line">·</span>
      <span className="text-muted">
        You pay <span className="font-semibold tabular-nums text-gold-700">{egp(you)}</span>
      </span>
    </div>
  );
}

export function BenefitsSelector({
  employmentType,
  ceiling,
  catalog,
  medicalRate,
  initialCosts,
  initialMedical,
  initialStatus,
  lockedClaimed = {},
}: {
  employmentType: "FULL_TIME" | "PART_TIME";
  ceiling: number;
  catalog: CatalogItem[];
  medicalRate: Rate;
  /** catalog key → the COST the employee entered (spec 012). */
  initialCosts: Record<string, number>;
  initialMedical: MedicalConfig;
  initialStatus: "DRAFT" | "SUBMITTED" | "NONE";
  /** catalog key → covered amount already claimed (pending or reimbursed); can't be deselected or reduced below it. */
  lockedClaimed?: Record<string, number>;
}) {
  const [costs, setCosts] = useState<Record<string, number>>(initialCosts);
  const [medical, setMedical] = useState<MedicalConfig>(initialMedical);
  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [serverMsg, setServerMsg] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [pending, startTransition] = useTransition();

  const locked = status === "SUBMITTED";
  const medicalItem = catalog.find((c) => c.isMedical);
  const nonMedical = catalog.filter((c) => !c.isMedical);
  const rateOf = (key: string) => catalog.find((c) => c.key === key)?.coverageRate ?? 100;

  // Group the whole catalog (medical + non-medical) by category, preserving order.
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, CatalogItem[]>();
    for (const c of catalog) {
      const cat = c.category ?? "Other";
      if (!map.has(cat)) {
        map.set(cat, []);
        order.push(cat);
      }
      map.get(cat)!.push(c);
    }
    return order.map((cat) => ({ cat, items: map.get(cat)! }));
  }, [catalog]);

  const result = useMemo(
    () =>
      evaluateBasket({
        employmentType,
        ceiling,
        lines: nonMedical
          .filter((c) => (costs[c.key] ?? 0) > 0)
          .map((c) => ({ key: c.key, name: c.name, cost: costs[c.key] ?? 0, coverageRate: c.coverageRate })),
        medical,
        medicalRate,
      }),
    [costs, medical, employmentType, ceiling, nonMedical, medicalRate]
  );

  const pct = Math.min(100, ceiling > 0 ? (result.total / ceiling) * 100 : 0);

  // Once the max is reached, unselected items can't be added until one is deselected.
  const atMax = result.selectionCount >= result.maxSelect;

  // Claimed floor is a COVERED amount; convert to the minimum COST that still covers it.
  const claimedCovered = (key: string) => lockedClaimed[key] ?? 0;
  const costFloor = (key: string) => {
    const claimed = claimedCovered(key);
    if (claimed <= 0) return 0;
    const rate = rateOf(key);
    if (rate <= 0) return 0;
    return Math.ceil((claimed * 100) / rate / STEP) * STEP;
  };
  const medicalClaimed = medicalItem ? claimedCovered(medicalItem.key) : 0;

  function setCost(key: string, val: number) {
    if (locked) return;
    // A claimed benefit can be raised but never dropped below the cost that covers what's claimed.
    const floor = costFloor(key);
    setCosts((a) => ({ ...a, [key]: Math.max(floor, Math.max(0, val)) }));
  }
  function toggleItem(key: string) {
    if (locked) return;
    const on = (costs[key] ?? 0) > 0;
    // Can't deselect a claimed benefit; can't add past the max.
    if (on && claimedCovered(key) > 0) return;
    if (!on && atMax) return;
    setCosts((a) => {
      const next = { ...a };
      if ((next[key] ?? 0) > 0) delete next[key];
      else next[key] = Math.max(STEP, costFloor(key));
      return next;
    });
  }

  function persist(submit: boolean) {
    const payload: SelectionPayload = {
      items: nonMedical.map((c) => ({ key: c.key, cost: costs[c.key] ?? 0 })),
      medical,
    };
    startTransition(async () => {
      const res = await saveBasket(payload, submit);
      setServerMsg({ errors: res.errors, warnings: res.warnings });
      if (res.ok && res.status) setStatus(res.status);
    });
  }

  // Self-service reopen: unlock this employee's own submitted basket back to an editable draft so
  // they can allocate the rest of their pool and re-submit — no HR needed.
  function reopen() {
    startTransition(async () => {
      const res = await reopenOwnSelection();
      if (res.ok && res.status) {
        setServerMsg(null);
        setStatus(res.status);
      } else if (res.error) {
        setServerMsg({ errors: [res.error], warnings: [] });
      }
    });
  }

  const medicalPreview = computeMedicalPremium(medicalRate, { ...medical, selected: true });

  // Rows for the "Selected" summary panel — company share (covered) headline + cost/you-pay subtext.
  const selectedRows: { name: string; covered: number; cost: number; you: number; over: boolean; medical?: boolean }[] = [
    ...nonMedical
      .filter((c) => (costs[c.key] ?? 0) > 0)
      .map((c) => {
        const cost = costs[c.key] ?? 0;
        const covered = coveredAmount(cost, c.coverageRate);
        return {
          name: c.name,
          covered,
          cost,
          you: cost - covered,
          over: employmentType === "FULL_TIME" && covered > result.cap,
        };
      }),
    ...(medical.selected && medicalItem
      ? [{ name: medicalItem.name, covered: result.medicalAmount, cost: result.medicalAmount, you: 0, over: false, medical: true }]
      : []),
  ];

  // Terms — shared by the draft aside and the submitted full-width band.
  const terms: string[] = [
    `You may select a maximum of ${result.maxSelect} benefits from the menu each year.`,
    "You enter each benefit's full cost; the company covers a set percentage of it (shown per benefit), and only that covered share draws from your pool. You pay the rest.",
    ...(employmentType === "FULL_TIME"
      ? ["No single benefit's company share may exceed 50% of your pool — in practice you'll choose at least two."]
      : []),
    "Medical insurance is 100% covered and exempt from the 50% rule — it may exceed half your pool, but never your pool ceiling. Premiums follow the company rate card.",
    "Your pool is set by your employment type and tenure band, and is the maximum company contribution for the year.",
    "Benefits are reimbursed against actual spend — submit proof to Finance; you're reimbursed the covered (company) portion.",
    "Any covered amount not claimed does not carry over to the following year, and is not paid out as cash.",
    "Guaranteed benefits are separate from the basket and are not affected by your choices.",
  ];

  // ── Submitted (locked) view: read-only summary + sticky total + terms below ──
  if (locked) {
    return (
      <>
        {/* Confirmation banner — with self-service "Update my basket" (reopen). */}
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-navy-200 bg-navy-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy-700 text-sm font-bold text-white">✓</span>
            <div>
              <div className="font-semibold text-navy-800">Your benefits basket is submitted.</div>
              <p className="mt-0.5 text-sm text-navy-700">
                Here&apos;s what you chose. You can update it any time while selection is open — the benefits you&apos;ve
                already claimed stay locked.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={reopen}
            disabled={pending}
            className="shrink-0 rounded-lg border border-navy-300 bg-white px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-navy-100 disabled:opacity-60"
          >
            {pending ? "Opening…" : "Update my basket"}
          </button>
        </div>

        {/* Reopen error (e.g. the window closed in the meantime). */}
        {serverMsg?.errors.length ? (
          <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            <ul className="list-disc pl-4">{serverMsg.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        ) : null}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
          {/* Left: read-only selections */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="border-b border-line px-5 py-3">
              <h3 className="font-serif text-lg text-ink">Your selections</h3>
              <p className="text-xs text-muted">The flexible benefits you chose for this year — company share drawn from your pool.</p>
            </div>
            {selectedRows.length === 0 ? (
              <p className="px-5 py-4 text-sm italic text-muted">No flexible benefits selected.</p>
            ) : (
              <div className="divide-y divide-line px-5">
                {selectedRows.map((r) => (
                  <div key={r.name} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <span className="text-sm font-medium text-ink">{r.name}</span>
                      {!r.medical ? (
                        <div className="text-xs text-muted">Cost {egp(r.cost)} · you pay {egp(r.you)}</div>
                      ) : (
                        <div className="text-xs text-muted">100% covered</div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-serif text-navy-800 tabular-nums">{egp(r.covered)}</span>
                      <div className="text-[11px] text-muted">company share</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: total box (sticky, read-only) */}
          <aside>
            <div className="rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-24">
              <div className="text-3xl font-serif text-ink tabular-nums">{egp(result.total)}</div>
              <div className="text-sm text-muted">company share of {egp(ceiling)} pool</div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-navy-50">
                <div className="h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 flex justify-between text-sm">
                <span className="text-muted">Remaining</span>
                <span className="font-semibold text-navy-700">{egp(Math.max(0, result.remaining))}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-muted">Benefits chosen</span>
                <span className="font-semibold text-ink">{result.selectionCount} of {result.maxSelect}</span>
              </div>
              <p className="mt-3 text-xs text-muted">Use “Update my basket” above to change these while selection is open.</p>
            </div>
          </aside>
        </div>

        {/* Terms — full width, multi-column, below the selection */}
        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-3">
            <h3 className="font-serif text-lg text-ink">Terms &amp; conditions</h3>
            <p className="text-xs text-muted">How the flexible basket works.</p>
          </div>
          <ol className="grid gap-x-8 px-5 py-1 sm:grid-cols-2">
            {terms.map((t, i) => (
              <li key={i} className="flex gap-2.5 py-2.5 text-xs leading-relaxed text-muted">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-navy-50 text-[10px] font-semibold text-navy-700">
                  {i + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mt-6 grid gap-6 pb-28 lg:grid-cols-[1fr_320px] lg:pb-0">
      {/* Basket */}
      <div>
        {groups.map((group) => (
          <div key={group.cat}>
            {/* Category header with divider line */}
            <div className="flex items-center gap-3 pb-1 pt-5 first:pt-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold-600">
                {group.cat}
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <div className="space-y-2">
              {group.items.map((item) =>
                item.isMedical ? (
                  <div
                    key={item.key}
                    className={
                      "flex items-start gap-3 rounded-xl border border-line bg-surface p-4 " +
                      (!medical.selected && atMax ? "opacity-50" : "")
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (locked) return;
                        if (medical.selected) {
                          if (medicalClaimed > 0) return; // claimed — can't deselect
                          setMedical({ ...medical, selected: false });
                        } else {
                          if (atMax) return; // max reached — deselect one first
                          setModalOpen(true);
                        }
                      }}
                      disabled={locked || (medical.selected && medicalClaimed > 0) || (!medical.selected && atMax)}
                      className={
                        "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition " +
                        (medical.selected ? "border-navy-700 bg-navy-700 text-white" : "border-line text-transparent")
                      }
                    >
                      ✓
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink">{item.name}</span>
                        <span className="rounded bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gold-800">
                          50% exempt
                        </span>
                        {medical.selected && medicalClaimed > 0 ? (
                          <span className="rounded bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy-700">Claimed</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted">
                        {medical.selected
                          ? `You${medical.spouse ? " + spouse" : ""}${
                              medical.childrenUnder18 + medical.children18Plus > 0
                                ? ` + ${medical.childrenUnder18 + medical.children18Plus} child(ren)`
                                : ""
                            }`
                          : item_desc(item)}
                      </div>
                      {medical.selected ? (
                        <CoverageLine cost={result.medicalAmount} rate={100} />
                      ) : null}
                    </div>
                    {medical.selected ? (
                      <button type="button" disabled={locked} onClick={() => setModalOpen(true)} className="mt-0.5 shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-navy-50">Edit</button>
                    ) : (
                      <span className="mt-0.5 shrink-0 text-xs text-muted">Configure cover</span>
                    )}
                  </div>
                ) : (
                  (() => {
                    const cost = costs[item.key] ?? 0;
                    const on = cost > 0;
                    const covered = coveredAmount(cost, item.coverageRate);
                    const over = employmentType === "FULL_TIME" && covered > result.cap;
                    const claimed = claimedCovered(item.key);
                    const claimLocked = claimed > 0;
                    const floor = costFloor(item.key);
                    const blockedByMax = !on && atMax;
                    const selectDisabled = locked || claimLocked || blockedByMax;
                    return (
                      <div
                        key={item.key}
                        className={
                          "flex items-start gap-3 rounded-xl border bg-surface p-4 " +
                          (over ? "border-red-300 " : "border-line ") +
                          (blockedByMax ? "opacity-50 " : "") +
                          (claimLocked ? "opacity-70 " : "")
                        }
                      >
                        <button
                          type="button"
                          onClick={() => toggleItem(item.key)}
                          disabled={selectDisabled}
                          aria-label={claimLocked ? "Claimed — can't remove" : blockedByMax ? "Maximum benefits reached" : "Select"}
                          className={
                            "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition " +
                            (on ? "border-navy-700 bg-navy-700 text-white" : "border-line text-transparent") +
                            (selectDisabled ? " cursor-not-allowed" : "")
                          }
                        >
                          ✓
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink">{item.name}</span>
                            <span className="rounded bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy-700">
                              {item.coverageRate}% covered
                            </span>
                            {claimLocked ? (
                              <span className="rounded bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy-700">Claimed</span>
                            ) : null}
                          </div>
                          {item.description ? (
                            <div className="text-xs text-muted">{item.description}</div>
                          ) : null}
                          {on ? <CoverageLine cost={cost} rate={item.coverageRate} /> : null}
                          {claimLocked ? (
                            <div className="mt-1 text-xs text-muted">Claimed {egp(claimed)} — can’t remove or reduce below this.</div>
                          ) : blockedByMax ? (
                            <div className="mt-1 text-xs text-muted">Max {result.maxSelect} reached — deselect one to add this.</div>
                          ) : over ? (
                            <div className="mt-1 text-xs font-medium text-red-600">
                              Company share over the 50% cap (max {egp(result.cap)})
                            </div>
                          ) : null}
                        </div>
                        {on ? (
                          <div className="mt-0.5 flex shrink-0 items-center gap-1">
                            <button type="button" disabled={locked || cost <= floor} onClick={() => setCost(item.key, cost - STEP)} className="h-8 w-8 rounded-lg border border-line text-muted hover:bg-navy-50 disabled:opacity-40">−</button>
                            <input
                              value={cost.toLocaleString()}
                              onChange={(e) =>
                                setCost(item.key, parseInt(e.target.value.replace(/[^0-9]/g, "")) || 0)
                              }
                              disabled={locked}
                              aria-label={`${item.name} cost`}
                              className="w-24 rounded-lg border border-line px-2 py-1.5 text-right text-sm tabular-nums"
                            />
                            <button type="button" disabled={locked} onClick={() => setCost(item.key, cost + STEP)} className="h-8 w-8 rounded-lg border border-line text-muted hover:bg-navy-50">+</button>
                          </div>
                        ) : (
                          <span className="mt-0.5 shrink-0 text-xs text-muted">{blockedByMax ? "Max reached" : "Select to enter a cost"}</span>
                        )}
                      </div>
                    );
                  })()
                )
              )}
            </div>
          </div>
        ))}

        {/* Server messages */}
        {serverMsg?.errors.length ? (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            <ul className="list-disc pl-4">{serverMsg.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        ) : null}
        {serverMsg && serverMsg.warnings.length > 0 ? (
          <div className="mt-3 rounded-lg bg-gold-50 px-4 py-2 text-sm text-gold-800">
            {serverMsg.warnings.join(" ")}
          </div>
        ) : null}
      </div>

      {/* Right column: meter + selected + terms */}
      <aside className="space-y-4">
        {/* Meter / actions — sticky on desktop so the running calculation follows you while you scroll. */}
        <div className="rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-24 lg:z-10">
          <div className="text-3xl font-serif text-ink tabular-nums">{egp(result.total)}</div>
          <div className="text-sm text-muted">company share of {egp(ceiling)} pool</div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-navy-50">
            <div
              className={"h-full rounded-full " + (result.total > ceiling ? "bg-red-500" : "bg-gold-500")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-muted">{result.remaining < 0 ? "Over by" : "Remaining"}</span>
            <span className={result.remaining < 0 ? "font-semibold text-red-600" : "font-semibold text-navy-700"}>
              {egp(Math.abs(result.remaining))}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-sm">
            <span className="text-muted">Benefits chosen</span>
            <span className="font-semibold text-ink">{result.selectionCount} of {result.maxSelect}</span>
          </div>
          {atMax ? (
            <p className="mt-1 text-xs font-medium text-gold-700">
              Max reached — deselect one to choose a different benefit.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted">
            The pool tracks the company&apos;s share. No single benefit&apos;s company share may exceed 50% of the pool ({egp(result.cap)}). Medical is exempt.
          </p>

          {!locked ? (
            <div className="mt-5 space-y-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => persist(false)}
                className="w-full rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                disabled={pending || result.errors.length > 0}
                onClick={() => persist(true)}
                className="w-full rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
              >
                Submit basket
              </button>
              {result.errors.length > 0 ? (
                <p className="text-xs text-muted">Resolve the highlighted issues to submit.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Selected summary — company share headline + cost/you-pay subtext */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-3">
            <h3 className="font-serif text-lg text-ink">Selected</h3>
            <p className="text-xs text-muted">Company share drawn from your pool.</p>
          </div>
          <div className="px-5 py-3">
            {selectedRows.length === 0 ? (
              <p className="py-1 text-sm italic text-muted">Nothing selected yet.</p>
            ) : (
              <div className="divide-y divide-line">
                {selectedRows.map((r) => (
                  <div key={r.name} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-muted">{r.name}</span>
                      {!r.medical ? (
                        <div className="text-[11px] text-muted/80">Cost {egp(r.cost)} · you pay {egp(r.you)}</div>
                      ) : null}
                    </div>
                    <span className={"shrink-0 font-semibold tabular-nums " + (r.over ? "text-red-600" : "text-ink")}>
                      {egp(r.covered)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Terms & conditions */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-3">
            <h3 className="font-serif text-lg text-ink">Terms &amp; conditions</h3>
            <p className="text-xs text-muted">How the flexible basket works.</p>
          </div>
          <ol className="divide-y divide-line px-5 py-1">
            {terms.map((t, i) => (
              <li key={i} className="flex gap-2.5 py-2.5 text-xs leading-relaxed text-muted">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-navy-50 text-[10px] font-semibold text-navy-700">
                  {i + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      {/* Mobile floating summary — keeps the running total/actions visible while scrolling the list. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-serif text-lg text-ink tabular-nums">{egp(result.total)}</span>
              <span className="text-xs text-muted">company share of {egp(ceiling)}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-navy-50">
              <div
                className={"h-full rounded-full " + (result.total > ceiling ? "bg-red-500" : "bg-gold-500")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px]">
              <span className={result.remaining < 0 ? "font-semibold text-red-600" : "text-muted"}>
                {result.remaining < 0
                  ? `Over by ${egp(Math.abs(result.remaining))}`
                  : `${egp(result.remaining)} left`}
              </span>
              <span className="text-muted">
                {result.selectionCount} of {result.maxSelect}
              </span>
            </div>
          </div>
          {locked ? (
            <span className="shrink-0 rounded-lg bg-navy-50 px-3 py-2 text-xs font-semibold text-navy-700">
              Locked
            </span>
          ) : (
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                type="button"
                disabled={pending}
                onClick={() => persist(false)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={pending || result.errors.length > 0}
                onClick={() => persist(true)}
                className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Medical modal */}
      {modalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-xl text-ink">Personal medical insurance</h3>
            <p className="mt-1 text-sm text-muted">You are always covered. Add dependants below. Medical is 100% company-covered.</p>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-ink">You</div>
                  <div className="text-xs text-muted">{egp(medicalRate.self)}</div>
                </div>
                <span className="text-xs text-muted">Included</span>
              </div>
              <label className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-ink">Spouse</div>
                  <div className="text-xs text-muted">{egp(medicalRate.spouse)}</div>
                </div>
                <input type="checkbox" checked={medical.spouse} onChange={(e) => setMedical({ ...medical, spouse: e.target.checked })} className="h-5 w-5" />
              </label>
              <Counter label="Children under 18" note={egp(medicalRate.childUnder18) + " each"} value={medical.childrenUnder18} onChange={(v) => setMedical({ ...medical, childrenUnder18: v })} />
              <Counter label="Children 18+" note={egp(medicalRate.child18Plus) + " each"} value={medical.children18Plus} onChange={(v) => setMedical({ ...medical, children18Plus: v })} />
            </div>

            <div className="mt-4 flex items-center justify-between rounded-lg bg-navy-50 px-4 py-3">
              <span className="text-sm font-medium text-navy-800">Annual premium (100% covered)</span>
              <span className="font-serif text-lg text-navy-800">{egp(medicalPreview)}</span>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-line px-4 py-2 text-sm text-muted">Cancel</button>
              <button
                type="button"
                onClick={() => { setMedical({ ...medical, selected: true }); setModalOpen(false); }}
                className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </>
  );
}

function item_desc(i: { description: string | null }) {
  return i.description ?? "Health cover for you.";
}

function Counter({
  label,
  note,
  value,
  onChange,
}: {
  label: string;
  note: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-muted">{note}</div>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="h-8 w-8 rounded-lg border border-line text-muted">−</button>
        <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} className="h-8 w-8 rounded-lg border border-line text-muted">+</button>
      </div>
    </div>
  );
}
