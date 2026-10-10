export const CHART_TYPES = [
  "bar", "grouped_bar", "stacked_bar", "line", "histogram", "scatter", "network_graph", "map", "table", "single_value",
  "bubble",
] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const INTENTS = [
  "time_trend", "distribution", "comparison", "ranking", "geographic", "network", "count", "lookup", "other",
] as const;
export type Intent = (typeof INTENTS)[number];

export const DIMENSIONS = [
  "phase", "status", "sponsor_class", "sponsor", "intervention_type", "drug", "condition", "country",
  "start_year", "enrollment", "study_type", "sex", "age_group", "none",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const METRICS = ["trial_count", "enrollment_total", "enrollment_median"] as const;
export type Metric = (typeof METRICS)[number];

export const GRANULARITIES = ["year", "quarter", "month"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const EDGE_KINDS = ["sponsor_drug", "drug_drug", "condition_drug", "sponsor_condition", "sponsor_collaborator"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const PHASES = ["EARLY_PHASE1", "PHASE1", "PHASE2", "PHASE3", "PHASE4", "NA"] as const;
export type Phase = (typeof PHASES)[number];

export const OVERALL_STATUSES = [
  "RECRUITING", "NOT_YET_RECRUITING", "ENROLLING_BY_INVITATION", "ACTIVE_NOT_RECRUITING", "COMPLETED",
  "SUSPENDED", "TERMINATED", "WITHDRAWN", "AVAILABLE", "NO_LONGER_AVAILABLE", "TEMPORARILY_NOT_AVAILABLE",
  "APPROVED_FOR_MARKETING", "WITHHELD", "UNKNOWN",
] as const;
export type OverallStatus = (typeof OVERALL_STATUSES)[number];

export const SPONSOR_CLASSES = ["INDUSTRY", "NIH", "FED", "OTHER_GOV", "NETWORK", "OTHER", "INDIV", "UNKNOWN", "AMBIG"] as const;
export type SponsorClass = (typeof SPONSOR_CLASSES)[number];

export const STUDY_TYPES = ["INTERVENTIONAL", "OBSERVATIONAL", "EXPANDED_ACCESS"] as const;
export type StudyType = (typeof STUDY_TYPES)[number];

export const SEXES = ["ALL", "FEMALE", "MALE"] as const;
export type Sex = (typeof SEXES)[number];

export const AGE_GROUPS = ["CHILD", "ADULT", "OLDER_ADULT"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const INTERVENTION_TYPES = [
  "DRUG", "BIOLOGICAL", "DEVICE", "PROCEDURE", "BEHAVIORAL", "RADIATION", "DIETARY_SUPPLEMENT", "GENETIC",
  "COMBINATION_PRODUCT", "DIAGNOSTIC_TEST", "OTHER",
] as const;
export type InterventionType = (typeof INTERVENTION_TYPES)[number];
