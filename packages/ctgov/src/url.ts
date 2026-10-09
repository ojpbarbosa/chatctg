export const CTGOV_BASE_URL = "https://clinicaltrials.gov/api/v2";

/** Exactly what the engine reads. Verified valid against the live API on 2026-10-09. */
export const STUDY_FIELDS = [
  "NCTId", "BriefTitle", "OverallStatus", "Phase", "StartDate", "PrimaryCompletionDate",
  "LeadSponsorName", "LeadSponsorClass", "CollaboratorName", "Condition", "InterventionName", "InterventionType",
  "LocationCountry", "EnrollmentCount", "StudyType", "Sex", "StdAge", "ConditionMeshTerm", "InterventionMeshTerm",
] as const;

export interface StudiesQuery {
  intr?: string; cond?: string; spons?: string; locn?: string;
  overallStatus?: string; advanced?: string;
  pageSize?: number; pageToken?: string; countTotal?: boolean; sort?: string;
  fields?: readonly string[];
}

/** Essie: each term quoted (inner quotes removed), joined by the operator. */
export function essieTerms(terms: string[], op: "AND" | "OR"): string {
  return terms.map((t) => `"${t.replace(/"/g, "").trim()}"`).join(` ${op} `);
}

export function essieAdvanced(parts: { phase?: string; startYear?: number; endYear?: number }): string | undefined {
  const clauses: string[] = [];
  if (parts.phase) clauses.push(`AREA[Phase]${parts.phase}`);
  if (parts.startYear !== undefined || parts.endYear !== undefined) {
    const lo = parts.startYear !== undefined ? `${parts.startYear}-01-01` : "MIN";
    const hi = parts.endYear !== undefined ? `${parts.endYear}-12-31` : "MAX";
    clauses.push(`AREA[StartDate]RANGE[${lo},${hi}]`);
  }
  return clauses.length ? clauses.join(" AND ") : undefined;
}

export function buildStudiesUrl(q: StudiesQuery, baseUrl = CTGOV_BASE_URL): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/studies`);
  const set = (k: string, v: string | number | boolean | undefined) => { if (v !== undefined && v !== "") url.searchParams.set(k, String(v)); };
  set("format", "json");
  set("query.intr", q.intr); set("query.cond", q.cond); set("query.spons", q.spons); set("query.locn", q.locn);
  set("filter.overallStatus", q.overallStatus); set("filter.advanced", q.advanced);
  set("fields", (q.fields ?? STUDY_FIELDS).join(","));
  set("pageSize", q.pageSize); set("pageToken", q.pageToken); set("countTotal", q.countTotal); set("sort", q.sort);
  return url.toString();
}
