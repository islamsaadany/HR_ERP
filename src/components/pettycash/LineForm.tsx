import { addLine } from "@/app/(app)/petty-cash/actions";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ACCEPT_ATTRIBUTE, LIMITS_HINT } from "@/lib/finance/evidence";
import { toDateInput } from "@/lib/labels";

type Option = { id: string; name: string };

/**
 * Log a spend (spec 039). The screen that gets used daily, often on a phone in a shop — so the
 * receipt is attached here rather than emailed to Finance later, and only the five fields that
 * genuinely matter are required.
 *
 * Category, payee and payment details are optional on purpose: half the workbook's rows leave
 * them blank, and forcing them would produce junk values rather than data.
 *
 * No client component: the payment-method choice is two radios styled with `peer-checked`, so
 * the form works before any JavaScript loads.
 */
export function LineForm({
  periodId,
  sections,
  categories,
  defaultDate,
}: {
  periodId: string;
  sections: Option[];
  categories: Option[];
  defaultDate: Date;
}) {
  return (
    <details className="mt-5 rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-navy-800 [&::-webkit-details-marker]:hidden">
        <span aria-hidden>+</span> Log a spend
      </summary>

      <form action={addLine} className="grid gap-4 border-t border-line p-4 md:grid-cols-2">
        <input type="hidden" name="periodId" value={periodId} />

        <Field label="Date paid">
          <input
            type="date"
            name="datePaid"
            required
            defaultValue={toDateInput(defaultDate)}
            className={INPUT}
          />
        </Field>

        <Field
          label="Amount (EGP)"
          help="Two decimals. Amounts are never rounded — it has to match the receipt."
        >
          <input
            type="text"
            name="amount"
            required
            inputMode="decimal"
            placeholder="1530.00"
            className={INPUT}
          />
        </Field>

        <Field label="Section">
          <select name="sectionId" required defaultValue="" className={INPUT}>
            <option value="" disabled>
              Choose…
            </option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Category" optional>
          <select name="categoryId" defaultValue="" className={INPUT}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="md:col-span-2">
          <Field label="Description">
            <input
              type="text"
              name="description"
              required
              maxLength={500}
              placeholder="Office monthly cleaning"
              className={INPUT}
            />
          </Field>
        </div>

        <Field
          label="How was it paid?"
          help="“Company transfer” means Finance paid the vendor directly — it won't touch the float balance."
        >
          <div className="flex w-fit overflow-hidden rounded-lg border border-navy-200">
            <Radio name="method" value="FLOAT" label="From the float" defaultChecked />
            <Radio name="method" value="COMPANY_TRANSFER" label="Company transfer" />
          </div>
        </Field>

        <Field label="Paid to" optional>
          <input type="text" name="payee" maxLength={200} placeholder="Eman M M" className={INPUT} />
        </Field>

        <div className="md:col-span-2">
          <Field label="Payment details" optional>
            <input
              type="text"
              name="paymentDetails"
              maxLength={200}
              placeholder="InstaPay ref 2837…"
              className={INPUT}
            />
          </Field>
        </div>

        <div className="md:col-span-2">
          <Field label="Receipt" help={LIMITS_HINT} optional>
            <input
              type="file"
              name="files"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="rounded-lg border border-dashed border-navy-200 bg-paper px-3 py-3 text-[12.5px] text-muted file:mr-3 file:rounded-md file:border file:border-navy-200 file:bg-surface file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-navy-700"
            />
          </Field>
          <p className="mt-1.5 text-[11.5px] text-muted">
            You can save without one — the line will show as <b>No receipt</b> until you attach it.
          </p>
        </div>

        <div className="flex justify-end md:col-span-2">
          <PendingSubmitButton
            pendingLabel="Saving…"
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900"
          >
            Save this spend
          </PendingSubmitButton>
        </div>
      </form>
    </details>
  );
}

const INPUT =
  "w-full rounded-lg border border-navy-200 bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

function Field({
  label,
  help,
  optional,
  children,
}: {
  label: string;
  help?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-navy-700">
        {label}
        {optional ? <span className="ml-1 font-normal text-muted">(optional)</span> : null}
      </span>
      {children}
      {help ? <span className="text-[11px] text-muted">{help}</span> : null}
    </label>
  );
}

function Radio({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span className="block bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-navy-700 peer-checked:bg-navy-800 peer-checked:text-white">
        {label}
      </span>
    </label>
  );
}
