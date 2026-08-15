"use client";

import { useState } from "react";
import { markOrientationSeen } from "@/app/(app)/benefits/actions";

import { formatEGP as egp } from "@/lib/labels";

export type OrientationProps = {
  employeeName: string;
  employmentTypeLabel: string | null;
  tenureBandLabel: string | null;
  ceiling: number | null;
  guaranteed: { name: string; amount: number | null; salaryDriven: boolean }[];
  categories: string[];
  /** Auto-open on first render (server-computed: not submitted + not seen + selector available). */
  autoOpen: boolean;
};

export function BenefitsOrientation(props: OrientationProps) {
  const [open, setOpen] = useState(props.autoOpen);
  const [step, setStep] = useState(0);
  const firstName = (props.employeeName || "").trim().split(/\s+/)[0] || "there";

  function close() {
    setOpen(false);
    setStep(0);
    // Mark seen so it stops auto-opening (idempotent; the button below ignores the flag).
    void markOrientationSeen();
  }

  const steps = buildSteps(props, firstName);
  const last = step === steps.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => { setStep(0); setOpen(true); }}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
      >
        How it works
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 p-4 backdrop-blur-md"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-navy-100 bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1.5 bg-gradient-to-r from-navy-800 to-gold-500" />
            <button
              type="button"
              onClick={close}
              className="absolute right-3 top-3 text-xs font-medium text-navy-300 hover:text-navy-600"
            >
              Skip ✕
            </button>

            <div className="px-6 pb-2 pt-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-600">
                {steps[step].eyebrow}
              </div>
              <h2 className="mt-1.5 font-serif text-2xl text-ink">{steps[step].title}</h2>
              {steps[step].intro ? <p className="mt-1 text-sm text-muted">{steps[step].intro}</p> : null}
              <div className="mt-3">{steps[step].body}</div>
            </div>

            <div className="flex items-center justify-between gap-3 px-6 pb-5 pt-3">
              <div className="flex gap-1.5">
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={
                      "h-1.5 rounded-full transition-all " +
                      (i === step ? "w-5 bg-gold-500" : "w-1.5 bg-navy-100")
                    }
                  />
                ))}
              </div>
              <div className="flex gap-2">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-navy-700 hover:bg-navy-50"
                  >
                    ← Back
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => (last ? close() : setStep((s) => s + 1))}
                  className="rounded-lg bg-navy-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-navy-700"
                >
                  {last ? "Got it" : "Next →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function buildSteps(p: OrientationProps, firstName: string) {
  const stat = (k: string, v: string) => (
    <div className="mb-2 flex items-baseline justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
      <span className="text-sm text-muted">{k}</span>
      <span className="font-serif text-base text-navy-800 tabular-nums">{v}</span>
    </div>
  );
  const ruleRow = (badge: string, node: React.ReactNode) => (
    <div className="flex gap-2.5 py-1.5 text-sm text-ink">
      <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-navy-50 text-[11px] font-bold text-navy-700">{badge}</span>
      <span>{node}</span>
    </div>
  );

  return [
    {
      eyebrow: `Welcome, ${firstName}`,
      title: "Here's you",
      intro: "Your benefits are set by your role and how long you've been here.",
      body: (
        <>
          {stat("Employment type", p.employmentTypeLabel ?? "Not set")}
          {stat("Tenure band", p.tenureBandLabel ?? "Not set")}
          {p.ceiling != null ? (
            <div className="rounded-xl border border-navy-100 bg-navy-50 p-3.5 text-center">
              <div className="font-serif text-3xl text-navy-800 tabular-nums">{egp(p.ceiling)}</div>
              <div className="text-xs text-muted">your annual flexible pool</div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-3 text-center text-sm text-muted">
              Your pool is set once HR confirms your type and tenure.
            </p>
          )}
        </>
      ),
    },
    {
      eyebrow: "Already yours",
      title: "What you already get",
      intro: "These guaranteed benefits are yours automatically — separate from the flexible basket.",
      body:
        p.guaranteed.length === 0 ? (
          <p className="text-sm text-muted">Your guaranteed benefits will appear here once configured.</p>
        ) : (
          <div>
            {p.guaranteed.map((g) => (
              <div key={g.name} className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-sm first:border-t-0">
                <span className="text-ink">{g.name}</span>
                {g.salaryDriven ? (
                  <span className="text-xs italic text-muted">1 month salary</span>
                ) : g.amount != null ? (
                  <span className="font-semibold text-navy-800 tabular-nums">{egp(g.amount)}</span>
                ) : (
                  <span className="text-xs text-muted">—</span>
                )}
              </div>
            ))}
          </div>
        ),
    },
    {
      eyebrow: "Using your pool",
      title: "Claim as you go — all year",
      intro: "There's nothing to submit. Claim from these categories any time during the year:",
      body: (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {p.categories.map((c) => (
              <span key={c} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-navy-700">{c}</span>
            ))}
          </div>
          {ruleRow("1", <>When you spend, enter the benefit&apos;s <strong>full price</strong> (the amount on your receipt).</>)}
          {ruleRow("2", <>The company covers a <strong>set %</strong> — that part comes from your pool, you pay the rest. <span className="font-semibold text-gold-700">e.g. a 10,000 gym at 80% → 8,000 from your pool, you pay 2,000.</span></>)}
          {ruleRow("3", <><strong>Claim in full or in parts</strong> — e.g. 2,000 for a course now, more later — and come back through the year.</>)}
        </>
      ),
    },
    {
      eyebrow: "Good to know",
      title: "The rules, quickly",
      intro: undefined,
      body: (
        <>
          {ruleRow("%", <><strong>Coverage varies</strong> — 100% (medical, check-up, coaching), 80% (gym, sports, schooling…), 50% (mobile, home-office).</>)}
          {ruleRow("½", <>Across the year, no single benefit&apos;s company share can pass <strong>half your pool</strong> — this keeps your choices varied. <span className="text-muted">(Medical is exempt.)</span></>)}
          {ruleRow("✓", <><strong>Claims:</strong> show proof of your full spend (or request it); you&apos;re paid back the covered portion — and you can claim the same benefit <strong>more than once</strong>.</>)}
          {ruleRow("🏥", <><strong>Medical is the one thing you submit</strong> — set it up once for the year; HR manages it after, since it&apos;s arranged with a provider.</>)}
          <p className="mt-3">
            <a href="/benefits/policy" className="text-sm font-semibold text-navy-600 hover:text-navy-800">Read the full guide →</a>
          </p>
        </>
      ),
    },
  ];
}
