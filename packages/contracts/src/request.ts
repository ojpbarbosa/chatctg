import { z } from "zod";
import { CHART_TYPES, INTENTS, OVERALL_STATUSES, PHASES } from "./enums";

const term = z.string().trim().min(1).max(200);
const oneOrMany = z.union([term, z.array(term).min(1).max(10)]);
const year = z.number().int().min(1900).max(2100);

/**
 * The question plus optional fields that pin down what it would otherwise leave to interpretation. Without them, the closed fields
 * (intent, chart, phase, recruitment) are answered by the judge, which is fast, and the free-text names (drugs, conditions, sponsors,
 * countries, years) by the extractor. A faster extractor would be the judge selecting spans from the question's own n-grams
 * (TypeSafe's pre-parsed value extraction pattern), listed in the README's next steps.
 */
export const QueryRequest = z
  .object({
    query: z.string().trim().min(1).max(500),
    drug_name: oneOrMany.optional(),
    condition: oneOrMany.optional(),
    sponsor: oneOrMany.optional(),
    country: oneOrMany.optional(),
    trial_phase: z.enum(PHASES).optional(),
    /** Restricts to one recruitment status; overrides the recruiting-only judgment. */
    trial_status: z.enum(OVERALL_STATUSES).optional(),
    start_year: year.optional(),
    end_year: year.optional(),
    /** Replaces the judge's intent; what a "Did you mean" chip sends. */
    intent: z.enum(INTENTS).optional(),
    chart: z.enum(CHART_TYPES).optional(),
    max_studies: z.number().int().min(100).max(10_000).default(3000),
    citations_per_point: z.number().int().min(0).max(25).default(5),
  })
  .strict()
  .refine((r) => r.start_year === undefined || r.end_year === undefined || r.end_year >= r.start_year, {
    message: "end_year must be greater than or equal to start_year",
    path: ["end_year"],
  });

export type QueryRequest = z.output<typeof QueryRequest>;
export type QueryRequestInput = z.input<typeof QueryRequest>;

/** The entity fields accept one value or several; the engine always wants a list. */
export const asList = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
