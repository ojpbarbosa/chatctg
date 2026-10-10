import type { Granularity } from "@chatctg/contracts";
import type { Study } from "@chatctg/ctgov";
import { timeKey } from "../dimensions";
import type { Bucket, Bucketized } from "./buckets";

/** The most years a per-year count asks the registry for; older years are cut, with a warning. */
export const MAX_YEARS = 40;

/** The years from `from` to `to`, keeping the latest `max`; `cutBefore` is the first year kept when older ones were cut. */
export function yearRange(from: number, to: number, max = MAX_YEARS): { years: number[]; cutBefore: number | null } {
  if (to < from) return { years: [], cutBefore: null };
  const first = to - from + 1 > max ? to - max + 1 : from;
  return { years: Array.from({ length: to - first + 1 }, (_, i) => first + i), cutBefore: first > from ? first : null };
}

/** An arm's Essie expression narrowed to the trials that started in one calendar year. */
export function withinYear(advanced: string | undefined, year: number): string {
  const clause = `AREA[StartDate]RANGE[${year}-01-01,${year}-12-31]`;
  return advanced ? `${advanced} AND ${clause}` : clause;
}

/** One year of a per-year count: the registry's exact total and the most recently started studies read for citations. */
export interface YearCount { year: number; total: number; studies: Study[] }

/** One bucket per year, valued at the registry's exact count, with empty years at either end trimmed and inner gaps kept as zeros. */
export function yearBuckets(counts: YearCount[]): Bucketized {
  const sorted = [...counts].sort((a, b) => a.year - b.year);
  const nonEmpty = sorted.flatMap((c, i) => (c.total > 0 ? [i] : []));
  const kept = nonEmpty.length ? sorted.slice(nonEmpty[0], nonEmpty[nonEmpty.length - 1]! + 1) : [];
  const buckets: Bucket[] = kept.map((c) => ({ key: String(c.year), label: String(c.year), series: null, value: c.total, count: c.total, studies: c.studies }));
  return { buckets, order: buckets.map((b) => b.key), seriesValues: [], omitted: 0, withoutValue: 0, missing: { enrollment: 0, dimension: 0, secondary: 0 }, multiValued: false };
}

/**
 * The period of the oldest dated study a capped fetch read. A fetch sorted by start date descending holds every trial that started
 * after it, so later periods are complete and this one may not be.
 */
export function boundaryPeriod(studies: Study[], g: Granularity): string | null {
  let oldest: string | null = null;
  for (const s of studies) { const k = timeKey(s, g); if (k !== null && (oldest === null || k < oldest)) oldest = k; }
  return oldest;
}

/** Drops the periods at or before the boundary. Null when that drops nothing, or everything (an empty chart says less than a partial one). */
export function trimThrough(r: Bucketized, boundary: string): { result: Bucketized; from: string } | null {
  const order = r.order.filter((k) => k > boundary);
  if (!order.length || order.length === r.order.length) return null;
  return { result: { ...r, order, buckets: r.buckets.filter((b) => b.key > boundary) }, from: order[0]! };
}
