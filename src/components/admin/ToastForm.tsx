"use client";

import { useRef, useState, type ReactNode } from "react";
import { TOAST_DURATION_MS } from "@/lib/toast";

/**
 * Wraps an amounts edit form (Admin → Benefits → Amounts) so a save gives visible feedback:
 * on success a green toast — matching the employee benefits-claim toast (`ff-toast`, green pill,
 * bottom-left, auto-dismiss) — confirms the write so the operator knows it's safe to press Done;
 * on failure a red toast says so rather than failing silently.
 *
 * The server action is unchanged: the form still submits via `action`, only wrapped in a thin
 * client function that fires the toast once the action resolves (its `revalidatePath` still flows
 * the saved figures back into the inputs).
 */
type ToastKind = "ok" | "err";

export function ToastForm({
  action,
  savedMessage,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  savedMessage: string;
  className?: string;
  children: ReactNode;
}) {
  const [toast, setToast] = useState<{ id: number; kind: ToastKind; text: string } | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (kind: ToastKind, text: string) => {
    const id = ++idRef.current;
    setToast({ id, kind, text });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setToast((cur) => (cur && cur.id === id ? null : cur));
    }, TOAST_DURATION_MS);
  };

  const clientAction = async (formData: FormData) => {
    try {
      await action(formData);
      show("ok", savedMessage);
    } catch {
      show("err", "Couldn't save — please try again.");
    }
  };

  return (
    <>
      <form action={clientAction} className={className}>
        {children}
      </form>
      {toast ? (
        <div className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setToast(null)}
            className={
              "ff-toast flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-sm font-semibold shadow-lg " +
              (toast.kind === "ok"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700")
            }
          >
            <span
              className={"h-2 w-2 shrink-0 rounded-full " + (toast.kind === "ok" ? "bg-green-600" : "bg-red-600")}
              aria-hidden="true"
            />
            <span>{toast.kind === "ok" ? "✓ " : "✕ "}{toast.text}</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
