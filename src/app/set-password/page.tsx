import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, validatePasswordPolicy, PASSWORD_POLICY_HINT } from "@/lib/password";
import { getBrand } from "@/lib/brand";
import { signOutAction } from "@/lib/signout-action";
import { SetPasswordForm } from "@/components/SetPasswordForm";

export const dynamic = "force-dynamic";

/**
 * Forced first-time password change. Employees issued a temporary password are gated here
 * (by the app layout) until they set their own compliant one. Lives outside the (app) route
 * group so the gate can't redirect-loop it.
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  // If this account isn't actually flagged (or the column doesn't exist yet), don't block.
  let mustChange = false;
  try {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { mustChangePassword: true },
    });
    mustChange = !!me?.mustChangePassword;
  } catch {
    mustChange = false;
  }
  if (!mustChange) redirect("/dashboard");

  const { error } = await searchParams;
  const brand = await getBrand();

  async function setPassword(formData: FormData) {
    "use server";
    const s = await auth();
    if (!s?.user?.id) redirect("/signin");
    const next = String(formData.get("next") ?? "").trim();
    const confirm = String(formData.get("confirm") ?? "").trim();
    if (next !== confirm) redirect("/set-password?error=match");
    if (validatePasswordPolicy(next)) redirect("/set-password?error=policy");
    await prisma.user.update({
      where: { id: s.user.id },
      data: { passwordHash: hashPassword(next), mustChangePassword: false },
    });
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen grid place-items-center bg-navy-900 px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl overflow-hidden">
        <div className="bg-navy-800 px-8 py-10 text-center">
          <div className="text-gold-400 text-xs font-semibold tracking-[0.2em] uppercase">{brand.shortName}</div>
          <h1 className="mt-2 font-serif text-2xl text-white">Set your password</h1>
          <p className="mt-2 text-sm text-navy-100">
            You signed in with a temporary password. Choose your own to continue.
          </p>
        </div>

        <div className="px-8 py-8">
          {error ? (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error === "policy"
                ? PASSWORD_POLICY_HINT
                : error === "match"
                ? "The two passwords don't match."
                : "Something went wrong. Please try again."}
            </p>
          ) : null}

          <SetPasswordForm action={setPassword} />

          <form action={signOutAction} className="mt-6 text-center">
            <button type="submit" className="text-xs text-muted underline underline-offset-2 hover:text-navy-700">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
