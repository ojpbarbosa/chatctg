import { describe, expect, it } from "vitest";
import { study } from "../test-studies";
import { bucketize } from "./buckets";
import { boundaryPeriod, trimThrough, withinYear, yearBuckets, yearRange } from "./periods";

describe("periods", () => {
  it("covers the years asked for, keeping the latest 40", () => {
    expect(yearRange(2020, 2023)).toEqual({ years: [2020, 2021, 2022, 2023], cutBefore: null });
    const long = yearRange(1950, 2028);
    expect(long.years).toHaveLength(40); expect(long.years[0]).toBe(1989); expect(long.cutBefore).toBe(1989);
    expect(yearRange(2030, 2028)).toEqual({ years: [], cutBefore: null });
  });
  it("narrows an arm's expression to one year", () => {
    expect(withinYear(undefined, 2019)).toBe("AREA[StartDate]RANGE[2019-01-01,2019-12-31]");
    expect(withinYear("AREA[Phase]PHASE3", 2019)).toBe("AREA[Phase]PHASE3 AND AREA[StartDate]RANGE[2019-01-01,2019-12-31]");
  });
  it("makes one bucket per year from exact counts, trimming empty ends and keeping inner zeros", () => {
    const s = study({ nct_id: "NCT1", start_date: "2020-02-02" });
    const r = yearBuckets([{ year: 2022, total: 0, studies: [] }, { year: 2019, total: 0, studies: [] }, { year: 2020, total: 812, studies: [s] }, { year: 2021, total: 0, studies: [] }, { year: 2023, total: 5, studies: [] }, { year: 2024, total: 0, studies: [] }]);
    expect(r.order).toEqual(["2020", "2021", "2022", "2023"]);
    expect(r.buckets.map((b) => [b.key, b.value, b.count, b.studies.length])).toEqual([["2020", 812, 812, 1], ["2021", 0, 0, 0], ["2022", 0, 0, 0], ["2023", 5, 5, 0]]);
    expect(r).toMatchObject({ seriesValues: [], omitted: 0, withoutValue: 0, multiValued: false });
    expect(yearBuckets([{ year: 2020, total: 0, studies: [] }]).buckets).toEqual([]);
  });
  it("finds the period of the oldest dated study and drops it and everything before", () => {
    const studies = [study({ nct_id: "a", start_date: "2021-07-01" }), study({ nct_id: "b", start_date: "2020-02-10" }), study({ nct_id: "c", start_date: null }), study({ nct_id: "d", start_date: "2022-11-30" })];
    expect(boundaryPeriod(studies, "year")).toBe("2020");
    expect(boundaryPeriod(studies, "quarter")).toBe("2020-Q1");
    expect(boundaryPeriod(studies, "month")).toBe("2020-02");
    expect(boundaryPeriod([], "year")).toBeNull();
    const r = bucketize(studies, { dimension: "start_year", metric: "trial_count", granularity: "year" });
    const cut = trimThrough(r, "2020");
    expect(cut?.from).toBe("2021"); expect(cut?.result.order).toEqual(["2021", "2022"]); expect(cut?.result.buckets.map((b) => b.key)).toEqual(["2021", "2022"]);
    expect(trimThrough(r, "2019")).toBeNull();   // nothing to drop
    expect(trimThrough(r, "2022")).toBeNull();   // everything would go
  });
});
