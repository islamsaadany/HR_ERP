"use client";

/** Print / Save-as-PDF trigger for the benefits policy page. Hidden in the printout itself. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
    >
      🖨 Print / Save as PDF
    </button>
  );
}
