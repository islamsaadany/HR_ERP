"use client";

import { Fragment, startTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendSample, setEmailSwitch } from "@/app/(app)/admin/notifications/actions";

/**
 * Admin → Notifications: every email the platform sends, one row each (2026-10-07, approved
 * mockup `design-mockups/notification-settings/2026-10-07_who-gets-what.html`).
 *
 * Each row saves ITSELF: ticking a box writes that one email's switch and shows "Saved" on that
 * row, then refreshes the server page in place — the CEO's rule that a change to one cell must not
 * rebuild the page around it. The rows arrive as plain data; which emails exist, who receives
 * them and when they last went is all decided on the server.
 */

export type EmailRowData = {
  kind: string;
  area: string;
  name: string;
  when: string;
  /** Who receives it, in words. */
  who: string;
  /** The inbox address, for an email that goes to a team inbox. */
  addr: string | null;
  setIn: string | null;
  setInLink: { label: string; href: string } | null;
  /** Something wrong with who receives it — an empty inbox, a unit with nobody appointed. */
  warn: string | null;
  on: boolean;
  last: { tone: "ok" | "bad"; title: string; detail: string } | null;
  /** The date of the last send, for the "Off" state. */
  lastDate: string | null;
};

export function WhoGetsWhat({ rows, defaultSampleTo }: { rows: EmailRowData[]; defaultSampleTo: string }) {
  const [sampleTo, setSampleTo] = useState(defaultSampleTo);

  const areas: { area: string; rows: EmailRowData[] }[] = [];
  for (const row of rows) {
    const group = areas.find((a) => a.area === row.area);
    if (group) group.rows.push(row);
    else areas.push({ area: row.area, rows: [row] });
  }

  return (
    <section className="mt-4 rounded-xl border border-line bg-surface px-5 py-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">Who gets what</h2>
          <p className="mt-0.5 max-w-[62ch] text-[12.5px] text-muted">
            Every email the app sends. Untick one to stop it. A change saves as soon as you tick or untick.
          </p>
        </div>
        <div className="flex min-w-0 flex-[0_1_330px] flex-col gap-1">
          <label
            htmlFor="sample-to"
            className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted"
          >
            Send samples to
          </label>
          <input
            id="sample-to"
            type="email"
            value={sampleTo}
            onChange={(e) => setSampleTo(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-[11px] py-2 text-[13px] text-ink focus:border-navy-500 focus:outline-none"
          />
        </div>
      </div>
      <p className="mt-2.5 max-w-[90ch] text-[11.5px] text-muted">
        A sample is the real email filled in with made-up details, with “SAMPLE” in the subject. It is sent
        even when that email is switched off, so you can check it before switching it on.
      </p>

      <div className="mt-3.5 overflow-x-auto rounded-[11px] border border-line bg-surface">
        <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              {["On", "Email", "Goes to", "Last sent", ""].map((h, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap bg-navy-800 px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-white"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((group) => (
              <Fragment key={group.area}>
                <tr>
                  <td
                    colSpan={5}
                    className="border-t border-line bg-navy-50 px-3 py-[7px] text-[10.5px] font-bold uppercase tracking-[0.1em] text-navy-700"
                  >
                    {group.area}
                    <span className="ml-1.5 font-semibold normal-case tracking-normal text-muted">
                      {group.rows.length} {group.rows.length === 1 ? "email" : "emails"}
                    </span>
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <EmailRow key={row.kind} row={row} sampleTo={sampleTo} />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const OFF_TEXT = "text-[#9a9ca5]";

function Mark({ tone, children }: { tone: "ok" | "bad" | "none" | "off"; children: string }) {
  const look = {
    ok: "border-green-200 bg-green-50 text-green-700",
    bad: "border-red-200 bg-red-50 text-red-700",
    none: "border-dashed border-navy-200 bg-surface text-navy-300",
    off: `border-line bg-paper ${OFF_TEXT}`,
  }[tone];
  return (
    <span
      aria-hidden
      className={`mt-px grid h-[17px] w-[17px] flex-none place-items-center rounded-full border text-[10.5px] font-bold leading-none ${look}`}
    >
      {children}
    </span>
  );
}

function EmailRow({ row, sampleTo }: { row: EmailRowData; sampleTo: string }) {
  const router = useRouter();
  const [on, setOn] = useState(row.on);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sample, setSample] = useState<"idle" | "sending" | "sent">("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sampleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A refresh after somebody else's change brings the server's answer back in.
  useEffect(() => setOn(row.on), [row.on]);
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
      if (sampleTimer.current) clearTimeout(sampleTimer.current);
    },
    []
  );

  const toggle = (next: boolean) => {
    setOn(next);
    setProblem(null);
    startTransition(async () => {
      try {
        const res = await setEmailSwitch(row.kind, next);
        if (!res.ok) {
          setOn(!next);
          setProblem(res.error ?? "Couldn't save that change.");
          return;
        }
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1600);
        router.refresh();
      } catch {
        setOn(!next);
        setProblem("Couldn't reach the server, so nothing was changed. Try again.");
      }
    });
  };

  const sendOne = () => {
    setProblem(null);
    setSample("sending");
    startTransition(async () => {
      try {
        const res = await sendSample(row.kind, sampleTo);
        if (!res.ok) {
          setSample("idle");
          setProblem(res.error ?? "The sample wasn't sent.");
          return;
        }
        setSample("sent");
        if (sampleTimer.current) clearTimeout(sampleTimer.current);
        sampleTimer.current = setTimeout(() => setSample("idle"), 3500);
      } catch {
        setSample("idle");
        setProblem("Couldn't reach the server, so the sample wasn't sent. Try again.");
      }
    });
  };

  const dim = on ? "" : OFF_TEXT;

  return (
    <>
      <tr>
        <td className="w-[70px] border-t border-line px-3 py-[11px] align-top">
          <label className="flex flex-col items-start gap-[3px]">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => toggle(e.target.checked)}
              aria-label={`Send: ${row.name}`}
              className="mt-px h-[18px] w-[18px] cursor-pointer accent-navy-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
            />
            <span
              aria-live="polite"
              className={`text-[10px] font-bold text-green-700 transition-opacity motion-reduce:transition-none ${saved ? "opacity-100" : "opacity-0"}`}
            >
              {saved ? "Saved" : ""}
            </span>
          </label>
        </td>
        <td className={`border-t border-line px-3 py-[11px] align-top ${dim}`}>
          <b className="block text-[13px] font-semibold">{row.name}</b>
          <span className={`mt-px block text-xs ${on ? "text-muted" : OFF_TEXT}`}>{row.when}</span>
        </td>
        <td className={`border-t border-line px-3 py-[11px] align-top ${dim}`}>
          <span className="block">{row.who}</span>
          {row.addr ? (
            <span className="mt-[3px] inline-block rounded-[5px] bg-navy-50 px-[7px] py-px text-[11.5px] text-navy-700">
              {row.addr}
            </span>
          ) : null}
          {row.setIn || row.setInLink ? (
            <span className={`mt-0.5 block text-[11.5px] ${on ? "text-muted" : OFF_TEXT}`}>
              {row.setInLink ? (
                <>
                  Set in{" "}
                  <Link href={row.setInLink.href} className="font-semibold text-navy-700 hover:underline">
                    {row.setInLink.label}
                  </Link>
                </>
              ) : (
                row.setIn
              )}
            </span>
          ) : null}
          {row.warn && on ? (
            <span className="mt-[5px] block text-[11.5px] font-semibold text-red-700">{row.warn}</span>
          ) : null}
        </td>
        <td className="w-[250px] border-t border-line px-3 py-[11px] align-top tabular-nums">
          {on ? (
            row.last ? (
              <div className={`flex items-start gap-[7px] ${row.last.tone === "bad" ? "text-red-700" : ""}`}>
                <Mark tone={row.last.tone}>{row.last.tone === "ok" ? "✓" : "✕"}</Mark>
                <span className="min-w-0">
                  <b className="font-semibold">{row.last.title}</b>
                  <small className={`block text-[11.5px] ${row.last.tone === "bad" ? "text-red-700" : "text-muted"}`}>
                    {row.last.detail}
                  </small>
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-[7px] text-muted">
                <Mark tone="none">–</Mark>
                <b className="font-semibold">Not sent yet</b>
              </div>
            )
          ) : (
            <div className={`flex items-start gap-[7px] ${OFF_TEXT}`}>
              <Mark tone="off">–</Mark>
              <span className="min-w-0">
                <b className="font-semibold">Off, not sending</b>
                {row.lastDate ? <small className="block text-[11.5px]">Last sent {row.lastDate}</small> : null}
              </span>
            </div>
          )}
        </td>
        <td className="w-[132px] border-t border-line px-3 py-[11px] text-right align-top">
          <button
            type="button"
            onClick={sendOne}
            disabled={sample === "sending"}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg border px-[11px] py-[7px] text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:opacity-60 ${
              sample === "sent"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-navy-200 bg-surface text-navy-700 hover:bg-navy-50"
            }`}
          >
            {sample === "sending" ? "Sending…" : sample === "sent" ? "Sample sent ✓" : "Send sample"}
          </button>
        </td>
      </tr>
      {problem ? (
        <tr>
          <td colSpan={5} role="alert" className="bg-red-50 px-3 py-2 text-right text-[12px] font-medium text-red-700">
            {problem}
          </td>
        </tr>
      ) : null}
    </>
  );
}
