"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that reports that it is working (audit F8).
 *
 * `useFormStatus` must be read from inside the <form>, so this exists as its own client component
 * and can be dropped into the SERVER components that render server-action forms.
 *
 * `className` is passed straight through so call sites keep their exact styling — this adds
 * feedback, it does not restyle anything.
 */
export function PendingSubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
}: {
  children: React.ReactNode;
  /** Shown while the action runs, e.g. "Confirming…". */
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
