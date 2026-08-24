/**
 * What the other party's half looks like before the review is held.
 *
 * There is nothing to reveal here even if you read the page source: until the
 * sheet opens, their items are never queried (`visibleItemsWhere` scopes by
 * author), so no preview, summary, word count or per-question completion state
 * exists in the payload to be uncovered.
 *
 * The one thing shown is whether they have submitted — that is about scheduling
 * the conversation, not about its content, and without it neither person could
 * tell whether they are waiting or being waited for.
 */
export function SealedHalf({
  counterpartName,
  theySubmitted,
}: {
  counterpartName: string;
  theySubmitted: boolean;
}) {
  return (
    <div
      className="grid min-h-[220px] place-items-center rounded-xl border border-line p-9 text-center"
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, #f5f3ee, #f5f3ee 9px, #efece5 9px, #efece5 18px)",
      }}
    >
      <div>
        <div className="mb-2 text-2xl" aria-hidden="true">
          🔒
        </div>
        <h3 className="font-serif text-[15px] text-navy-900">
          {counterpartName}&rsquo;s half is sealed
        </h3>
        <p className="mx-auto mt-1.5 max-w-[34ch] text-[12.5px] text-muted">
          It opens when you have both submitted <strong>and</strong> you have both confirmed
          the review actually happened.
        </p>
        <p className="mt-3 text-[11px] text-muted">
          {theySubmitted
            ? `${counterpartName} has submitted.`
            : `${counterpartName} has not submitted yet.`}
        </p>
      </div>
    </div>
  );
}
