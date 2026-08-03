/**
 * Downloadable CSV templates for the Incentive Scheme upload. Headers match the
 * parsers in ./import; the sample rows are synthetic placeholders (not real
 * compensation data) so the format is obvious.
 */
export const INCENTIVE_TEMPLATES: Record<"people" | "assignments" | "contributions", { filename: string; csv: string }> = {
  people: {
    filename: "people.csv",
    csv: `name,role,net_monthly_salary,start_date,eligible_to_lead,utilization
Sample Lead,Senior Consultant,120000,2024-01-01,yes,0.70
Sample Contributor,Consultant,70000,2024-06-01,yes,0.65
`,
  },
  assignments: {
    filename: "assignments.csv",
    csv: `client,type,cycle,lead,bd,lead_source,revenue,direct_cost,vendor_cost,markup_pct,start_date,close_date
Sample Retainer,RET,H1-2026,Sample Lead,Sample Lead,Sample Lead,1000000,250000,0,0,2026-01-01,Ongoing
Sample Project,PRJ,H1-2026,Sample Lead,Sample Contributor,Sample Lead,300000,60000,0,0,2026-01-01,2026-05-30
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
