"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOutAction } from "@/lib/signout-action";
import { stopImpersonation } from "@/app/(app)/admin/impersonate/actions";
import { switchAccountAction } from "@/lib/switch-account-action";

const NAV = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/onboarding", label: "Onboarding", icon: "onboarding" },
  { href: "/benefits", label: "Benefits", icon: "benefits" },
  { href: "/directory", label: "Team Directory", icon: "directory" },
  { href: "/handbook", label: "Handbook & Resources", icon: "handbook" },
  { href: "/knowledge", label: "Knowledge Base", icon: "knowledge" },
  { href: "/time-off", label: "Time-Off", icon: "timeoff" },
  { href: "/profile", label: "My Profile", icon: "profile" },
];

const STORAGE_KEY = "ff-sidebar-collapsed";

/** Routes whose wide master–detail layout auto-collapses the sidebar. */
const isWideRoute = (path: string) =>
  path.startsWith("/handbook") || path.startsWith("/knowledge");

/**
 * Routes that opt out of the shared max-width cap and use the full screen width.
 * These are the many-column data pages (the employee registry and each incentive
 * cycle report) whose wide tables need the room. Everything else stays centered.
 */
const isFullWidthRoute = (path: string) =>
  path === "/admin/employees" ||
  path.startsWith("/incentive/") ||
  path === "/directory" ||
  path === "/admin/time-off" ||
  path === "/admin/benefits";

/**
 * Routes pinned to the viewport height so ONLY their data table scrolls — no
 * second, page-level scrollbar. The header stays put and the table fills the
 * remaining height. Desktop only (md+); mobile keeps normal page flow. Starting
 * with the employee registry; other data-table pages can opt in later.
 */
const isSingleScrollRoute = (path: string) =>
  path === "/admin/employees" ||
  path === "/directory" ||
  path === "/admin/time-off" ||
  path === "/admin/benefits";

