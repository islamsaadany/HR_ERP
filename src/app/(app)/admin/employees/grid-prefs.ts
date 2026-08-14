// Shared constants/types for per-user grid preferences. Kept out of the
// "use server" actions file, which may only export async functions.

/** One saved column: its key and whether it's shown. Order = array order. */
export type ColumnPref = { key: string; visible: boolean };

/** Namespaced key under User.uiPrefs where the Employees grid layout lives. */
export const EMPLOYEES_COLUMNS_PREF = "employees.columns";
