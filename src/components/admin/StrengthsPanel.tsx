"use client";

import { useActionState, useState } from "react";
import {
  parseStrengthsUpload,
  confirmStrengthsProfile,
  clearStrengthsProfile,
  type StrengthsProposal,
  type StrengthsSaveState,
} from "@/app/(app)/admin/employees/strengths-actions";

export type ThemeOption = { code: string; name: string; domain: string };
export type SavedTheme = { rank: number; code: string; name: string; domain: string };

const DOMAIN_LABEL: Record<string, string> = {
  EXECUTING: "Executing",
  INFLUENCING: "Influencing",
  RELATIONSHIP_BUILDING: "Relationship Building",
  STRATEGIC_THINKING: "Strategic Thinking",
};

/**
 * CliftonStrengths profile on the employee's admin page: upload the Gallup PDF,
 * check what was read out of it, confirm.
 *
 * Nothing is saved before confirmation, and a report that cannot be read drops
 * straight into entering the themes by hand — an unparseable file never blocks a
 * profile.
 */
export function StrengthsPanel({
  employeeId,
  employeeName,
  allThemes,
  saved,
  profileId,
  assessmentDateISO,
  fileName,
}: {
  employeeId: string;
  employeeName: string;
  allThemes: ThemeOption[];
  saved: SavedTheme[];
  profileId: string | null;
  assessmentDateISO: string | null;
  fileName: string | null;
}) {
  const [proposal, uploadAction, uploading] = useActionState<StrengthsProposal | null, FormData>(
    parseStrengthsUpload.bind(null, employeeId),
    null
  );
  const [saveState, saveAction, saving] = useActionState<StrengthsSaveState, FormData>(
    confirmStrengthsProfile.bind(null, employeeId),
    null
  );
  const [clearState, clearAction, clearing] = useActionState<StrengthsSaveState, FormData>(
    clearStrengthsProfile.bind(null, employeeId),
    null
  );

  const [manual, setManual] = useState(false);
  const parseFailed = proposal !== null && !proposal.ok;

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg text-navy-900">Strengths</h2>
        {saved.length > 0 && (
          <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[10px] font-bold text-green-700">
            {saved.length} themes on file
          </span>
        )}
      </div>
      <p className="mb-4 max-w-[70ch] text-xs text-muted">
        Drop the Gallup report — Top 5 or all 34, either works. These become the choices on
        this person&rsquo;s own review questions, so they can only pick strengths they
        actually have.
      </p>

      {/* ── What is already on file ───────────────────────────────────── */}
      {saved.length > 0 && (
        <div className="mb-5 rounded-lg border border-line bg-paper p-3">
          <div className="flex flex-wrap items-center gap-2">
            {saved.map((t) => (
              <span
                key={t.code}
                className="rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-[11.5px] font-semibold text-navy-700"
              >
                <span className="tabular-nums text-navy-300">{t.rank}</span> {t.name}
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] text-muted">
            {assessmentDateISO && (
              <span>Assessed {new Date(assessmentDateISO).toLocaleDateString("en-GB")}</span>
            )}
            {profileId && fileName && (
              <a
                href={`/api/reviews/strengths/${profileId}`}
                className="font-semibold text-navy-700 underline"
              >
                {fileName}
              </a>
            )}
            <form action={clearAction}>
              <button
                type="submit"
                disabled={clearing}
                className="font-semibold text-muted hover:text-red-700 disabled:opacity-45"
              >
                Remove profile
              </button>
            </form>
          </div>
          {clearState && (
            <p
              role="alert"
              className={`mt-2 text-[12px] ${clearState.ok ? "text-green-700" : "text-red-700"}`}
            >
              {clearState.ok ? clearState.message : clearState.error}
            </p>
          )}
        </div>
      )}

      {/* ── Upload ────────────────────────────────────────────────────── */}
      <form action={uploadAction} className="rounded-lg border border-dashed border-navy-200 bg-paper p-4">
        <input
          type="file"
          name="report"
          accept="application/pdf"
          className="block w-full text-[13px] text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-navy-800 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-white"
        />
        <button
          type="submit"
          disabled={uploading}
          className="mt-3 rounded-lg bg-navy-800 px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-45"
        >
          {uploading ? "Reading…" : "Read the report"}
        </button>
      </form>

      {parseFailed && !proposal.ok && (
        <div
          role="alert"
          tabIndex={-1}
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700"
        >
          <p>{proposal.error}</p>
          <button
            type="button"
            onClick={() => setManual(true)}
            className="mt-2 font-semibold underline"
          >
            Enter the themes by hand instead
          </button>
        </div>
      )}

      {/* ── Confirm what was read ─────────────────────────────────────── */}
      {proposal?.ok && !manual && (
        <form action={saveAction} className="mt-4">
          <input type="hidden" name="source" value="PARSED" />
          <input type="hidden" name="blobUrl" value={proposal.blobUrl ?? ""} />
          <input type="hidden" name="fileName" value={proposal.fileName ?? ""} />
          <input type="hidden" name="assessmentDate" value={proposal.assessmentDateISO ?? ""} />
          <input type="hidden" name="printedName" value={proposal.printedName ?? ""} />

          {/* Shown so a report uploaded against the wrong person is caught here,
              by a human. Never matched automatically — extraction kerning gives
              things like "ISLAM SA ADANY". */}
          <div className="flex items-start gap-2.5 rounded-lg border border-gold-300 bg-[#fbf9f2] px-3.5 py-2.5 text-[12.5px]">
            <span aria-hidden="true">📄</span>
            <div>
              This report is printed for{" "}
              <strong className="text-gold-800">{proposal.printedName ?? "someone unnamed"}</strong>
              {proposal.assessmentDateISO && (
                <>
                  , assessed{" "}
                  <strong className="text-gold-800">
                    {new Date(proposal.assessmentDateISO).toLocaleDateString("en-GB")}
                  </strong>
                </>
              )}
              . You are adding it to <strong className="text-gold-800">{employeeName}</strong>.
              Read {proposal.themes.length} themes in order.
            </div>
          </div>

          {proposal.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11.5px] text-muted">
              {proposal.warnings.map((w) => (
                <li key={w}>· {w}</li>
              ))}
            </ul>
          )}

          <div className="mt-3 overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse bg-surface text-[13px]">
              <thead>
                <tr>
                  <th className="w-11 border-b border-line bg-paper px-2.5 py-2 text-right text-[10px] font-extrabold uppercase tracking-wider text-muted">
                    #
                  </th>
                  <th className="border-b border-line bg-paper px-2.5 py-2 text-left text-[10px] font-extrabold uppercase tracking-wider text-muted">
                    Theme
                  </th>
                  <th className="border-b border-line bg-paper px-2.5 py-2 text-left text-[10px] font-extrabold uppercase tracking-wider text-muted">
                    Domain
                  </th>
                </tr>
              </thead>
              <tbody>
                {proposal.themes.map((t) => {
                  const domain = allThemes.find((a) => a.code === t.code)?.domain;
                  return (
                    <tr key={t.code}>
                      <td className="border-b border-line px-2.5 py-1.5 text-right font-bold tabular-nums text-navy-400">
                        {t.rank}
                      </td>
                      <td className="border-b border-line px-2.5 py-1.5">{t.name}</td>
                      <td className="border-b border-line px-2.5 py-1.5 text-muted">
                        {domain ? DOMAIN_LABEL[domain] : "—"}
                      </td>
                      <input type="hidden" name="themeCode" value={t.code} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-navy-800 px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-45"
            >
              Confirm these {proposal.themes.length} themes
            </button>
            <button
              type="button"
              onClick={() => setManual(true)}
              className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-[12px] font-semibold text-navy-700"
            >
              Fix the order
            </button>
          </div>
        </form>
      )}

      {/* ── Manual entry / correction ─────────────────────────────────── */}
      {(manual || (saved.length === 0 && proposal === null)) && (
        <ManualEntry
          allThemes={allThemes}
          initial={
            proposal?.ok
              ? proposal.themes.map((t) => t.code)
              : saved.map((s) => s.code)
          }
          action={saveAction}
          saving={saving}
          showHeading={manual}
        />
      )}

      {saveState && (
        <p
          role="alert"
          tabIndex={-1}
          className={`mt-3 text-[12.5px] ${saveState.ok ? "text-green-700" : "text-red-700"}`}
        >
          {saveState.ok ? saveState.message : saveState.error}
        </p>
      )}
    </section>
  );
}

/** Click themes in rank order. Same shape whether it is 5 or 34. */
function ManualEntry({
  allThemes,
  initial,
  action,
  saving,
  showHeading,
}: {
  allThemes: ThemeOption[];
  initial: string[];
  action: (formData: FormData) => void;
  saving: boolean;
  showHeading: boolean;
}) {
  const [order, setOrder] = useState<string[]>(initial);

  const toggle = (code: string) =>
    setOrder((o) => (o.includes(code) ? o.filter((c) => c !== code) : [...o, code]));

  const nameOf = (code: string) => allThemes.find((t) => t.code === code)?.name ?? code;

  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="source" value="MANUAL" />
      <input type="hidden" name="assessmentDate" value="" />
      <input type="hidden" name="printedName" value="" />
      <input type="hidden" name="blobUrl" value="" />
      <input type="hidden" name="fileName" value="" />

      {showHeading && (
        <h3 className="mb-1 text-[13px] font-semibold text-navy-800">By hand</h3>
      )}
      <p className="mb-2 text-[11.5px] text-muted">
        Click the themes in the order the report ranks them — top first. Five or thirty-four,
        whatever the report has.
      </p>

      {order.length > 0 && (
        <ol className="mb-3 flex flex-wrap gap-1.5">
          {order.map((code, i) => (
            <li key={code}>
              <button
                type="button"
                onClick={() => toggle(code)}
                className="rounded-full border border-navy-800 bg-navy-800 px-2.5 py-1 text-[11.5px] font-semibold text-white"
              >
                <span className="tabular-nums opacity-60">{i + 1}</span> {nameOf(code)} ✕
              </button>
              <input type="hidden" name="themeCode" value={code} />
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-1.5">
        {allThemes
          .filter((t) => !order.includes(t.code))
          .map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => toggle(t.code)}
              className="rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-[11.5px] font-semibold text-navy-700"
            >
              {t.name}
            </button>
          ))}
      </div>

      <button
        type="submit"
        disabled={saving || order.length === 0}
        className="mt-3 rounded-lg bg-navy-800 px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-45"
      >
        Save {order.length > 0 ? `${order.length} ` : ""}themes
      </button>
    </form>
  );
}
