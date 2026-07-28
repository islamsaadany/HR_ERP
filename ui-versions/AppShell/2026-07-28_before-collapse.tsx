import Link from "next/link";
import { signOut } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import type { Role } from "@prisma/client";

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/benefits", label: "Benefits" },
  { href: "/directory", label: "Team Directory" },
  { href: "/handbook", label: "Handbook & Resources" },
  { href: "/time-off", label: "Time-Off" },
  { href: "/profile", label: "My Profile" },
];

export function AppShell({
  user,
  children,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null; role: Role };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr] max-md:grid-cols-1">
      {/* Sidebar */}
      <aside className="bg-navy-900 text-white flex flex-col max-md:hidden sticky top-0 h-screen overflow-y-auto">
        <div className="px-6 py-6 border-b border-navy-700">
          <div className="text-gold-400 text-[10px] font-semibold tracking-[0.2em] uppercase">
            Forefront
          </div>
          <div className="font-serif text-xl">Forefront HR</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm text-navy-100 transition hover:bg-navy-800 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          {isAdmin(user.role) ? (
            <Link
              href="/admin"
              className="mt-2 block rounded-lg px-3 py-2 text-sm font-medium text-gold-300 transition hover:bg-navy-800"
            >
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="px-4 py-4 border-t border-navy-700">
          <div className="text-sm text-white truncate">{user.name}</div>
          <div className="text-xs text-navy-200 truncate">{user.email}</div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button
              type="submit"
              className="mt-2 text-xs text-navy-200 underline underline-offset-2 hover:text-gold-300"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between bg-navy-900 px-4 py-3 text-white">
          <span className="font-serif text-lg">Forefront HR</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button type="submit" className="text-xs text-navy-200 underline">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 p-6 md:p-10 max-w-6xl w-full">{children}</main>
      </div>
    </div>
  );
}
