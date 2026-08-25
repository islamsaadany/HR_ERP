/**
 * Downloadable CSV templates for the Incentive Scheme upload. Headers match the
 * parsers in ./import; the sample rows are synthetic placeholders (not real
 * compensation data) so the format is obvious.
 *
 * Dates are written **dd/mm/yyyy** — the house standard, and what the sample row
 * has to show, because whatever it shows is what the operator types underneath.
 */
export const INCENTIVE_TEMPLATES: Record<"people" | "assignments" | "contributions", { filename: string; csv: string }> = {
  people: {
    filename: "people.csv",
    csv: `name,role,net_monthly_salary,start_date
Sample Lead,Senior Consultant,120000,01/01/2024
Sample Contributor,Consultant,70000,01/06/2024
`,
  },
  assignments: {
    filename: "assignments.csv",
    csv: `client,type,lead,bd,lead_source,revenue,direct_cost,vendor_cost,markup_pct,start_date,close_date
Sample Retainer,RET,Sample Lead,Sample Lead,Sample Lead,1000000,250000,0,0,01/01/2026,Ongoing
Sample Project,PRJ,Sample Lead,Sample Contributor,Sample Lead,300000,60000,0,0,01/01/2026,30/05/2026
`,
  },
  contributions: {
    filename: "contributions.csv",
    csv: `client,Sample Lead,Sample Contributor
Sample Retainer,0.7,0.3
Sample Project,0.6,0.4
`,
  },
};
