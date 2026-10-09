/** A registry record, flattened to what the engine reads. Nothing here is inferred: missing is null or empty. */
export interface Study {
  nct_id: string;
  title: string;
  status: string;
  phases: string[];
  start_date: string | null;
  start_year: number | null;
  primary_completion_date: string | null;
  lead_sponsor: { name: string; class: string };
  collaborators: string[];
  conditions: string[];
  mesh_conditions: string[];
  interventions: { name: string; type: string }[];
  mesh_interventions: string[];
  /** Distinct, in first-seen order. */
  countries: string[];
  enrollment: number | null;
  study_type: string;
  sex: string;
  std_ages: string[];
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string");
const names = (v: unknown, key: string): string[] => list(v).map((x) => str(rec(x)[key])).filter(Boolean);

export function normalizeStudy(raw: unknown): Study | null {
  const p = rec(rec(raw).protocolSection);
  const d = rec(rec(raw).derivedSection);
  const nct_id = str(rec(p.identificationModule).nctId);
  if (!/^NCT\d{8}$/.test(nct_id)) return null;
  const status = rec(p.statusModule);
  const start_date = strOrNull(rec(status.startDateStruct).date);
  const sponsor = rec(rec(p.sponsorCollaboratorsModule).leadSponsor);
  const design = rec(p.designModule);
  const count = rec(design.enrollmentInfo).count;
  const countries: string[] = [];
  for (const loc of list(rec(p.contactsLocationsModule).locations)) {
    const c = str(rec(loc).country);
    if (c && !countries.includes(c)) countries.push(c);
  }
  return {
    nct_id,
    title: str(rec(p.identificationModule).briefTitle),
    status: str(status.overallStatus, "UNKNOWN"),
    phases: strings(design.phases),
    start_date,
    start_year: start_date && /^\d{4}/.test(start_date) ? Number(start_date.slice(0, 4)) : null,
    primary_completion_date: strOrNull(rec(status.primaryCompletionDateStruct).date),
    lead_sponsor: { name: str(sponsor.name), class: str(sponsor.class, "UNKNOWN") },
    collaborators: names(rec(p.sponsorCollaboratorsModule).collaborators, "name"),
    conditions: strings(rec(p.conditionsModule).conditions),
    mesh_conditions: names(rec(d.conditionBrowseModule).meshes, "term"),
    interventions: list(rec(p.armsInterventionsModule).interventions).map((i) => ({ name: str(rec(i).name), type: str(rec(i).type, "OTHER") })).filter((i) => i.name),
    mesh_interventions: names(rec(d.interventionBrowseModule).meshes, "term"),
    countries,
    enrollment: typeof count === "number" && Number.isFinite(count) ? count : null,
    study_type: str(design.studyType, "UNKNOWN"),
    sex: str(rec(p.eligibilityModule).sex, "ALL"),
    std_ages: strings(rec(p.eligibilityModule).stdAges),
  };
}

export function normalizePage(json: unknown): { studies: Study[]; totalCount: number | null; nextPageToken: string | null } | null {
  const r = rec(json);
  if (!Array.isArray(r.studies)) return null;
  return {
    studies: r.studies.map(normalizeStudy).filter((s): s is Study => s !== null),
    totalCount: typeof r.totalCount === "number" ? r.totalCount : null,
    nextPageToken: typeof r.nextPageToken === "string" ? r.nextPageToken : null,
  };
}
