"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOutAction } from "@/lib/signout-action";

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

export function AppShell({
  name,
  email,
  showAdmin,
  children,
}: {
  name?: string | null;
  email?: string | null;
  showAdmin: boolean;
  children: React.ReactNode;
}) {
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
              <div className="grid h-8 w-8 place-items-center rounded-md bg-navy-800 font-serif text-lg text-gold-400">
                F
              </div>
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
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  className={
                    "grid h-10 w-10 place-items-center rounded-lg transition " +
                    (isActive(item.href)
                      ? "bg-navy-800 text-white"
                      : "text-navy-100 hover:bg-navy-800 hover:text-white")
                  }
                >
                  <NavIcon name={item.icon} />
                </Link>
              ))}
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
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-400">
                  Forefront
                </div>
                <div className="font-serif text-xl">Forefront HR</div>
              </div>
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
              {NAV.map((item) => {
                const on = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    className={
                      "relative block rounded-lg px-3 py-2 text-sm transition " +
                      (on
                        ? "bg-navy-800 font-medium text-white before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-gold-400"
                        : "text-navy-100 hover:bg-navy-800 hover:text-white")
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
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
            <div className="border-t border-navy-700 px-4 py-4">
              <div className="truncate text-sm text-white">{name}</div>
              <div className="truncate text-xs text-navy-200">{email}</div>
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
      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between bg-navy-900 px-4 py-3 text-white md:hidden">
          <span className="font-serif text-lg">Forefront HR</span>
          <form action={signOutAction}>
            <button type="submit" className="text-xs text-navy-200 underline">
              Sign out
            </button>
          </form>
        </header>
        <main className="w-full max-w-6xl flex-1 p-6 md:p-10">{children}</main>
      </div>
    </div>
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
