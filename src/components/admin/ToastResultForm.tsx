"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Save-form wrapper giving the whole platform one consistent "save" feel: on
 * success a green bottom-left `ff-toast` (matching the benefit-claim toast) and a
 * silent `router.refresh()` — no full navigation, no `?saved=1` in the URL; on
 * failure a red toast carrying the action's own error message.
 *
 * The wrapped server action MUST return a result `{ ok, error? }` (or void = ok)
 * instead of `redirect()`-ing — a redirect would be swallowed here and read as an
 * error. Keep `revalidatePath` in the action so the refreshed server render shows
 * the saved values.
 */
export type SaveResult = { ok: boolean; error?: string } | void;
type ToastKind = "ok" | "err";

export function ToastResultForm({
  action,
  savedMessage,
  className,
  resetOnSuccess = false,
  encType,
  children,
}: {
  action: (formData: FormData) => Promise<SaveResult>;
  savedMessage: string;
  className?: string;
  resetOnSuccess?: boolean;
  encType?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [toast, setToast] = useState<{ id: number; kind: ToastKind; text: string } | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (kind: ToastKind, text: string) => {
    const id = ++idRef.current;
    setToast({ id, kind, text });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setToast((cur) => (cur && cur.id === id ? null : cur));
    }, 4000);
  };

  const clientAction = async (formData: FormData) => {
    try {
      const res = await action(formData);
      if (res && res.ok === false) {
        show("err", res.error || "Couldn't save — please try again.");
        return;
      }
      show("ok", savedMessage);
      if (resetOnSuccess) formRef.current?.reset();
      router.refresh();
    } catch {
      show("err", "Couldn't save — please try again.");
    }
  };

  return (
    <>
      <form ref={formRef} action={clientAction} className={className} encType={encType}>
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
            <span>
              {toast.kind === "ok" ? "✓ " : "✕ "}
              {toast.text}
            </span>
          </button>
        </div>
      ) : null}
    </>
  );
}
