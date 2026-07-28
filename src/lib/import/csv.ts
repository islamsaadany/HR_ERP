// Minimal, dependency-free delimited-text parser (CSV / TSV / semicolon).
// Handles quoted fields, escaped quotes ("" -> "), CRLF/LF, and BOM. The
// delimiter is sniffed from the header line so a sheet exported as CSV *or*
// pasted as TSV both work.

function sniffDelimiter(firstLine: string): string {
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  if (tabs > 0 && tabs >= commas && tabs >= semis) return "\t";
  if (semis > commas) return ";";
  return ",";
}

/** Parse delimited text into a grid of trimmed-per-cell strings. Blank rows are dropped. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, ""); // strip BOM
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = sniffDelimiter(firstLine);

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore; \n handles the row break
    } else {
      field += c;
    }
  }
  // Flush the final field/row (files without a trailing newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop rows that are entirely empty.
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}
