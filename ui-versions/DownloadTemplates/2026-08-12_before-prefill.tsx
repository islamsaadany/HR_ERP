"use client";

const SHEETS = ["people", "assignments", "contributions"] as const;

/**
 * Template downloads for the three incentive sheets: a "Download all" button that
 * fires all three at once (staggered so the browser allows the multi-download),
 * plus the individual links. The template route already sends each as an
 * attachment (Content-Disposition), so a plain anchor click downloads it.
 */
export function DownloadTemplates() {
  function downloadAll() {
    SHEETS.forEach((sheet, i) => {
      window.setTimeout(() => {
        const a = document.createElement("a");
        a.href = `/api/incentive/template/${sheet}`;
        a.download = `${sheet}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 300);
    });
  }

  return (
    <button
      type="button"
      onClick={downloadAll}
      className="shrink-0 rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-700"
    >
      ⬇ Download all templates
    </button>
  );
}
