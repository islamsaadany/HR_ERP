import Link from "next/link";
import { IMPERSONATION_REFUSAL } from "@/lib/reviews/access";

export const dynamic = "force-dynamic";

/**
 * Where `requireRealUser()` sends a Super User who is viewing as somebody else.
 *
 * The module refuses rather than quietly un-impersonating, because either
 * alternative is worse: showing the target's reviews would break the promise
 * that only the two people in a conversation can read it, and silently showing
 * the Super User's OWN reviews under another identity would be a confusing lie.
 */
export default function ReviewsUnavailablePage() {
  return (
    <div className="max-w-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Reviews &amp; 1:1s
      </p>
      <h1 className="mt-1 font-serif text-2xl text-navy-900">Closed while viewing as</h1>
      <div className="mt-5 rounded-xl border border-line bg-surface p-5 shadow-card">
        <p className="text-sm text-ink">{IMPERSONATION_REFUSAL}</p>
        <p className="mt-3 text-xs text-muted">
          This is the only module that behaves this way. Reviews, 1:1s and journals belong
          to the two people in the conversation, so there is no view of them from the
          outside — not for HR, not for a Super User, and not through &ldquo;view as&rdquo;.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex items-center rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white"
        >
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
