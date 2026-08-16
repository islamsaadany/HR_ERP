import { classifyEligibility, hasKnownStartDate } from "../src/lib/benefits/proration";
let pass = 0, fail = 0;
const check = (l: string, c: boolean) => { console.log(`${c ? "  ✓" : "  ✗"} ${l}`); c ? pass++ : fail++; };

// Their real setup: medical term 15 Jun 2026 – 14 Jun 2027; benefits cycle 1 Jul – 31 Dec 2026.
const term = { start: new Date(2026,5,15), end: new Date(2027,5,14) };
const cycle = { start: new Date(2026,6,1), end: new Date(2026,11,31) };
const today = new Date(2026,7,16); // 16 Aug 2026

console.log("Medical (3 months) against the policy term");
check("joined 1 Jul 2026 — 6 weeks in — is NOT YET eligible",
  classifyEligibility(new Date(2026,6,1), 3, term, today).status === "NOT_YET");
check("joined 1 Aug 2026 — two weeks in — is NOT YET eligible",
  classifyEligibility(new Date(2026,7,1), 3, term, today).status === "NOT_YET");
check("joined 1 May 2026 — past 3 months — IS eligible",
  classifyEligibility(new Date(2026,4,1), 3, term, today).status !== "NOT_YET");
check("…and is prorated, not full (eligible after the term opened)",
  classifyEligibility(new Date(2026,4,1), 3, term, today).status === "PRORATED");
check("joined 2025 — long-serving — gets the FULL term",
  classifyEligibility(new Date(2025,0,1), 3, term, today).status === "FULL");

console.log("\nThe same employee, one day either side of their 3-month mark");
const joined = new Date(2026,4,20); // 20 May 2026 → eligible 20 Aug 2026
check("19 Aug 2026 — one day early — refused",
  classifyEligibility(joined, 3, term, new Date(2026,7,19)).status === "NOT_YET");
check("20 Aug 2026 — the day it lands — allowed",
  classifyEligibility(joined, 3, term, new Date(2026,7,20)).status !== "NOT_YET");

console.log("\nFlexible basket (6 months) against the cycle — same hole, same fix");
check("joined 1 May 2026 — 6-month mark 1 Nov, inside the cycle — refused today",
  classifyEligibility(new Date(2026,4,1), 6, cycle, today).status === "NOT_YET");
check("joined 1 Nov 2025 — already served 6 months — allowed",
  classifyEligibility(new Date(2025,10,1), 6, cycle, today).status !== "NOT_YET");

console.log("\nUnchanged behaviour");
check("no window still means FULL", classifyEligibility(new Date(2026,7,1), 3, null, today).status === "FULL");
check("no start date now BLOCKS — a missing hire date used to mean fully eligible",
  classifyEligibility(null, 3, term, today).status === "NOT_YET");
check("…and the page can tell that apart from 'not yet', to say the right thing",
  hasKnownStartDate(null) === false && hasKnownStartDate(new Date(2026,0,1)) === true);
check("eligible only after the window ends is still NOT_YET",
  classifyEligibility(new Date(2027,4,1), 3, cycle, new Date(2027,11,1)).status === "NOT_YET");
check("someone eligible before the window opened still gets FULL",
  classifyEligibility(new Date(2024,0,1), 6, cycle, today).status === "FULL");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
