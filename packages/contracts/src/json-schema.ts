import { z } from "zod";
import { QueryRequest } from "./request";
import { QueryResponse } from "./response";

/** The same schemas, as JSON Schema, for GET /schema and the README. */
export function jsonSchemas(): { request: Record<string, unknown>; response: Record<string, unknown> } {
  return {
    request: z.toJSONSchema(QueryRequest, { io: "input" }) as Record<string, unknown>,
    response: z.toJSONSchema(QueryResponse) as Record<string, unknown>,
  };
}
