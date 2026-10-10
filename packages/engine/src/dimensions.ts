import type { Dimension, Granularity, Phase } from "@chatctg/contracts";
import type { Study } from "@chatctg/ctgov";

export const ENROLLMENT_BINS: { label: string; min: number; max: number | null }[] = [
  { label: "1–50", min: 1, max: 50 }, { label: "51–100", min: 51, max: 100 }, { label: "101–200", min: 101, max: 200 },
  { label: "201–500", min: 201, max: 500 }, { label: "501–1000", min: 501, max: 1000 }, { label: "1001+", min: 1001, max: null },
];

const dedupeCi = (xs: string[]): string[] => {
  const seen = new Set<string>(); const out: string[] = [];
  for (const x of xs) { const k = x.trim().toLowerCase(); if (k && !seen.has(k)) { seen.add(k); out.push(x.trim()); } }
  return out;
};

const DRUG_TYPES = new Set(["DRUG", "BIOLOGICAL"]);

/** MeSH terms when the registry mapped any; else the drug/biological names, lowercased. Deduped case-insensitively. */
export function drugIdentity(s: Study): string[] {
  if (s.mesh_interventions.length) return dedupeCi(s.mesh_interventions.map((t) => t.toLowerCase()));
  return dedupeCi(s.interventions.filter((i) => DRUG_TYPES.has(i.type)).map((i) => i.name.toLowerCase()));
}

export function conditionIdentity(s: Study): string[] {
  return dedupeCi(s.mesh_conditions.length ? s.mesh_conditions : s.conditions);
}

export function timeKey(s: Study, g: Granularity): string | null {
  if (!s.start_date || !/^\d{4}/.test(s.start_date)) return null;
  const year = s.start_date.slice(0, 4);
  if (g === "year") return year;
  const month = /^\d{4}-(\d{2})/.exec(s.start_date)?.[1];
  if (!month) return null;
  if (g === "month") return `${year}-${month}`;
  return `${year}-Q${Math.floor((Number(month) - 1) / 3) + 1}`;
}

const enrollmentBin = (n: number | null): string | null => {
  if (n === null || n < 1) return null;
  const bin = ENROLLMENT_BINS.find((b) => n >= b.min && (b.max === null || n <= b.max));
  return bin ? bin.label : null;
};

/** The bucket keys a study falls in for a dimension. Empty when it has no value. */
export function valuesOf(s: Study, d: Dimension, g: Granularity | null = "year"): string[] {
  switch (d) {
    case "phase": return s.phases;
    case "status": return [s.status];
    case "sponsor_class": return [s.lead_sponsor.class];
    case "sponsor": return s.lead_sponsor.name ? [s.lead_sponsor.name] : [];
    case "intervention_type": return [...new Set(s.interventions.map((i) => i.type))];
    case "drug": return drugIdentity(s);
    case "condition": return conditionIdentity(s);
    case "country": return s.countries;
    case "start_year": { const k = timeKey(s, g ?? "year"); return k ? [k] : []; }
    case "enrollment": { const b = enrollmentBin(s.enrollment); return b ? [b] : []; }
    case "study_type": return [s.study_type];
    case "sex": return [s.sex];
    case "age_group": return s.std_ages;
    case "none": return [];
  }
}

export const isMultiValued = (d: Dimension): boolean => ["phase", "intervention_type", "drug", "condition", "country", "age_group"].includes(d);

const PHASE_ORDER = ["EARLY_PHASE1", "PHASE1", "PHASE2", "PHASE3", "PHASE4", "NA"];
const STATUS_ORDER = ["RECRUITING", "NOT_YET_RECRUITING", "ENROLLING_BY_INVITATION", "ACTIVE_NOT_RECRUITING", "COMPLETED", "SUSPENDED", "TERMINATED", "WITHDRAWN", "AVAILABLE", "NO_LONGER_AVAILABLE", "TEMPORARILY_NOT_AVAILABLE", "APPROVED_FOR_MARKETING", "WITHHELD", "UNKNOWN"];
const CLASS_ORDER = ["INDUSTRY", "NIH", "FED", "OTHER_GOV", "NETWORK", "OTHER", "INDIV", "UNKNOWN", "AMBIG"];
const TYPE_ORDER = ["DRUG", "BIOLOGICAL", "DEVICE", "PROCEDURE", "BEHAVIORAL", "RADIATION", "DIETARY_SUPPLEMENT", "GENETIC", "COMBINATION_PRODUCT", "DIAGNOSTIC_TEST", "OTHER"];

