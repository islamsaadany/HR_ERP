import { requireSuperUser } from "@/lib/roles";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { emailConfigured, emailFromAddress } from "@/lib/email/client";
import { BackLink } from "@/components/admin/BackLink";
import { updateNotificationSettings, sendTestEmailAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; testSent?: string; testError?: string }>;
}) {
  const actor = await requireSuperUser();
  const { saved, error, testSent, testError } = await searchParams;
  const settings = await getNotificationSettings();
  const configured = emailConfigured();

  const label = "block text-xs font-medium uppercase tracking-wide text-muted mb-1";
  const input =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

  return (
    <div className="max-w-2xl">
      <BackLink href="/admin" label="Admin" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Notifications</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Email notifications</h1>
      <p className="mt-1 text-muted">
        Control the claim-workflow emails to HR, Finance, and employees. Super User only.
      </p>

      {saved ? (
        <p className="mt-4 rounded-lg bg-navy-50 px-4 py-3 text-sm text-navy-700">Settings saved.</p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {/* Env status (read-only) */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Email sending</h2>
        <p className="mt-1 text-xs text-muted">
          The sending key and address are set as environment variables in Vercel (secrets), not here.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {configured ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-600" /> Configured
              </span>
              <span className="text-sm text-muted">
                Sending as <code className="rounded bg-navy-50 px-1.5 py-0.5 text-xs">{emailFromAddress}</code>
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Not configured
            </span>
          )}
        </div>
        {!configured ? (
          <p className="mt-2 text-xs text-muted">
            Set <code className="rounded bg-navy-50 px-1.5 py-0.5">RESEND_API_KEY</code> and{" "}
            <code className="rounded bg-navy-50 px-1.5 py-0.5">EMAIL_FROM</code> in Vercel → Settings → Environment
            Variables, then redeploy. Until then no emails are sent.
          </p>
        ) : null}
      </section>

      {/* Settings form */}
      <form action={updateNotificationSettings} className="mt-4 space-y-5 rounded-xl border border-line bg-surface p-5">
        <div>
          <h2 className="text-sm font-semibold text-ink">Notification settings</h2>
          <p className="mt-1 text-xs text-muted">Where hand-off emails go, and whether they&apos;re sent at all.</p>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-ink">Send workflow emails</span>
            <span className="block text-xs text-muted">
              Master switch. Off = the workflow still runs, but no email is sent.
            </span>
          </span>
          <input
            type="checkbox"
            name="emailEnabled"
            defaultChecked={settings.emailEnabled}
            className="h-5 w-5 accent-navy-800"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>HR team inbox</label>
            <input name="hrInbox" type="email" defaultValue={settings.hrInbox ?? ""} placeholder="hr@…" className={input} />
          </div>
          <div>
            <label className={label}>Finance team inbox</label>
            <input name="financeInbox" type="email" defaultValue={settings.financeInbox ?? ""} placeholder="finance@…" className={input} />
          </div>
        </div>
        <div>
          <label className={label}>From name (shown on emails)</label>
          <input name="fromName" defaultValue={settings.fromName ?? ""} placeholder="Forefront HR" className={input} />
        </div>

        <button className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">
          Save settings
        </button>
      </form>

      {/* Test send */}
      <section className="mt-4 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Send a test email</h2>
        <p className="mt-1 text-xs text-muted">
          Confirms your key + address work end-to-end, before the workflow emails go live.
        </p>

        {testSent ? (
          <p className="mt-3 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
            ✓ Test email sent to {testSent}. Check the inbox (and spam).
          </p>
        ) : null}
        {testError ? (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{testError}</p>
        ) : null}

        <form action={sendTestEmailAction} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label className={label}>Send to</label>
            <input name="to" type="email" defaultValue={actor.email ?? ""} required className={input} />
          </div>
          <button className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50">
            Send test email
          </button>
        </form>
        {!configured ? (
          <p className="mt-2 text-xs text-muted">Configure the environment variables above first.</p>
        ) : null}
      </section>
    </div>
  );
}
