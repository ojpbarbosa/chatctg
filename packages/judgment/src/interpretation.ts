import type { ChartType, Dimension, EdgeKind, Granularity, Intent, Metric, Phase } from "@chatctg/contracts";
import { choice, noul } from "./questions";
import type { AnswersFor, JsonValue } from "./types";

export const QUESTION_SET = { id: "query-interpretation", version: 3 } as const;

export interface ProvidedFields {
  drugs?: string[]; conditions?: string[]; sponsors?: string[]; countries?: string[];
  trial_phase?: string; trial_status?: string; start_year?: number; end_year?: number;
}

/** The state is deliberately tiny: the question, and what the caller already pinned down. */
export function interpretationState(query: string, provided: ProvidedFields): JsonValue {
  const p: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(provided)) if (v !== undefined) p[k] = v as JsonValue;
  return { question: query, provided: p };
}

const c = (what: string, examples?: string[]): { [key: string]: JsonValue } => ({ what, ...(examples ? { examples } : {}) });

const DIMENSION_CRITERIA: Record<Dimension, { [key: string]: JsonValue }> = {
  phase: c("Trial phase: early phase 1, phase 1, 2, 3, 4, or not applicable.", ["across phases", "by phase", "phase 3 share"]),
  status: c("Recruitment status: recruiting, not yet recruiting, completed, terminated, withdrawn, and so on."),
  sponsor_class: c("The kind of lead sponsor: industry, NIH, other government, network, academic or other.", ["sponsor categories", "industry vs academic"]),
  sponsor: c("The named organisation that leads the trial.", ["which sponsors", "top companies running"]),
  intervention_type: c("The kind of intervention: drug, biological, device, procedure, behavioral, radiation, and so on.", ["intervention types"]),
  drug: c("The specific drug or intervention being tested.", ["which drugs", "most studied treatments"]),
  condition: c("The disease or condition studied.", ["which conditions", "indications"]),
  country: c("The country of the trial sites.", ["by country", "which countries"]),
  start_year: c("When the trial started: by year, quarter or month. Pick this for any question about change over time.", ["per year", "since 2015", "over time"]),
  enrollment: c("How many participants a trial enrolls (its size).", ["enrollment distribution", "trial sizes"]),
  study_type: c("Interventional, observational or expanded access."),
  sex: c("Which sexes are eligible: all, female, male."),
  age_group: c("Child, adult, older adult."),
  none: c("The question does not group, split or rank by any attribute."),
};

