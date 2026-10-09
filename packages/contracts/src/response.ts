import { z } from "zod";
import { Meta } from "./meta";
import { Visualization } from "./visualization";

export { Visualization } from "./visualization";

export const QueryResponse = z.object({ visualization: Visualization.nullable(), meta: Meta });
export type QueryResponse = z.infer<typeof QueryResponse>;

export const ERROR_CODES = ["invalid_request", "not_answerable", "upstream_failed", "timeout", "internal"] as const;
export const ErrorBody = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string(), details: z.unknown().optional() }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;
