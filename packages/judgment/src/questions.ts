import type { ChoiceQuestion, Instructions, JsonValue, NoulQuestion } from "./types";

export function noul(instructions: Instructions, criteria?: { true: string; false: string }): NoulQuestion {
  return { type: "noul", instructions, ...(criteria ? { criteria } : {}) };
}

/** One of a closed list. Include a no-match option unless the options cover every case. */
export function choice<O extends string>(instructions: Instructions, criteria: Record<O, string | { [key: string]: JsonValue } | null>): ChoiceQuestion<O> {
  const n = Object.keys(criteria).length;
  if (n < 2 || n > 255) throw new Error(`a choice takes 2 to 255 options, got ${n}`);
  return { type: "choice", instructions, criteria };
}
