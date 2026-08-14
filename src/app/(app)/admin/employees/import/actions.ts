"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { parseEmployeesCsv, type ParsedRow } from "@/lib/import/employees";
import { getDepartments } from "@/lib/departments";

export interface RowResult {
  rowNumber: number;
  name: string;
  email: string;
  action: "created" | "updated" | "skipped" | "error";
  messages: string[];
}

export type ImportReport =
  | { ok: false; error: string }
  | {
      ok: true;
      created: number;
      updated: number;
      skipped: number;
      dependantsCreated: number;
      rows: RowResult[];
    };

/** Profile fields set on both create and update (role/status/endDate are NOT touched on update). */
function profileData(r: ParsedRow) {
  return {
    name: r.name,
    email: r.email,
    phone: r.phone,
    department: r.department,
    title: r.title,
    employmentType: r.employmentType,
    tenureBand: r.tenureBand,
    startDate: r.startDate,
    dateOfBirth: r.dateOfBirth,
    maritalStatus: r.maritalStatus,
    emergencyContactName: r.emergencyContactName,
    emergencyContactRelationship: r.emergencyContactRelationship,
    emergencyContactPhone: r.emergencyContactPhone,
  };
}

export async function importEmployees(
  _prev: ImportReport | null,
  formData: FormData
): Promise<ImportReport> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose a CSV file to upload." };
  }
  if (file.size > 2_000_000) {
    return { ok: false, error: "That file is larger than 2 MB — is it the right one?" };
  }

  const text = await file.text();
  const parsed = parseEmployeesCsv(text, {
    companyDomain: (process.env.ALLOWED_EMAIL_DOMAIN ?? "forefront.consulting").toLowerCase(),
    knownDepartments: await getDepartments(),
  });

  if (parsed.headerErrors.length) {
    return { ok: false, error: parsed.headerErrors.join(" ") };
  }
  if (parsed.rows.length === 0) {
    return { ok: false, error: "No data rows found under the header." };
  }

  // Managed business units (spec 024) — resolve the "Business Unit" column by name.
  const units = await prisma.businessUnit.findMany({ select: { id: true, name: true } });
  const buByName = new Map(units.map((u) => [u.name.trim().toLowerCase(), u.id]));

  // Guard against duplicate emails within the same file (last one would silently win).
  const seen = new Map<string, number>();
  for (const r of parsed.rows) {
    if (!r.email) continue;
    seen.set(r.email, (seen.get(r.email) ?? 0) + 1);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let dependantsCreated = 0;
  const results: RowResult[] = [];

  for (const r of parsed.rows) {
    const messages = [...r.warnings];

    if (r.errors.length > 0) {
      skipped++;
      results.push({
        rowNumber: r.rowNumber,
        name: r.name || "(no name)",
        email: r.email,
        action: "skipped",
        messages: [`Skipped — ${r.errors.join(", ")}`, ...messages],
      });
      continue;
    }

    if ((seen.get(r.email) ?? 0) > 1) {
      messages.push("email appears more than once in this file — the last row wins");
    }

    // Resolve the business unit by name. An unknown name is flagged (not dropped);
    // a blank/absent value leaves the existing assignment untouched (no wipe).
    let buData: { businessUnitId?: string } = {};
    if (r.businessUnitName) {
      const buId = buByName.get(r.businessUnitName.trim().toLowerCase());
      if (buId) {
        buData = { businessUnitId: buId };
      } else {
        messages.push(
          `business unit "${r.businessUnitName}" isn't a known unit — left unchanged; add it under Admin → Business Units`
        );
      }
    }

    try {
      const existing = await prisma.user.findUnique({
        where: { email: r.email },
        select: { id: true },
      });

      const deps = {
        create: r.dependants.map((d) => ({
          name: d.name,
          dateOfBirth: d.dateOfBirth,
          kind: d.kind,
        })),
      };

      if (existing) {
        await prisma.$transaction([
          prisma.dependant.deleteMany({ where: { userId: existing.id } }),
          prisma.user.update({
            where: { id: existing.id },
            data: { ...profileData(r), ...buData, dependants: deps },
          }),
        ]);
        updated++;
        dependantsCreated += r.dependants.length;
        results.push({
          rowNumber: r.rowNumber,
          name: r.name,
          email: r.email,
          action: "updated",
          messages,
        });
      } else {
        await prisma.user.create({
          data: {
            ...profileData(r),
            ...buData,
            role: "EMPLOYEE",
            status: "ACTIVE",
            dependants: deps,
          },
        });
        created++;
        dependantsCreated += r.dependants.length;
        results.push({
          rowNumber: r.rowNumber,
          name: r.name,
          email: r.email,
          action: "created",
          messages,
        });
      }
    } catch (err) {
      skipped++;
      results.push({
        rowNumber: r.rowNumber,
        name: r.name,
        email: r.email,
        action: "error",
        messages: [
          `Database error — ${err instanceof Error ? err.message : "unknown"}`,
          ...messages,
        ],
      });
    }
  }

  // Second pass: resolve manager links only if the sheet provided a manager column.
  const withManager = parsed.rows.filter((r) => r.managerEmail && r.errors.length === 0);
  if (withManager.length > 0) {
    for (const r of withManager) {
      try {
        const [self, manager] = await Promise.all([
          prisma.user.findUnique({ where: { email: r.email }, select: { id: true } }),
          prisma.user.findUnique({
            where: { email: r.managerEmail! },
            select: { id: true },
          }),
        ]);
        if (!self) continue;
        if (!manager) {
          annotate(results, r.rowNumber, `manager ${r.managerEmail} not found in the import — set it in the profile`);
          continue;
        }
        if (manager.id === self.id) {
          annotate(results, r.rowNumber, "manager is the same person — reporting line skipped");
          continue;
        }
        await prisma.user.update({
          where: { id: self.id },
          data: { reportsToId: manager.id },
        });
      } catch {
        annotate(results, r.rowNumber, "couldn't set the reporting line — set it in the profile");
      }
    }
  }

  revalidatePath("/admin/employees");
  return { ok: true, created, updated, skipped, dependantsCreated, rows: results };
}

function annotate(results: RowResult[], rowNumber: number, message: string) {
  const hit = results.find((x) => x.rowNumber === rowNumber);
  if (hit) hit.messages.push(message);
}
