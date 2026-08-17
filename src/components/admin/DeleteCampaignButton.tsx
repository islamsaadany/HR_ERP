"use client";

import { deleteCampaign } from "@/app/(app)/admin/data-requests/actions";

/**
 * Delete a data request campaign, guarded by an explicit confirm — it erases the tracker
 * history (answers already written to employee records stay untouched).
 */
export function DeleteCampaignButton({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteCampaign}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Delete "${title}"? Its tracker history is erased and employees stop being asked. Answers already saved to profiles stay.`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-red-300 hover:text-red-600"
      >
        Delete
      </button>
    </form>
  );
}