export function fixedOrder(d: Dimension): string[] | null {
  switch (d) {
    case "phase": return PHASE_ORDER;
    case "status": return STATUS_ORDER;
    case "sponsor_class": return CLASS_ORDER;
    case "intervention_type": return TYPE_ORDER;
    case "enrollment": return ENROLLMENT_BINS.map((b) => b.label);
    case "study_type": return ["INTERVENTIONAL", "OBSERVATIONAL", "EXPANDED_ACCESS"];
    case "sex": return ["ALL", "FEMALE", "MALE"];
    case "age_group": return ["CHILD", "ADULT", "OLDER_ADULT"];
    default: return null;
  }
}

const title = (s: string): string => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const PHASE_LABEL: Record<string, string> = { EARLY_PHASE1: "Early Phase 1", PHASE1: "Phase 1", PHASE2: "Phase 2", PHASE3: "Phase 3", PHASE4: "Phase 4", NA: "Not applicable" };
/** A phase inside a sentence: "phase 3 only", "Phase 3 was named". */
export const PHASE_PHRASE: Record<Phase, string> = { EARLY_PHASE1: "early phase 1", PHASE1: "phase 1", PHASE2: "phase 2", PHASE3: "phase 3", PHASE4: "phase 4", NA: "phase not applicable" };
const CLASS_LABEL: Record<string, string> = { INDUSTRY: "Industry", NIH: "NIH", FED: "US federal", OTHER_GOV: "Other government", NETWORK: "Network", OTHER: "Other (academic, hospital)", INDIV: "Individual", UNKNOWN: "Unknown", AMBIG: "Ambiguous" };

export function bucketLabel(d: Dimension, key: string): string {
  switch (d) {
    case "phase": return PHASE_LABEL[key] ?? key;
    case "sponsor_class": return CLASS_LABEL[key] ?? key;
    case "status": case "intervention_type": case "study_type": case "sex": case "age_group": return title(key);
    default: return key;
  }
}

export const DIMENSION_LABEL: Record<Dimension, string> = {
  phase: "Phase", status: "Status", sponsor_class: "Sponsor class", sponsor: "Sponsor", intervention_type: "Intervention type",
  drug: "Drug", condition: "Condition", country: "Country", start_year: "Start date", enrollment: "Enrollment",
  study_type: "Study type", sex: "Sex", age_group: "Age group", none: "",
};
export const DIMENSION_LABEL_PLURAL: Record<Dimension, string> = {
  phase: "phases", status: "statuses", sponsor_class: "sponsor classes", sponsor: "sponsors", intervention_type: "intervention types",
  drug: "drugs", condition: "conditions", country: "countries", start_year: "years", enrollment: "enrollment sizes",
  study_type: "study types", sex: "sexes", age_group: "age groups", none: "",
};

export function citationField(d: Dimension): string {
  switch (d) {
    case "phase": return "protocolSection.designModule.phases";
    case "status": return "protocolSection.statusModule.overallStatus";
    case "sponsor_class": return "protocolSection.sponsorCollaboratorsModule.leadSponsor.class";
    case "sponsor": return "protocolSection.sponsorCollaboratorsModule.leadSponsor.name";
    case "intervention_type": return "protocolSection.armsInterventionsModule.interventions[].type";
    case "drug": return "derivedSection.interventionBrowseModule.meshes[].term | protocolSection.armsInterventionsModule.interventions[].name";
    case "condition": return "derivedSection.conditionBrowseModule.meshes[].term | protocolSection.conditionsModule.conditions";
    case "country": return "protocolSection.contactsLocationsModule.locations[].country";
    case "start_year": return "protocolSection.statusModule.startDateStruct.date";
    case "enrollment": return "protocolSection.designModule.enrollmentInfo.count";
    case "study_type": return "protocolSection.designModule.studyType";
    case "sex": return "protocolSection.eligibilityModule.sex";
    case "age_group": return "protocolSection.eligibilityModule.stdAges";
    case "none": return "protocolSection.identificationModule.nctId";
  }
}

/** The exact registry value that put the study in the bucket `key`. */
export function citationExcerpt(s: Study, d: Dimension, key: string): string {
  switch (d) {
    case "start_year": return s.start_date ?? "";
    case "enrollment": return s.enrollment === null ? "" : String(s.enrollment);
    case "drug": {
      const mesh = s.mesh_interventions.find((t) => t.toLowerCase() === key.toLowerCase());
      return mesh ?? s.interventions.find((i) => i.name.toLowerCase() === key.toLowerCase())?.name ?? key;
    }
    case "condition": return s.mesh_conditions.find((t) => t.toLowerCase() === key.toLowerCase()) ?? s.conditions.find((c) => c.toLowerCase() === key.toLowerCase()) ?? key;
    case "none": return s.nct_id;
    default: return key;
  }
}

export const studyLabel = (s: Study): string => s.title || s.nct_id;
