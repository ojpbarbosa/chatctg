import type { Citation, Dimension } from "@chatctg/contracts";
import type { Study } from "@chatctg/ctgov";
import { citationExcerpt, citationField, studyLabel } from "./dimensions";

/** Deterministic: start date descending, undated last, NCT id as the tie-break. */
export function mostRecent(studies: Study[], k: number): Study[] {
  if (k <= 0) return [];
  return [...studies]
    .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? "") || a.nct_id.localeCompare(b.nct_id))
    .slice(0, k);
}

export function citeBucket(studies: Study[], dimension: Dimension, key: string, k: number): Citation[] {
  const field = citationField(dimension);
  return mostRecent(studies, k).map((s) => ({ nct_id: s.nct_id, title: studyLabel(s), field, excerpt: citationExcerpt(s, dimension, key) }));
}

export function citeSelf(s: Study): Citation {
  return { nct_id: s.nct_id, title: studyLabel(s), field: "protocolSection.identificationModule.nctId", excerpt: s.nct_id };
}

const tail = (path: string) => path.split(".").slice(-2).join(".");

export function citeEdge(studies: Study[], a: { field: string; value: string }, b: { field: string; value: string }, k: number): Citation[] {
  return mostRecent(studies, k).map((s) => ({
    nct_id: s.nct_id, title: studyLabel(s), field: `${a.field} | ${b.field}`,
    excerpt: `${tail(a.field)} "${a.value}"; ${tail(b.field)} "${b.value}"`,
  }));
}
