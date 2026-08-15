"use client";

/**
 * A submit button that asks for confirmation before its form runs (audit F2).
 *
 * The delete controls across the admin screens sit inches from an "Edit" link, at small text size,
 * in a list — and they permanently destroy authored content (a handbook section is company policy,
 * a knowledge article is a long-form write-up) with no undo. This is the pattern
 * `DepartmentsManager` already used; this component makes it reusable from the SERVER components
 * that render those lists, which can't attach an onClick of their own.
 *
 * `className` is passed straight through so every call site keeps its exact existing styling —
 * this changes behaviour, not appearance.
 */
export function ConfirmSubmitButton({
  message,
  children,
  className,
}: {
  /** Shown in the confirmation. Name the specific item — "Delete this?" tells the reader nothing. */
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