export function AppShell({
  name,
  email,
  showAdmin,
  showIncentive,
  showPayments = false,
  hiddenNav = [],
  navBadges = {},
  dataRequestCount = 0,
  companyName = "Forefront People",
  shortName = "Forefront",
  logoUrl = null,
  linkedAccounts = [],
  impersonation = null,
  children,
}: {
  name?: string | null;
  email?: string | null;
  showAdmin: boolean;
  showIncentive: boolean;
  showPayments?: boolean;
  hiddenNav?: string[];
  navBadges?: Record<string, number>;
  /** Pending data-request fields (spec 033) — >0 renders the gold sidebar notice. */
  dataRequestCount?: number;
  companyName?: string;
  shortName?: string;
  logoUrl?: string | null;
  /** Other active accounts sharing this person's Employee ID — the "Switch account" list (spec 025). */
  linkedAccounts?: { email: string; label: string }[];
  impersonation?: { targetName?: string | null; targetTitle?: string | null } | null;
  children: React.ReactNode;
}) {
  const nav = NAV.filter((item) => !hiddenNav.includes(item.href));

  // Live data-request count (spec 033): the popup layer polls the server and broadcasts the
  // real pending count; the server prop only paints the first frame. Without this, a badge
  // could stay stale (or missing) until a hard reload — the dead-badge bug, 2026-08-17.
  const [liveDataRequestCount, setLiveDataRequestCount] = useState(dataRequestCount);
  useEffect(() => setLiveDataRequestCount(dataRequestCount), [dataRequestCount]);
  useEffect(() => {
    const onCount = (e: Event) => setLiveDataRequestCount((e as CustomEvent<number>).detail ?? 0);
    window.addEventListener("hrerp:data-request-count", onCount);
    return () => window.removeEventListener("hrerp:data-request-count", onCount);
  }, []);

  // Live Time-Off badge (spec 035): decisions unseen + approvals awaiting the user as
  // manager. TimeOffBadgeSync polls and broadcasts; the server prop paints the first frame.
  const [liveTimeOffCount, setLiveTimeOffCount] = useState<number | null>(null);
  useEffect(() => {
    const onCount = (e: Event) => setLiveTimeOffCount((e as CustomEvent<number>).detail ?? 0);
    window.addEventListener("hrerp:timeoff-count", onCount);
    return () => window.removeEventListener("hrerp:timeoff-count", onCount);
  }, []);
  const badgeFor = (href: string): number =>
    href === "/time-off" && liveTimeOffCount != null ? liveTimeOffCount : navBadges[href] ?? 0;
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [pref, setPref] = useState(false); // the user's manual preference

  // Read the saved manual preference once on mount.
  useEffect(() => {
    setPref(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  // Handbook auto-collapses the panel; elsewhere we honour the saved preference.
  useEffect(() => {
    if (isWideRoute(pathname)) setCollapsed(true);
    else setCollapsed(pref);
  }, [pathname, pref]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    // Persist as the preference only when the auto-collapse route isn't in charge.
    if (!isWideRoute(pathname)) {
      setPref(next);
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    }
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const singleScroll = isSingleScrollRoute(pathname);

  return (
    <div
      className={
        "min-h-screen grid grid-cols-1 " +
        (collapsed ? "md:grid-cols-[4rem_1fr]" : "md:grid-cols-[240px_1fr]")
      }
    >
      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen flex-col overflow-y-auto bg-navy-900 text-white max-md:hidden">
        {collapsed ? (
          <>
            <div className="flex flex-col items-center gap-3 border-b border-navy-700 px-2 py-5">
              {/* The brand mark goes home — the conventional place people click to get back. */}
              <Link href="/dashboard" aria-label={`${companyName} — go to Home`} title="Home" className="transition hover:opacity-80">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={companyName} className="h-8 w-8 rounded-md object-contain" />
                ) : (
                  // No uploaded logo → the generic People mark (never a bare initial),
                  // for the default brand and business units alike (spec 024/025).
                  <div className="grid h-8 w-8 place-items-center rounded-md bg-navy-800">
                    <PeopleMark className="h-5 w-5" />
                  </div>
                )}
              </Link>
              <button
                type="button"
                onClick={toggle}
                aria-label="Expand sidebar"
                title="Expand"
                className="grid h-8 w-8 place-items-center rounded-lg text-navy-200 hover:bg-navy-800 hover:text-white"
              >
                <Chevron dir="right" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col items-center gap-1 py-4">
              {nav.map((item) => {
                const badge = badgeFor(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={badge > 0 ? `${item.label} (${badge})` : item.label}
                    aria-label={badge > 0 ? `${item.label}, ${badge} new` : item.label}
                    className={
                      "relative grid h-10 w-10 place-items-center rounded-lg transition " +
                      (isActive(item.href)
                        ? "bg-navy-800 text-white"
                        : "text-navy-100 hover:bg-navy-800 hover:text-white")
                    }
                  >
                    <NavIcon name={item.icon} />
                    {badge > 0 ? (
                      <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-navy-900">
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
              {showIncentive ? (
                <Link
                  href="/incentive"
                  title="Incentive Scheme"
                  aria-label="Incentive Scheme"
                  className={
                    "mt-1 grid h-10 w-10 place-items-center rounded-lg transition " +
                    (isActive("/incentive")
                      ? "bg-navy-800 text-gold-300"
                      : "text-gold-300 hover:bg-navy-800")
                  }
                >
                  <NavIcon name="incentive" />
                </Link>
              ) : null}
              {showPayments ? (
                <Link
                  href="/finance"
                  title="Payments"
                  aria-label="Payments"
                  className={
                    "mt-1 grid h-10 w-10 place-items-center rounded-lg transition " +
                    (isActive("/finance")
                      ? "bg-navy-800 text-gold-300"
                      : "text-gold-300 hover:bg-navy-800")
                  }
                >
                  <NavIcon name="payments" />
                </Link>
              ) : null}
              {showAdmin ? (
                <Link
                  href="/admin"
                  title="Admin"
                  aria-label="Admin"
                  className={
                    "mt-1 grid h-10 w-10 place-items-center rounded-lg transition " +
                    (isActive("/admin")
                      ? "bg-navy-800 text-gold-300"
                      : "text-gold-300 hover:bg-navy-800")
                  }
                >
                  <NavIcon name="admin" />
                </Link>
              ) : null}
            </nav>
            {liveDataRequestCount > 0 ? (
              <div className="px-2 pb-2">
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("hrerp:open-data-requests"))}
                  title={`Profile data requested (${liveDataRequestCount})`}
                  aria-label={`Profile data requested, ${liveDataRequestCount} pending`}
                  className="relative grid h-10 w-full place-items-center rounded-lg border border-gold-600 bg-navy-800 text-gold-300 hover:bg-navy-700"
                >
                  <NavIcon name="profile" />
                  <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-navy-900">
                    {liveDataRequestCount}
                  </span>
                </button>
              </div>
            ) : null}
            <div className="border-t border-navy-700 px-2 py-4">
              <form action={signOutAction}>
                <button
                  type="submit"
                  aria-label="Sign out"
                  title="Sign out"
                  className="grid h-10 w-full place-items-center rounded-lg text-navy-200 hover:bg-navy-800 hover:text-gold-300"
                >
                  <NavIcon name="signout" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between border-b border-navy-700 px-6 py-6">
              <Link href="/dashboard" aria-label={`${companyName} — go to Home`} title="Home" className="min-w-0 transition hover:opacity-80">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={companyName} className="h-9 max-w-[150px] object-contain" />
                ) : (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-400">
                      {shortName}
                    </div>
                    <div className="font-serif text-xl uppercase">{companyName}</div>
                  </div>
                )}
              </Link>
              <button
                type="button"
                onClick={toggle}
                aria-label="Collapse sidebar"
                title="Collapse"
                className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg text-navy-200 hover:bg-navy-800 hover:text-white"
              >
                <Chevron dir="left" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-4">
              {nav.map((item) => {
                const on = isActive(item.href);
                const badge = badgeFor(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    className={
                      "relative flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition " +
                      (on
                        ? "bg-navy-800 font-medium text-white before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-gold-400"
                        : "text-navy-100 hover:bg-navy-800 hover:text-white")
                    }
                  >
                    <span>{item.label}</span>
                    {badge > 0 ? (
                      <span
                        aria-label={`${badge} new`}
                        className="grid h-5 min-w-5 place-items-center rounded-full bg-gold-500 px-1.5 text-[11px] font-bold text-navy-900"
                      >
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
              {showIncentive ? (
                <Link
                  href="/incentive"
                  aria-current={isActive("/incentive") ? "page" : undefined}
                  className={
                    "relative mt-2 block rounded-lg px-3 py-2 text-sm font-medium transition " +
                    (isActive("/incentive")
                      ? "bg-navy-800 text-gold-200 before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-gold-400"
                      : "text-gold-300 hover:bg-navy-800")
                  }
                >
                  Incentive Scheme
                </Link>
              ) : null}
              {showPayments ? (
                <Link
                  href="/finance"
                  aria-current={isActive("/finance") ? "page" : undefined}
                  className={
                    "relative mt-2 block rounded-lg px-3 py-2 text-sm font-medium transition " +
                    (isActive("/finance")
                      ? "bg-navy-800 text-gold-200 before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-gold-400"
                      : "text-gold-300 hover:bg-navy-800")
                  }
                >
                  Payments
                </Link>
              ) : null}
              {showAdmin ? (
                <Link
                  href="/admin"
                  aria-current={isActive("/admin") ? "page" : undefined}
                  className={
                    "relative mt-2 block rounded-lg px-3 py-2 text-sm font-medium transition " +
                    (isActive("/admin")
                      ? "bg-navy-800 text-gold-200 before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-gold-400"
                      : "text-gold-300 hover:bg-navy-800")
                  }
                >
                  Admin
                </Link>
              ) : null}
            </nav>
            {liveDataRequestCount > 0 ? (
              <div className="px-3 pb-3">
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("hrerp:open-data-requests"))}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-gold-600 bg-navy-800 px-3 py-2.5 text-sm text-white hover:bg-navy-700"
                >
                  <span>Profile data requested</span>
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold-500 px-1.5 text-[11px] font-bold text-navy-900">
                    {liveDataRequestCount}
                  </span>
                </button>
              </div>
            ) : null}
            <div className="border-t border-navy-700 px-4 py-4">
              <div className="truncate text-sm text-white">{name}</div>
              <div className="truncate text-xs text-navy-200">{email}</div>
              {linkedAccounts.length > 0 ? (
                <div className="mt-3 border-t border-navy-700 pt-3">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-navy-300">
                    Switch account
                  </div>
                  <div className="space-y-1">
                    {linkedAccounts.map((a) => (
                      <form key={a.email} action={switchAccountAction}>
                        <input type="hidden" name="email" value={a.email} />
                        <button
                          type="submit"
                          title={`Switch to ${a.email}`}
                          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-navy-100 transition hover:bg-navy-800 hover:text-white"
                        >
                          <SwitchIcon />
                          <span className="truncate">{a.label}</span>
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              ) : null}
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="mt-2 text-xs text-navy-200 underline underline-offset-2 hover:text-gold-300"
                >
                  Sign out
                </button>
              </form>
            </div>
          </>
        )}
      </aside>

      {/* Main */}
      <div
        className={
          "flex min-w-0 flex-col" +
          // Single-scroll pages pin to the viewport so only their table scrolls.
          (singleScroll ? " md:h-screen md:overflow-hidden" : "")
        }
      >
        {impersonation ? (
          <div className="sticky top-0 z-30 flex items-center gap-3 border-b-2 border-gold-500 bg-navy-900 px-4 py-2.5 text-white">
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-gold-500 text-navy-900" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
            <div className="min-w-0 text-sm leading-tight">
              <div className="truncate">
                Viewing as <span className="font-semibold text-gold-200">{impersonation.targetName}</span>
                {impersonation.targetTitle ? <span className="text-navy-200"> · {impersonation.targetTitle}</span> : null}
              </div>
              <div className="truncate text-xs text-navy-300">You’re seeing this employee’s own screens. Your data isn’t shown.</div>
            </div>
            <form action={stopImpersonation} className="ml-auto flex-shrink-0">
              <button
                type="submit"
                className="rounded-lg border border-gold-500 px-3 py-1.5 text-xs font-bold text-gold-200 transition hover:bg-gold-500 hover:text-navy-900"
              >
                ✕ Exit to admin
              </button>
            </form>
          </div>
        ) : null}
        <header className="flex items-center justify-between bg-navy-900 px-4 py-3 text-white md:hidden">
          <Link href="/dashboard" aria-label={`${companyName} — go to Home`} className="font-serif text-lg uppercase transition hover:text-gold-300">{companyName}</Link>
          <form action={signOutAction}>
            <button type="submit" className="text-xs text-navy-200 underline">
              Sign out
            </button>
          </form>
        </header>
        <main
          className={
            "w-full flex-1 p-6 md:p-10 " +
            // Single-scroll pages become a full-height flex column so the table
            // fills the leftover space and is the only scroller (desktop only).
            // Wide, many-column data pages (registry, incentive report) use the
            // full screen width; every other page keeps the centered max-width.
            (singleScroll
              ? "md:flex md:min-h-0 md:flex-col"
              : isFullWidthRoute(pathname)
                ? ""
                : "max-w-6xl")
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/** Two-arrows "switch" glyph for the account switcher (spec 025). */
function SwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </svg>
  );
}

/** Generic "People" app mark (spec 024) — gold on navy, brand-neutral default. */
function PeopleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <circle cx="18" cy="17" r="7" fill="#c9a227" />
      <path d="M6 39c0-7 5.4-12 12-12s12 5 12 12" stroke="#c9a227" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="15" r="6" fill="#e0c05a" />
      <path d="M28 34c1.2-6 5.6-9 10.5-9 3 0 5.6 1.1 7.5 3" stroke="#e0c05a" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {dir === "left" ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}

function NavIcon({ name }: { name: string }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "h-5 w-5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></svg>
      );
    case "onboarding":
      return (
        <svg {...common}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3.5h6v3H9z" /><path d="m8.5 13 2 2 4-4" /></svg>
      );
    case "benefits":
      return (
        <svg {...common}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8h14v-8" /><path d="M12 8v12" /><path d="M12 8S9 3 7 5s3 3 5 3zm0 0s3-5 5-3-3 3-5 3z" /></svg>
      );
    case "directory":
      return (
        <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 6a3 3 0 0 1 0 6" /><path d="M17 14.5a5.5 5.5 0 0 1 3.5 5.5" /></svg>
      );
    case "handbook":
      return (
        <svg {...common}><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" /><path d="M5 18a2 2 0 0 1 2-2h11" /></svg>
      );
    case "knowledge":
      return (
        <svg {...common}><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.2 1 2.5h6c0-1.3.3-1.8 1-2.5A6 6 0 0 0 12 3z" /></svg>
      );
    case "timeoff":
      return (
        <svg {...common}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M9 3v4M15 3v4" /></svg>
      );
    case "profile":
      return (
        <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
      );
    case "incentive":
      return (
        <svg {...common}><ellipse cx="9" cy="6" rx="5" ry="2.4" /><path d="M4 6v4c0 1.3 2.2 2.4 5 2.4s5-1.1 5-2.4V6" /><path d="M4 10v4c0 1.3 2.2 2.4 5 2.4s5-1.1 5-2.4v-4" /><circle cx="16.5" cy="15.5" r="4.5" /><path d="M16.5 13.5v4M15 15.5h3" /></svg>
      );
    case "payments":
      return (
        <svg {...common}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v6M18 9v6" /></svg>
      );
    case "admin":
      return (
        <svg {...common}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /></svg>
      );
    case "signout":
      return (
        <svg {...common}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 8l-4 4 4 4M6 12h11" /></svg>
      );
    default:
      return null;
  }
}
