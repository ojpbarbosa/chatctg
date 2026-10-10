import type { Study } from "@chatctg/ctgov";
import { mostRecent } from "../cite";

/** A timeline's trials: the `limit` most recently started that have a start date to draw from, and how many had none. */
export function timelineRows(studies: Study[], limit: number): { studies: Study[]; withoutValue: number } {
  const dated = studies.filter((s) => s.start_date !== null);
  return { studies: mostRecent(dated, limit), withoutValue: studies.length - dated.length };
}
