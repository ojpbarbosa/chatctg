import { z } from "zod";
import { CHART_TYPES, DIMENSIONS, EDGE_KINDS, GRANULARITIES, INTENTS, METRICS } from "./enums";

const judged = <T extends readonly [string, ...string[]]>(values: T) => z.object({ value: z.enum(values), p: z.number().min(0).max(1) });

export const Interpretation = z.object({
  intent: z.object({ value: z.enum(INTENTS), p: z.number(), confidence: z.number(), alternatives: z.array(judged(INTENTS)) }),
  dimension: judged(DIMENSIONS).nullable(),
  secondary_dimension: judged(DIMENSIONS).nullable(),
  chart: z.object({ chosen: z.enum(CHART_TYPES), applied: z.enum(CHART_TYPES).nullable(), explicit: z.boolean(), reason: z.string().nullable() }),
  metric: z.enum(METRICS),
  granularity: z.enum(GRANULARITIES).nullable(),
  edge_kind: z.enum(EDGE_KINDS).nullable(),
  entities: z.object({ drugs: z.array(z.string()), conditions: z.array(z.string()), sponsors: z.array(z.string()), countries: z.array(z.string()) }),
  time_window: z.object({ start_year: z.number().nullable(), end_year: z.number().nullable() }),
  limit: z.number().nullable(),
  recruiting_only: z.boolean(),
  combination: z.boolean().nullable(),
  provided_fields: z.array(z.string()),
  question_set: z.object({ id: z.string(), version: z.number().int() }),
  models: z.object({ judge: z.string(), extractor: z.string(), titler: z.string() }),
});
export type Interpretation = z.infer<typeof Interpretation>;

export const Meta = z.object({
  query: z.string(),
  interpretation: Interpretation,
  arms: z.array(z.object({ label: z.string(), filters: z.record(z.string(), z.string()) })),
  source: z.object({
    name: z.literal("clinicaltrials.gov"),
    api_version: z.string(),
    data_timestamp: z.string(),
    requests: z.array(z.object({ url: z.string(), total_count: z.number().int(), fetched: z.number().int() })),
  }),
  coverage: z.object({
    total_count: z.number().int(), fetched_count: z.number().int(), truncated: z.boolean(),
    sorted_by: z.literal("StartDate:desc"), studies_without_value: z.number().int(), omitted_categories: z.number().int(),
  }),
  units: z.object({ y: z.enum(["trials", "participants"]) }),
  granularity: z.enum(GRANULARITIES).nullable(),
  timing: z.object({ jev_ms: z.number(), extract_ms: z.number(), fetch_ms: z.number(), title_ms: z.number(), aggregate_ms: z.number(), total_ms: z.number() }),
  notes: z.array(z.string()),
  warnings: z.array(z.string()),
  version: z.string(),
});
export type Meta = z.infer<typeof Meta>;
