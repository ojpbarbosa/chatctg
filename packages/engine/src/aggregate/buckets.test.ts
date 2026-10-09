import { describe, expect, it } from "vitest";
import { bucketize, mergeArms, metricValue } from "./buckets";
import { SAMPLE } from "../test-studies";

const byKey = (r: ReturnType<typeof bucketize>, key: string, series: string | null = null) => r.buckets.find((b) => b.key === key && b.series === series);

describe("bucketize", () => {
  it("counts a study once per phase and orders phases", () => {
    const r = bucketize(SAMPLE, { dimension: "phase", metric: "trial_count" });
    expect(r.order).toEqual(["EARLY_PHASE1", "PHASE1", "PHASE2", "PHASE3", "NA"]);
    expect(byKey(r, "PHASE1")?.value).toBe(2);   // NCT02 (1/2) and NCT07
    expect(byKey(r, "PHASE2")?.value).toBe(4);   // NCT02, NCT03, NCT06, NCT10
    expect(byKey(r, "PHASE3")?.value).toBe(4);
    expect(r.multiValued).toBe(true); expect(r.withoutValue).toBe(1);   // NCT04 has no phase
    expect(r.missing).toEqual({ enrollment: 0, dimension: 1, secondary: 0 });
  });
  it("gap-fills years and trims the ends", () => {
    const r = bucketize(SAMPLE.filter((s) => s.start_year !== 2020 && s.start_year !== 2021), { dimension: "start_year", metric: "trial_count", granularity: "year" });
    expect(r.order).toEqual(["2018", "2019", "2020", "2021", "2022", "2023", "2024"]);
    expect(byKey(r, "2020")?.value).toBe(0); expect(byKey(r, "2020")?.studies).toEqual([]);
    expect(r.withoutValue).toBe(1);
  });
  it("quarters", () => {
    const r = bucketize(SAMPLE.filter((s) => s.start_year === 2019), { dimension: "start_year", metric: "trial_count", granularity: "quarter" });
    expect(r.order).toEqual(["2019-Q1", "2019-Q2"]);
  });
  it("ranks an open dimension and counts the omitted", () => {
    const r = bucketize(SAMPLE, { dimension: "sponsor", metric: "trial_count", limit: 2 });
    expect(r.order).toEqual(["Acme", "Merck"]); expect(r.omitted).toBe(3);   // Acme 5, Merck 4
  });
  it("splits by a secondary dimension with zero-filled cells", () => {
    const r = bucketize(SAMPLE, { dimension: "phase", secondary: "sponsor_class", metric: "trial_count" });
    expect(r.seriesValues).toEqual(["INDUSTRY", "NIH", "OTHER"]);
    expect(byKey(r, "PHASE3", "NIH")?.value).toBe(0);
    expect(byKey(r, "PHASE2", "NIH")?.value).toBe(1);
    const t = bucketize(SAMPLE, { dimension: "sponsor_class", secondary: "phase", metric: "trial_count" });
    expect(t.missing).toEqual({ enrollment: 0, dimension: 0, secondary: 1 });   // NCT04 has a class but no phase
  });
  it("sums and medians enrollment, skipping studies without it", () => {
    const sum = bucketize(SAMPLE, { dimension: "sponsor_class", metric: "enrollment_total" });
    expect(byKey(sum, "NIH")).toBeUndefined(); expect(sum.withoutValue).toBe(1); expect(sum.missing).toEqual({ enrollment: 1, dimension: 0, secondary: 0 });
    expect(byKey(sum, "OTHER")?.value).toBe(8);
    expect(metricValue(SAMPLE.filter((s) => s.enrollment !== null), "enrollment_median")).toBe(80);
  });
  it("bins enrollment", () => {
    const r = bucketize(SAMPLE, { dimension: "enrollment", metric: "trial_count" });
    expect(r.order).toEqual(["1–50", "51–100", "201–500", "501–1000", "1001+"]);
  });
});

describe("mergeArms", () => {
  it("labels each arm as a series and unions the keys in order", () => {
    const a = bucketize(SAMPLE.filter((s) => s.lead_sponsor.name === "Merck"), { dimension: "phase", metric: "trial_count" });
    const b = bucketize(SAMPLE.filter((s) => s.lead_sponsor.name === "Acme"), { dimension: "phase", metric: "trial_count" });
    const m = mergeArms([{ label: "Merck", result: a }, { label: "Acme", result: b }], { dimension: "phase", metric: "trial_count" });
    expect(m.seriesValues).toEqual(["Merck", "Acme"]);
    expect(m.order).toEqual(["PHASE1", "PHASE2", "PHASE3", "NA"]);
    expect(m.buckets.find((x) => x.key === "PHASE3" && x.series === "Acme")?.value).toBe(0);
    expect(m.buckets.find((x) => x.key === "PHASE3" && x.series === "Merck")?.value).toBe(3);
  });
});
