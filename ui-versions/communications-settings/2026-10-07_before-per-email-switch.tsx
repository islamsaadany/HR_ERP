import { requireAdmin } from "@/lib/roles";
import { BackLink } from "@/components/admin/BackLink";
import { deliveryReadiness, emailConfigured, emailFromAddress } from "@/lib/email/client";
import { getCommsSettings } from "@/lib/comms/settings";
import { CommsSettingsForm } from "@/components/comms/CommsSettingsForm";

export const dynamic = "force-dynamic";

/**
 * Communication setup (spec 039 US3).
 *
 * The readiness readout is the reason this page exists. Until a sending domain is verified, the
 * mail provider delivers ONLY to the account owner — so an administrator who tests with their own
 * address sees success and concludes it works, and the first real broadcast reaches nobody while
 * reporting no error at all. This says which of four states is true, and says "could not check"
 * rather than inventing a verdict.
 */
export default async function CommsSettingsPage() {
  await requireAdmin();
  const [settings, readiness] = await Promise.all([getCommsSettings(), deliveryReadiness()]);

  const tone =
    readiness.state === "READY"
      ? { border: "border-green-200", bg: "bg-green-50", text: "text-green-700", head: "Ready" }
      : readiness.state === "OWNER_ONLY"
        ? { border: "border-gold-300", bg: "bg-gold-100", text: "text-gold-800", head: "Ready — for you only" }
        : readiness.state === "UNKNOWN"
          ? { border: "border-line", bg: "bg-paper", text: "text-muted", head: "Could not check just now" }
          : { border: "border-red-200", bg: "bg-red-50", text: "text-red-700", head: readiness.state === "KEY_REFUSED" ? "The API key is refused" : "Not configured" };

  return (
    <div>
      <BackLink href="/admin/communications" label="Communications" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Communications · Setup
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Sender and delivery</h1>
      <p className="mt-1 max-w-[70ch] text-muted">
        Who emails come from, how far ahead congratulations are prepared, and whether mail can
        actually reach the company.
      </p>

      <div className={`mt-5 max-w-[720px] rounded-xl border ${tone.border} ${tone.bg} p-4`}>
        <p className={`m-0 text-[13.5px] font-bold ${tone.text}`}>{tone.head}</p>
        <p className={`mt-1 text-[12.5px] ${tone.text}`}>{readiness.detail}</p>
        {emailFromAddress ? (
          <p className="mt-1.5 text-[11.5px] text-muted">
            Sending address: <b>{emailFromAddress}</b> — set in the environment, not here.
          </p>
        ) : null}
        {readiness.state === "OWNER_ONLY" ? (
          <p className="mt-2 text-[12px] text-gold-800">
            A test to yourself will arrive and prove nothing. Verify the domain with the mail
            provider before sending anything to the company.
          </p>
        ) : null}
      </div>

      <div className="mt-5">
        <CommsSettingsForm
          fromName={settings.fromName ?? ""}
          groupName={settings.groupName}
          congratsLeadDays={settings.congratsLeadDays}
          canSend={emailConfigured()}
        />
      </div>

      {!settings.emailEnabled ? (
        <p className="mt-4 max-w-[720px] rounded-r-lg border-l-[3px] border-gold-500 bg-gold-100 px-3 py-2 text-[12.5px] text-gold-800">
          The master email toggle is off at <b>Admin → Notifications</b>. Drafts can be written and
          previewed; nothing will send until it is on.
        </p>
      ) : null}
    </div>
  );
}
