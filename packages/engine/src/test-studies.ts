import type { Study } from "@cheiron/ctgov";

export function study(p: Partial<Study> & { nct_id: string }): Study {
  const start_date = p.start_date === undefined ? "2020-01-15" : p.start_date;
  return {
    title: `Study ${p.nct_id}`, status: "COMPLETED", phases: ["PHASE2"], start_date,
    start_year: start_date ? Number(start_date.slice(0, 4)) : null, primary_completion_date: null,
    lead_sponsor: { name: "Acme", class: "INDUSTRY" }, collaborators: [], conditions: ["Melanoma"], mesh_conditions: ["Melanoma"],
    interventions: [{ name: "Pembrolizumab", type: "BIOLOGICAL" }], mesh_interventions: ["pembrolizumab"],
    countries: ["United States"], enrollment: 100, study_type: "INTERVENTIONAL", sex: "ALL", std_ages: ["ADULT"],
    ...p,
  };
}

/** Twelve studies that exercise every rule: multi-valued phases, missing dates, no enrollment, several countries, combinations. */
export const SAMPLE: Study[] = [
  study({ nct_id: "NCT00000001", phases: ["PHASE3"], start_date: "2021-03-01", enrollment: 500, countries: ["United States", "Germany"], lead_sponsor: { name: "Merck", class: "INDUSTRY" }, mesh_interventions: ["pembrolizumab", "lenvatinib"], interventions: [{ name: "Pembrolizumab", type: "BIOLOGICAL" }, { name: "Lenvatinib", type: "DRUG" }] }),
  study({ nct_id: "NCT00000002", phases: ["PHASE1", "PHASE2"], start_date: "2021-07-10", enrollment: 40, lead_sponsor: { name: "Merck", class: "INDUSTRY" } }),
  study({ nct_id: "NCT00000003", phases: ["PHASE2"], start_date: "2020-11-05", enrollment: null, lead_sponsor: { name: "NCI", class: "NIH" }, countries: ["Canada"] }),
  study({ nct_id: "NCT00000004", phases: [], start_date: null, enrollment: 20, status: "RECRUITING", study_type: "OBSERVATIONAL" }),
  study({ nct_id: "NCT00000005", phases: ["PHASE3"], start_date: "2019-05-20", enrollment: 1200, countries: ["Germany", "France"], mesh_conditions: ["Melanoma", "Lung Neoplasms"], mesh_interventions: ["nivolumab"], interventions: [{ name: "Nivolumab", type: "BIOLOGICAL" }], lead_sponsor: { name: "Bristol", class: "INDUSTRY" } }),
  study({ nct_id: "NCT00000006", phases: ["PHASE2"], start_date: "2019-01-01", enrollment: 80, mesh_interventions: [], interventions: [{ name: "Pembrolizumab 200mg", type: "BIOLOGICAL" }, { name: "pembrolizumab", type: "BIOLOGICAL" }, { name: "Placebo", type: "DRUG" }] }),
  study({ nct_id: "NCT00000007", phases: ["PHASE1"], start_date: "2018-09-09", enrollment: 12, status: "RECRUITING", lead_sponsor: { name: "Acme", class: "INDUSTRY" }, collaborators: ["NCI"] }),
  study({ nct_id: "NCT00000008", phases: ["NA"], start_date: "2022-02-02", enrollment: 300, study_type: "OBSERVATIONAL", interventions: [], mesh_interventions: [] }),
  study({ nct_id: "NCT00000009", phases: ["PHASE3"], start_date: "2022-08-30", enrollment: 2500, countries: ["Japan"], lead_sponsor: { name: "Merck", class: "INDUSTRY" }, mesh_interventions: ["pembrolizumab", "chemotherapy"], interventions: [{ name: "Pembrolizumab", type: "BIOLOGICAL" }, { name: "Chemotherapy", type: "DRUG" }] }),
  study({ nct_id: "NCT00000010", phases: ["PHASE2"], start_date: "2023-04-04", enrollment: 60, std_ages: ["CHILD", "ADULT"], sex: "FEMALE" }),
  study({ nct_id: "NCT00000011", phases: ["EARLY_PHASE1"], start_date: "2023-12-12", enrollment: 8, lead_sponsor: { name: "Uni Hospital", class: "OTHER" }, countries: [] }),
  study({ nct_id: "NCT00000012", phases: ["PHASE3"], start_date: "2024-06-06", enrollment: 900, lead_sponsor: { name: "Merck", class: "INDUSTRY" }, mesh_interventions: ["pembrolizumab", "lenvatinib"], interventions: [{ name: "Pembrolizumab", type: "BIOLOGICAL" }, { name: "Lenvatinib", type: "DRUG" }] }),
];
