import { redirect } from "next/navigation";

/**
 * The noticeboard moved under Communications on 2026-08-25.
 *
 * This stub stays because the old address is in people's bookmarks and in the browser history of
 * everybody who has used it. A dead link teaches an operator that the feature was removed, which
 * is not what happened.
 */
export default function MovedToNoticeboard() {
  redirect("/admin/communications/noticeboard");
}
