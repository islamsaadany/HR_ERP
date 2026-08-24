"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";

/**
 * The section and category lists behind petty cash lines and payback requests (spec 040).
 *
 * Super User only. These are the words the whole expense record is filed under, and a rename
 * changes every historical row's label at once — that is governance, not day-to-day Finance.
 *
 * Archiving, never deleting: an archived value stays on the records that already reference it
 * and simply stops being offered on new ones. Deleting would rewrite history to make a dropdown
 * tidier.
 */

const q = (s: string) => encodeURIComponent(s);
const BACK = "/admin/expense-lists";

function fail(msg: string): never {
  redirect(`${BACK}?error=${q(msg)}`);
}

type Kind = "section" | "category";

function kindOf(formData: FormData): Kind {
  return (formData.get("kind") as string | null) === "category" ? "category" : "section";
}

/**
 * The two tables have identical shape, so one set of actions serves both — but a single
 * `kind === "category" ? prisma.expenseCategory : prisma.expenseSection` delegate does not
 * typecheck (Prisma's per-model generics make the union uncallable). Four small branching
 * helpers keep the actions themselves free of the duplication.
 */
function findByName(kind: Kind, name: string) {
  return kind === "category"
    ? prisma.expenseCategory.findUnique({ where: { name } })
    : prisma.expenseSection.findUnique({ where: { name } });
}

function nextSortOrder(kind: Kind) {
  const args = { orderBy: { sortOrder: "desc" }, select: { sortOrder: true } } as const;
  return kind === "category"
    ? prisma.expenseCategory.findFirst(args)
    : prisma.expenseSection.findFirst(args);
}

function createValue(kind: Kind, data: { name: string; sortOrder: number }) {
  return kind === "category"
    ? prisma.expenseCategory.create({ data })
    : prisma.expenseSection.create({ data });
}

function updateValue(kind: Kind, id: string, data: { name?: string; archivedAt?: Date | null }) {
  return kind === "category"
    ? prisma.expenseCategory.update({ where: { id }, data })
    : prisma.expenseSection.update({ where: { id }, data });
}

export async function addValue(formData: FormData): Promise<void> {
  await requireSuperUser();
  const kind = kindOf(formData);
  const name = ((formData.get("name") as string | null) ?? "").trim();
  if (!name) fail("Type a name first.");
  if (name.length > 60) fail("That name is too long — 60 characters at most.");

  const clash = await findByName(kind, name);
  if (clash) {
    fail(
      clash.archivedAt
        ? `“${name}” already exists but is archived — restore it instead of adding a second one.`
        : `“${name}” is already on the list.`,
    );
  }

  const last = await nextSortOrder(kind);
  await createValue(kind, { name, sortOrder: (last?.sortOrder ?? 0) + 10 });

  revalidatePath(BACK);
  redirect(`${BACK}?ok=${q(`Added “${name}”.`)}`);
}

export async function renameValue(formData: FormData): Promise<void> {
  await requireSuperUser();
  const kind = kindOf(formData);
  const id = ((formData.get("id") as string | null) ?? "").trim();
  const name = ((formData.get("name") as string | null) ?? "").trim();
  if (!name) fail("Type a name first.");

  const clash = await findByName(kind, name);
  if (clash && clash.id !== id) fail(`“${name}” is already on the list.`);

  // Records reference the row by id, so this changes the label everywhere at once — including on
  // periods that are already closed. That is intended: it is the same thing, renamed.
  await updateValue(kind, id, { name });

  revalidatePath(BACK);
  redirect(`${BACK}?ok=${q("Renamed.")}`);
}

export async function archiveValue(formData: FormData): Promise<void> {
  await requireSuperUser();
  const kind = kindOf(formData);
  const id = ((formData.get("id") as string | null) ?? "").trim();

  await updateValue(kind, id, { archivedAt: new Date() });

  revalidatePath(BACK);
  redirect(`${BACK}?ok=${q("Archived — it stays on existing records, but won't be offered again.")}`);
}

export async function restoreValue(formData: FormData): Promise<void> {
  await requireSuperUser();
  const kind = kindOf(formData);
  const id = ((formData.get("id") as string | null) ?? "").trim();

  await updateValue(kind, id, { archivedAt: null });

  revalidatePath(BACK);
  redirect(`${BACK}?ok=${q("Back on the list.")}`);
}
