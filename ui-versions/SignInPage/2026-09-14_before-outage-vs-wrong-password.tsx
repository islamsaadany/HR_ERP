import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

const L = "block text-xs font-medium uppercase tracking-wide text-muted mb-1";
const I =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  const { error, email } = await searchParams;
  const brand = await getBrand();

  async function credentialsSignIn(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        username: formData.get("username"),
        password: formData.get("password"),
        redirectTo: "/dashboard",
      });
    } catch (err) {
      // A failed sign-in throws AuthError; anything else (e.g. the redirect on
      // success) must be re-thrown so Next.js can handle it.
      if (err instanceof AuthError) redirect("/signin?error=Credentials");
      throw err;
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-navy-900 px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl overflow-hidden">
        <div className="bg-navy-800 px-8 py-10 text-center">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.companyName} className="mx-auto h-12 max-w-[220px] object-contain" />
          ) : (
            <div className="text-gold-400 text-xs font-semibold tracking-[0.2em] uppercase">
              {brand.shortName}
            </div>
          )}
          <h1 className="mt-2 font-serif text-3xl uppercase text-white">{brand.platformName}</h1>
          <p className="mt-2 text-sm text-navy-100">
            Sign in to your account.
          </p>
        </div>

        <div className="px-8 py-8">
          {error ? (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error === "Credentials"
                ? "Incorrect email or password. Please try again."
                : error === "AccessDenied"
                ? "That account isn't allowed. Use your @forefront.consulting email, or ask HR to add you."
                : "Something went wrong signing in. Please try again."}
            </p>
          ) : null}

          <form action={credentialsSignIn} className="space-y-4">
            <div>
              <label htmlFor="username" className={L}>
                Email
              </label>
              <input
                id="username"
                name="username"
                type="text"
                inputMode="email"
                autoComplete="username"
                placeholder="you@forefront.consulting"
                defaultValue={email ?? ""}
                required
                className={I}
              />
              {email ? (
                <p className="mt-1 text-xs text-muted">Switching account — enter this account&apos;s password.</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="password" className={L}>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className={I}
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-navy-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy-700"
            >
              Sign in
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            Access is restricted to {brand.shortName} employees.
          </p>
        </div>
      </div>
    </main>
  );
}
