/**
 * How long a success/error toast stays on screen, everywhere in the app.
 *
 * This was the literal `4000` duplicated across four separate toast implementations
 * (`QueryToast`, `ToastForm`, `ToastResultForm`, and the benefits board's own toasts). They
 * happened to agree, but nothing kept them agreeing — so the one number now lives here.
 */
export const TOAST_DURATION_MS = 4000;
