import { z } from "zod";
import { CHART_TYPES } from "./enums";
import { Interpretation } from "./meta";

/**
 * The `judged` stream event: the judge's answers as the planner applies them before the names in the question are read, sent as soon
 * as the judge answers. `chart.provisional` is the chart the planner would draw from them; the `interpretation` event confirms it.
 */
export const Judged = z.object({
  intent: Interpretation.shape.intent.pick({ value: true, p: true }),
  dimension: Interpretation.shape.dimension,
  secondary_dimension: Interpretation.shape.secondary_dimension,
  chart: z.object({ chosen: z.enum(CHART_TYPES), provisional: z.enum(CHART_TYPES) }),
  chart_named: z.boolean(),
  recruiting_only: z.boolean(),
  phase_filter: Interpretation.shape.phase_filter,
  jev_ms: z.number(),
});
export type Judged = z.infer<typeof Judged>;
