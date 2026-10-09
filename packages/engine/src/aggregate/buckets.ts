import type { Dimension, Granularity, Metric } from "@cheiron/contracts";
import type { Study } from "@cheiron/ctgov";
import { bucketLabel, fixedOrder, isMultiValued, valuesOf } from "../dimensions";

export interface Bucket { key: string; label: string; series: string | null; value: number; studies: Study[] }
/** Studies left out of every bucket, by the first value they lack: an enrollment (when the metric needs one), the dimension, the secondary dimension. */
export interface Missing { enrollment: number; dimension: number; secondary: number }
export interface Bucketized { buckets: Bucket[]; order: string[]; seriesValues: string[]; omitted: number; withoutValue: number; missing: Missing; multiValued: boolean }
export interface BucketizeOptions { dimension: Dimension; secondary?: Dimension | null; metric: Metric; granularity?: Granularity | null; limit?: number | null }

const MAX_SERIES = 8;

export function metricValue(studies: Study[], metric: Metric): number {
  if (metric === "trial_count") return studies.length;
  const xs = studies.map((s) => s.enrollment).filter((n): n is number => n !== null).sort((a, b) => a - b);
  if (!xs.length) return 0;
  if (metric === "enrollment_total") return xs.reduce((a, b) => a + b, 0);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

/** The next period key, for gap filling. */
function nextKey(key: string, g: Granularity): string {
  if (g === "year") return String(Number(key) + 1);
  if (g === "quarter") { const [y, q] = key.split("-Q").map(Number) as [number, number]; return q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`; }
  const [y, m] = key.split("-").map(Number) as [number, number]; return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function fillRange(keys: string[], g: Granularity): string[] {
  if (!keys.length) return [];
  const sorted = [...keys].sort();
  const out: string[] = []; let k = sorted[0]!; const last = sorted[sorted.length - 1]!;
  for (let guard = 0; guard < 2000 && k <= last; guard++) { out.push(k); if (k === last) break; k = nextKey(k, g); }
  return out;
}

/** Primary keys in display order, and how many were dropped by the limit. */
function orderKeys(dimension: Dimension, granularity: Granularity | null, totals: Map<string, number>, limit: number | null): { order: string[]; omitted: number } {
  const present = [...totals.keys()];
  if (dimension === "start_year") return { order: fillRange(present, granularity ?? "year"), omitted: 0 };
  const fixed = fixedOrder(dimension);
  if (fixed) return { order: fixed.filter((k) => totals.has(k)), omitted: 0 };
  const ranked = present.sort((a, b) => (totals.get(b)! - totals.get(a)!) || a.localeCompare(b));
  if (limit !== null && limit !== undefined && ranked.length > limit) return { order: ranked.slice(0, limit), omitted: ranked.length - limit };
  return { order: ranked, omitted: 0 };
}

function orderSeries(secondary: Dimension, totals: Map<string, number>): { values: string[]; omitted: number } {
  const fixed = fixedOrder(secondary);
  if (fixed) return { values: fixed.filter((k) => totals.has(k)), omitted: 0 };
  const ranked = [...totals.keys()].sort((a, b) => (totals.get(b)! - totals.get(a)!) || a.localeCompare(b));
  return { values: ranked.slice(0, MAX_SERIES), omitted: Math.max(0, ranked.length - MAX_SERIES) };
}

const needsEnrollment = (m: Metric) => m !== "trial_count";

export function bucketize(studies: Study[], o: BucketizeOptions): Bucketized {
  const groups = new Map<string, Map<string | null, Study[]>>();
  const missing: Missing = { enrollment: 0, dimension: 0, secondary: 0 }; let anyMulti = false;
  for (const s of studies) {
    if (needsEnrollment(o.metric) && s.enrollment === null) { missing.enrollment++; continue; }
    const keys = valuesOf(s, o.dimension, o.granularity ?? "year");
    if (!keys.length) { missing.dimension++; continue; }
    if (keys.length > 1) anyMulti = true;
    const seriesKeys: (string | null)[] = o.secondary ? valuesOf(s, o.secondary) : [null];
    if (o.secondary && !seriesKeys.length) { missing.secondary++; continue; }
    for (const k of keys) {
      const row = groups.get(k) ?? new Map<string | null, Study[]>();
      for (const sk of seriesKeys) row.set(sk, [...(row.get(sk) ?? []), s]);
      groups.set(k, row);
    }
  }
  const totals = new Map<string, number>();
  for (const [k, row] of groups) totals.set(k, metricValue([...new Set([...row.values()].flat())], o.metric));
  const { order, omitted } = orderKeys(o.dimension, o.granularity ?? null, totals, o.limit ?? null);

  let seriesValues: string[] = []; let seriesOmitted = 0;
  if (o.secondary) {
    const st = new Map<string, number>();
    for (const row of groups.values()) for (const [sk, ss] of row) if (sk !== null) st.set(sk, (st.get(sk) ?? 0) + metricValue(ss, o.metric));
    ({ values: seriesValues, omitted: seriesOmitted } = orderSeries(o.secondary, st));
  }
  const buckets: Bucket[] = [];
  for (const k of order) {
    const row = groups.get(k);
    const label = bucketLabel(o.dimension, k);
    if (!o.secondary) { const ss = row?.get(null) ?? []; buckets.push({ key: k, label, series: null, value: metricValue(ss, o.metric), studies: ss }); continue; }
    for (const sv of seriesValues) { const ss = row?.get(sv) ?? []; buckets.push({ key: k, label, series: sv, value: metricValue(ss, o.metric), studies: ss }); }
  }
  return { buckets, order, seriesValues, omitted: omitted + seriesOmitted, withoutValue: missing.enrollment + missing.dimension + missing.secondary, missing, multiValued: isMultiValued(o.dimension) && anyMulti };
}

/** Comparison arms: each arm's buckets become one series, keys unioned and reordered. */
export function mergeArms(parts: { label: string; result: Bucketized }[], o: BucketizeOptions): Bucketized {
  const totals = new Map<string, number>(); const cell = new Map<string, Bucket>();
  for (const { label, result } of parts) for (const b of result.buckets) {
    if (b.series !== null) continue;
    cell.set(`${b.key}\u0000${label}`, { ...b, series: label });
    totals.set(b.key, (totals.get(b.key) ?? 0) + b.value);
  }
  const { order, omitted } = orderKeys(o.dimension, o.granularity ?? null, totals, o.limit ?? null);
  const seriesValues = parts.map((p) => p.label);
  const buckets: Bucket[] = [];
  for (const k of order) for (const sv of seriesValues) buckets.push(cell.get(`${k}\u0000${sv}`) ?? { key: k, label: bucketLabel(o.dimension, k), series: sv, value: 0, studies: [] });
  const sum = (k: keyof Missing) => parts.reduce((n, p) => n + p.result.missing[k], 0);
  const missing: Missing = { enrollment: sum("enrollment"), dimension: sum("dimension"), secondary: sum("secondary") };
  return { buckets, order, seriesValues, omitted, withoutValue: missing.enrollment + missing.dimension + missing.secondary, missing, multiValued: parts.some((p) => p.result.multiValued) };
}
