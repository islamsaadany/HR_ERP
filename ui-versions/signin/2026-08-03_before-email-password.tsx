import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn, googleAuthEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

const L = "block text-xs font-medium uppercase tracking-wide text-muted mb-1";
const I =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  const { error } = await searchParams;

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
          <div className="text-gold-400 text-xs font-semibold tracking-[0.2em] uppercase">
            Forefront Consulting
          </div>
          <h1 className="mt-2 font-serif text-3xl text-white">Forefront HR</h1>
          <p className="mt-2 text-sm text-navy-100">
            Sign in to your account.
          </p>
        </div>

        <div className="px-8 py-8">
          {error ? (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error === "Credentials"
                ? "Incorrect username or password. Please try again."
                : error === "AccessDenied"
                ? "That account isn't allowed. Use your @forefront.consulting email, or ask HR to add you."
                : "Something went wrong signing in. Please try again."}
            </p>
          ) : null}

          <form action={credentialsSignIn} className="space-y-4">
            <div>
              <label htmlFor="username" className={L}>
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className={I}
              />
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

          {googleAuthEnabled ? (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: "/dashboard" });
                }}
              >
                <button
                  type="submit"
                  className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:bg-paper"
                >
                  Continue with Google
                </button>
              </form>
            </>
          ) : null}

          <p className="mt-6 text-center text-xs text-muted">
            Access is restricted to Forefront Consulting employees.
          </p>
        </div>
      </div>
    </main>
  );
}
