import Link from "next/link";
import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { MAX_SELECT_FULL_TIME, MAX_SELECT_PART_TIME } from "@/lib/benefits/rules";
import { PrintButton } from "@/components/benefits/PrintButton";

export const dynamic = "force-dynamic";

/**
 * "How the benefits basket works" — an employee-facing GUIDE, not a config dump.
 *
 * It explains what the basket is, the rules in plain words, how to build a basket, and how to
 * claim reimbursement. It deliberately shows NO figures: pool-ceiling amounts (across all bands),
 * guaranteed-benefit amounts, and the medical rate card are confidential compensation config and
 * live only on the admin Benefits page. An employee still sees their OWN pool and prices their OWN
 * medical cover on the Benefits page itself — this page never exposes other people's numbers.
 *
 * Only the names of the available benefits are listed (the same menu the selector shows), so
 * people know what's on offer — with no amounts attached. Print / Save-as-PDF for an offline copy.
 */
export default async function BenefitsPolicyPage() {
  await requireUser();

  // Names only — no amounts. Guaranteed benefit names can repeat across employment types, so
  // de-duplicate to a single "received automatically" list. The flexible catalog is grouped by
  // category for display, exactly as the selector groups it.
  const [guaranteedBenefits, catalogItems] = await Promise.all([
    prisma.guaranteedBenefit.findMany({ orderBy: { order: "asc" }, select: { name: true } }),
    prisma.benefitCatalogItem.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
      select: { name: true, description: true, category: true, isMedical: true },
    }),
  ]);

  const guaranteedNames = [...new Set(guaranteedBenefits.map((g) => g.name))];

  const byCategory = new Map<string, typeof catalogItems>();
  for (const item of catalogItems) {
    const cat = item.category ?? "Other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  const H2 = "mt-8 font-serif text-xl text-ink";
  const card = "mt-3 rounded-xl border border-line bg-surface p-5";

  return (
    <div>
      {/* Print isolation: only #print-area is visible when printing, regardless of the app shell. */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #print-area, #print-area * { visibility: visible !important; }
        #print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="no-print flex items-center justify-between gap-3">
        <Link href="/benefits" className="text-sm font-medium text-navy-600 hover:text-navy-800">
          ← Back to Benefits
        </Link>
        <PrintButton />
      </div>

      <div id="print-area" className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Benefits guide</p>
        <h1 className="mt-1 font-serif text-3xl text-ink">How the benefits basket works</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Everyone receives a set of <strong>guaranteed benefits</strong> automatically. On top of that you build
          a <strong>flexible basket</strong> from a shared pool of money, choosing the benefits that suit you. Your
          own pool and the exact amounts appear on the Benefits page — this guide explains how it all works.
        </p>

        {/* ── The rules, in plain words. Policy limits only (the max-selection counts) — no money. ── */}
        <h2 className={H2}>The rules</h2>
        <div className={card}>
          <ul className="space-y-2 text-sm text-ink">
            <li>
              <strong>Your pool</strong> is set by your <strong>employment type and tenure band</strong>, and is the
              most the company will contribute for the year. You&apos;ll see your own figure on the Benefits page.
            </li>
            <li>
              <strong>The company co-funds each benefit.</strong> You enter a benefit&apos;s full cost; the company
              covers a set percentage of it (shown per benefit — e.g. 100%, 80%, or 50%), and only that
              <strong> covered share</strong> draws from your pool. You pay the rest. Example: a 10,000 gym
              membership covered at 80% draws 8,000 from your pool; you pay 2,000.
            </li>
            <li>
              <strong>No single flexible benefit&apos;s company share may exceed 50% of your pool</strong> — so
              full-timers choose at least two. (Part-time pools aren&apos;t subject to the 50% cap.)
            </li>
            <li>
              <strong>Medical insurance is exempt from the 50% cap</strong> — it may take more than half your pool, but
              never more than your pool ceiling. You price your own cover when you select it.
            </li>
            <li>
              You may pick up to <strong>{MAX_SELECT_FULL_TIME} flexible benefits if full-time</strong> and up to{" "}
              <strong>{MAX_SELECT_PART_TIME} if part-time</strong>.
            </li>
            <li>
              <strong>Benefits are reimbursed against actual spend</strong> — anything you don&apos;t claim isn&apos;t paid
              out as cash and doesn&apos;t carry over to next year.
            </li>
            <li>
              <strong>Guaranteed benefits are separate</strong> from the basket and are not affected by your choices.
            </li>
          </ul>
        </div>

        {/* ── What you receive automatically — NAMES only, no amounts. ── */}
        <h2 className={H2}>What you receive automatically</h2>
        <p className="mt-1 text-sm text-muted">
          Guaranteed benefits everyone gets, separate from the basket. The amounts for your band are shown on the
          Benefits page.
        </p>
        <div className={card}>
          {guaranteedNames.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {guaranteedNames.map((name) => (
                <li
                  key={name}
                  className="rounded-full border border-line bg-navy-50 px-3 py-1 text-sm text-navy-800"
                >
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Your guaranteed benefits will appear on the Benefits page.</p>
          )}
        </div>

        {/* ── Building the basket: the how-to, then the menu (names/descriptions, no amounts). ── */}
        <h2 className={H2}>Building your flexible basket</h2>
        <div className={card}>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
            <li>Open <strong>Benefits</strong> while a selection window is open.</li>
            <li>
              <strong>Select</strong> the benefits you want and set an amount for each — the running meter shows how
              much of your pool you&apos;ve used and what&apos;s left.
            </li>
            <li>
              For <strong>medical insurance</strong>, choose who&apos;s covered (yourself, and optionally spouse and
              children) — the premium is worked out for you.
            </li>
            <li>
              <strong>Save a draft</strong> any time and come back to it, then <strong>Submit</strong> when you&apos;re
              happy. A submitted basket is locked for the year unless HR reopens it for you.
            </li>
          </ol>
        </div>

        <p className="mt-4 text-sm font-medium text-navy-800">What you can choose from</p>
        <div className={card}>
          {[...byCategory.entries()].map(([cat, items]) => (
            <div key={cat} className="mb-4 last:mb-0">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{cat}</h3>
              <ul className="mt-1 divide-y divide-line">
                {items.map((i) => (
                  <li key={i.name} className="py-2 text-sm">
                    <span className="text-ink">{i.name}</span>
                    {i.isMedical ? (
                      <span className="ml-2 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">Medical</span>
                    ) : null}
                    {i.description ? <div className="text-xs text-muted">{i.description}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── How to claim / get reimbursed. ── */}
        <h2 className={H2}>Claiming &amp; reimbursement</h2>
        <p className="mt-1 text-sm text-muted">How you actually receive the benefits you chose.</p>
        <div className={card}>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
            <li>
              Once your basket is submitted, open the <strong>&quot;Claims &amp; reimbursement&quot;</strong> tab on the
              Benefits page. Each benefit has its own row showing what&apos;s allocated, reimbursed, pending, and left
              to claim — all in <strong>company (covered) terms</strong>.
            </li>
            <li>
              Open a benefit and <strong>file a claim</strong>. Depending on the benefit you&apos;ll either{" "}
              <strong>upload proof</strong> of your full spend (an invoice, receipt, or proof of payment), or simply{" "}
              <strong>request</strong> it — the page tells you which. You&apos;re reimbursed the{" "}
              <strong>covered (company) portion</strong>, up to the amount allocated to that benefit.
            </li>
            <li>
              You can make <strong>several partial claims</strong> against a benefit over the year, up to the amount you
              allocated to it.
            </li>
            <li>
              HR reviews each claim: it moves from <strong>Pending review</strong> to <strong>Reimbursed</strong>, or is{" "}
              <strong>Rejected</strong> with a reason. You can follow every claim&apos;s status on the same tab.
            </li>
            <li>
              Anything you don&apos;t claim by year end isn&apos;t paid out as cash and doesn&apos;t carry over.
            </li>
          </ol>
        </div>

        <p className="mt-8 text-xs text-muted">
          Your own pool and benefit amounts depend on your employment type and tenure as recorded by HR, and appear on
          the Benefits page. This guide explains the rules and process only.
        </p>
      </div>
    </div>
  );
}
