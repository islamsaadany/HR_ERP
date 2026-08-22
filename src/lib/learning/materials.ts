/**
 * Course materials — the ONE place that says what a document slot is, what a resource may be,
 * and which of them an employee is allowed to see (spec 038 materials, 2026-08-22).
 *
 * THE RULE THAT MATTERS: only the SLIDES slot ever reaches an employee. It is expressed once,
 * here, as `EMPLOYEE_VISIBLE_SLOTS`, and read by the serving route and by every page. A second
 * copy of that rule would mean the loosest copy decides who gets the expanded outline.
 */

import type { CourseDocumentSlot, CourseResourceKind } from "@prisma/client";

/** Fixed slots, in the order they are shown. Not a free file list — see the schema comment. */
export const DOCUMENT_SLOTS = ["OUTLINE", "EXPANDED_OUTLINE", "SLIDES"] as const;

export const DOCUMENT_SLOT_LABEL: Record<CourseDocumentSlot, string> = {
  OUTLINE: "Course outline",
  EXPANDED_OUTLINE: "Expanded outline",
  SLIDES: "Slides",
};

/** The only slot an employee may ever fetch. Read by the serving route AND the pages. */
export const EMPLOYEE_VISIBLE_SLOTS: readonly CourseDocumentSlot[] = ["SLIDES"];

export function isEmployeeVisibleSlot(slot: CourseDocumentSlot): boolean {
  return EMPLOYEE_VISIBLE_SLOTS.includes(slot);
}

export const RESOURCE_KINDS = ["BOOK", "ARTICLE", "VIDEO", "COURSE", "LINK"] as const;

export const RESOURCE_KIND_LABEL: Record<CourseResourceKind, string> = {
  BOOK: "Book",
  ARTICLE: "Article",
  VIDEO: "Video",
  COURSE: "Course",
  LINK: "Link",
};

/** Upload ceiling. Slides decks are the big one; 25 MB matches Handbook resources. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/**
 * Whether the browser can render this file in place, or whether the only honest offer is a
 * download. A PDF previews natively; a .pptx or .docx cannot, in any browser, without a
 * conversion service we do not run — so those get a download button and are labelled as such
 * rather than opening a viewer that shows nothing.
 */
export function isPreviewable(contentType: string | null, fileName: string): boolean {
  if (contentType === "application/pdf") return true;
  return fileName.toLowerCase().endsWith(".pdf");
}

/** "2.1 MB" — the figure people recognise, not bytes. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The short uppercase badge on a document row — PDF, DOCX, PPTX. */
export function fileKindBadge(fileName: string): string {
  const ext = fileName.split(".").pop()?.toUpperCase() ?? "";
  return ext.length > 0 && ext.length <= 4 ? ext : "FILE";
}

/**
 * Normalise a typed link.
 *
 * Employees type "hbr.org/2016/..." as often as they paste a full URL, and refusing that is a
 * worse outcome than prefixing it. Anything that is not plausibly a web address is rejected
 * rather than stored — a `javascript:` "link" rendered as an anchor is the reason this is not
 * simply "store whatever they typed".
 */
export function normaliseResourceUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  // A hostname with no dot is not a public address (and "javascript:alert(1)" lands here too).
  if (!parsed.hostname.includes(".")) return null;
  return parsed.toString();
}

/** "hbr.org" — what a resource row shows under the name when there is a link. */
export function linkHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * The average shown to HR, rounded to one decimal. Returns null for no ratings — a course
 * nobody has rated must read as "no ratings yet", never as 0 out of 5.
 */
export function averageStars(stars: number[]): number | null {
  if (stars.length === 0) return null;
  const total = stars.reduce((sum, s) => sum + s, 0);
  return Math.round((total / stars.length) * 10) / 10;
}

/**
 * Whether the finish panel (rating + suggest a resource) should be shown.
 *
 * Derived from two stored integers rather than a flag: skipping is durable, and a RENEWAL asks
 * again by itself because completing again moves `completionCount` past what was answered.
 */
export function shouldAskForRating(enrollment: {
  completedAt: Date | null;
  completionCount: number;
  ratingPromptDoneCount: number;
}): boolean {
  return enrollment.completedAt !== null && enrollment.completionCount > enrollment.ratingPromptDoneCount;
}