export function interpretationQuestions() {
  return {
    in_scope: noul(
      "Judge the user's question (question). Can it be answered from a registry of clinical trials, where each trial has a title, conditions, interventions, phases, a recruitment status, a sponsor and collaborators, site locations with countries, start and completion dates, an enrollment count, a study type, and eligible sexes and age groups?",
      {
        true: "Any question about trials, drugs, conditions, sponsors, sites, phases, enrollment, dates, or relationships between them, even a vague one such as 'what is happening in melanoma research'.",
        false: "A question that needs data the registry does not hold (prices, revenue, stock, efficacy results, dosing, side effects, news), or that is not about clinical trials at all ('what is the weather', 'write a poem').",
      },
    ),
    intent: choice<Intent>("What shape of answer is the user asking for? Judge the question (question) by its meaning, not by the words used. If the user asks for a network or relationship graph, the intent is network.", {
      time_trend: { what: "How a number changes over time: per year, per month, since a date, 'over time', 'trend', 'growth'.", examples: ["How has the number of pembrolizumab trials changed per year since 2015?", "How many melanoma trials started each year?"] },
      distribution: { what: "How trials split across the categories of one attribute, such as phase, status, sponsor type or intervention type.", not_for: "A split over time (time_trend), a top-N list over an open set (ranking), or two or more named things side by side (comparison).", examples: ["How are melanoma trials distributed across phases?", "What are the most common intervention types for diabetes trials?"] },
      comparison: { what: "Two or more NAMED things (drugs, conditions, sponsors, countries) measured side by side on the same attribute.", not_for: "One thing split by categories (distribution).", examples: ["Compare phases for trials involving pembrolizumab vs nivolumab.", "Compare sponsor classes across asthma and COPD trials."] },
      ranking: { what: "Which members of an open-ended set have the most trials: top sponsors, most studied conditions, most common drugs.", not_for: "A closed set such as phases or statuses (distribution); countries (geographic).", examples: ["Which sponsors run the most Alzheimer's trials?", "Top 10 conditions studied with semaglutide."] },
      geographic: { what: "Where trials happen: countries, regions, a map, locations.", examples: ["Which countries have the most recruiting trials for lupus?", "Where are CAR-T trials run?"] },
      network: { what: "Relationships or co-occurrence between entities: which sponsors test which drugs, which drugs are combined, which drugs are tested for which conditions, who collaborates with whom.", examples: ["Show a network of sponsors and drugs for melanoma trials.", "Which drugs frequently co-occur in combination studies with pembrolizumab?"] },
      count: { what: "A single number: how many trials match.", not_for: "A number per category or per period.", examples: ["How many phase 3 psoriasis trials are recruiting?"] },
      lookup: { what: "A list of specific trials or their details, or a plot of individual trials (one point per trial), rather than an aggregate.", examples: ["List recruiting trials for pediatric asthma in Canada.", "Which trials test tirzepatide in adolescents?"] },
      other: { what: "None of the above, or the question cannot be answered with trial counts, lists or relationships." },
    }),
    dimension: choice<Dimension>("Which attribute of the trials should the answer be grouped, split or ranked by? Pick 'none' when the question names no attribute. When trials are compared across named things (conditions, drugs, countries), the attribute is what is measured for each of them, not the named things themselves. For any question about change over time pick 'start_year'.", DIMENSION_CRITERIA),
    secondary_dimension: choice<Dimension>("Besides the main attribute, does the question ask to split each group further by a SECOND attribute (for example per year AND by phase, or by country AND by sponsor type)? Pick 'none' when there is only one attribute.", DIMENSION_CRITERIA),
    chart: choice<ChartType>("Which visual best answers the question? If the user names a visual form, pick that one.", {
      bar: { what: "One value per category, categories side by side.", not_for: "Change over many periods (line)." },
      grouped_bar: { what: "Several named things compared across the same categories, bars side by side within each category." },
      stacked_bar: { what: "One bar per category subdivided by a second attribute, when the total of each bar matters." },
      line: { what: "A value over time, one line per series." },
      histogram: { what: "How a numeric attribute (enrollment size, start year) is distributed across bins." },
      scatter: { what: "One point per trial on two numeric axes, such as enrollment against start date.", not_for: "Counts per category." },
      network_graph: { what: "Nodes and links showing which entities co-occur or relate." },
      map: { what: "Values per country drawn on a world map." },
      table: { what: "A list of individual trials with their details.", not_for: "Counts per category such as per phase (bar)." },
      single_value: { what: "One number, such as a total count." },
      bubble: { what: "A grid of two attributes, one circle per pair of categories sized by its number of trials, such as phase by sponsor class, or the categories of one attribute for each of several named things.", not_for: "A single attribute (bar), or change over time (line)." },
    }),
    chart_named: noul("Does the user explicitly name the kind of visual they want?", {
      true: "The question contains a word for a visual form: chart, graph, plot, map, network, table, list, timeline, histogram, scatter, pie.",
      false: "The question asks for information and leaves the visual form open ('how are', 'which', 'how many', 'compare', 'show me' with no form named).",
    }),
    granularity: choice<Granularity>("For a question about change over time, what period should each point cover?", {
      year: { what: "Per year, or no period named (the default)." },
      quarter: { what: "Per quarter." },
      month: { what: "Per month." },
    }),
    metric: choice<Metric>("What is being counted or measured?", {
      trial_count: { what: "The number of trials (the default when nothing else is named)." },
      enrollment_total: { what: "The total number of participants enrolled across the trials.", examples: ["how many patients", "total enrollment"] },
      enrollment_median: { what: "The typical (median) enrollment per trial.", examples: ["typical trial size", "median enrollment"] },
    }),
    edge_kind: choice<EdgeKind>("For a question about relationships, which two kinds of entities are linked?", {
      sponsor_drug: { what: "Sponsors linked to the drugs they test." },
      drug_drug: { what: "Drugs linked when they are tested together in the same trial (combinations)." },
      condition_drug: { what: "Conditions linked to the drugs tested for them." },
      sponsor_condition: { what: "Sponsors linked to the conditions they study." },
      sponsor_collaborator: { what: "Lead sponsors linked to their collaborators." },
    }),
    recruiting_only: noul("Does the user restrict the answer to trials that are currently recruiting, open, enrolling or ongoing?", {
      true: "Words such as recruiting, open, enrolling, currently running, active, ongoing.",
      false: "No restriction on status, or a different status (completed, terminated) is named.",
    }),
    combination: noul("When the question names more than one drug, does the user mean trials in which those drugs are used TOGETHER (a combination)?", {
      true: "'pembrolizumab plus chemotherapy', 'combined with', 'in combination with', 'together with'.",
      false: "The drugs are alternatives or are being compared: 'or', 'versus', 'vs', 'compare', 'either'. Also when only one drug is named.",
    }),
    phase_filter: choice<Phase | "none">("Does the user restrict the answer to trials of one phase (question)? Pick the phase named; pick none when no phase is named or when phases are what the answer is split by.", {
      EARLY_PHASE1: { what: "Early phase 1 (formerly phase 0).", examples: ["early phase 1 trials", "phase 0"] },
      PHASE1: { what: "Phase 1.", examples: ["phase 1 trials", "phase I"] },
      PHASE2: { what: "Phase 2.", examples: ["phase 2 trials", "phase II"] },
      PHASE3: { what: "Phase 3.", examples: ["phase 3 trials", "phase III"] },
      PHASE4: { what: "Phase 4 (after approval).", examples: ["phase 4 trials", "phase IV", "post-marketing"] },
      NA: { what: "Not applicable: trials without a phase, such as device or behavioural studies.", examples: ["trials with no phase", "phase not applicable"] },
      none: { what: "No single phase is named, or phases are the attribute being compared or split.", examples: ["How are melanoma trials distributed across phases?", "Compare phases for pembrolizumab vs nivolumab", "How many lupus trials are recruiting?"] },
    }),
  };
}

export type InterpretationQuestions = ReturnType<typeof interpretationQuestions>;
export type InterpretationAnswers = AnswersFor<InterpretationQuestions>;
