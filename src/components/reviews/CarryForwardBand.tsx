/**
 * What the pair agreed last quarter, at the top of this quarter's sheet.
 *
 * Only a finalised outcome reaches here — an outcome one party never
 * acknowledged is not something they agreed, so it never carries.
 */
export function CarryForwardBand({
  outcome,
  label,
}: {
  outcome: {
    priorities: string;
    risks: string;
    successDefinition: string;
  };
  label: string;
}) {
  const lines: [string, string][] = [
    ["Priorities", outcome.priorities],
    ["Watch", outcome.risks],
    ["A good next review looks like", outcome.successDefinition],
  ];

  return (
    <div className="rounded-r-xl border-l-[3px] border-gold-500 bg-[#fbf9f2] px-4 py-3">
      <h3 className="font-serif text-[14.5px] text-navy-900">
        What you agreed last quarter — {label}
      </h3>
      <ul className="mt-1.5 space-y-1 text-[13px]">
        {lines
          .filter(([, value]) => value.trim() !== "")
          .map(([term, value]) => (
            <li key={term}>
              <span className="font-semibold text-navy-800">{term}:</span>{" "}
              <span className="text-ink">{value}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
