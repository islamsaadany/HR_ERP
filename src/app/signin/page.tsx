import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <main className="min-h-screen grid place-items-center bg-navy-900 px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl overflow-hidden">
        <div className="bg-navy-800 px-8 py-10 text-center">
          <div className="text-gold-400 text-xs font-semibold tracking-[0.2em] uppercase">
            Forefront Consulting
          </div>
          <h1 className="mt-2 font-serif text-3xl text-white">Forefront HR</h1>
          <p className="mt-2 text-sm text-navy-100">
            Sign in with your company Google account.
          </p>
        </div>

        <div className="px-8 py-8">
          {error ? (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error === "AccessDenied"
                ? "That account isn't allowed. Use your @forefront.consulting email, or ask HR to add you."
                : "Something went wrong signing in. Please try again."}
            </p>
          ) : null}

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-lg bg-navy-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy-700"
            >
              Continue with Google
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            Access is restricted to Forefront Consulting employees.
          </p>
        </div>
      </div>
    </main>
  );
}
