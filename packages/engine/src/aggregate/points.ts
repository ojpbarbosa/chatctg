import type { Study } from "@cheiron/ctgov";
import { mostRecent } from "../cite";

export interface Point { study: Study; nct_id: string; title: string; start_date: string; enrollment: number; phase: string; series: string | null }

export function scatterPoints(studies: Study[], series: string | null, cap = 500): { points: Point[]; dropped: number; withoutValue: number } {
  const usable = studies.filter((s) => s.start_date !== null && s.enrollment !== null);
  const kept = mostRecent(usable, cap);
  return {
    points: kept.map((s) => ({ study: s, nct_id: s.nct_id, title: s.title || s.nct_id, start_date: s.start_date!, enrollment: s.enrollment!, phase: s.phases[0] ?? "NA", series })),
    dropped: usable.length - kept.length,
    withoutValue: studies.length - usable.length,
  };
}
