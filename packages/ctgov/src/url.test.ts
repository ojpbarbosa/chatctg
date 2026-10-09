import { describe, expect, it } from "vitest";
import { buildStudiesUrl, essieAdvanced, essieTerms, STUDY_FIELDS } from "./url";

describe("essie", () => {
  it("quotes terms and joins them", () => {
    expect(essieTerms(["pembrolizumab"], "OR")).toBe('"pembrolizumab"');
    expect(essieTerms(["non-small cell lung cancer", "melanoma"], "OR")).toBe('"non-small cell lung cancer" OR "melanoma"');
    expect(essieTerms(["a", "b"], "AND")).toBe('"a" AND "b"');
  });
  it("strips quotes inside a term", () => {
    expect(essieTerms(['say "hi"'], "OR")).toBe('"say hi"');
  });
  it("builds the advanced filter", () => {
    expect(essieAdvanced({})).toBeUndefined();
    expect(essieAdvanced({ phase: "PHASE3" })).toBe("AREA[Phase]PHASE3");
    expect(essieAdvanced({ startYear: 2015 })).toBe("AREA[StartDate]RANGE[2015-01-01,MAX]");
    expect(essieAdvanced({ endYear: 2020 })).toBe("AREA[StartDate]RANGE[MIN,2020-12-31]");
    expect(essieAdvanced({ phase: "PHASE2", startYear: 2015, endYear: 2020 })).toBe("AREA[Phase]PHASE2 AND AREA[StartDate]RANGE[2015-01-01,2020-12-31]");
  });
});

describe("buildStudiesUrl", () => {
  it("has 19 fields", () => expect(STUDY_FIELDS).toHaveLength(19));
  it("encodes every parameter and the field list", () => {
    const url = new URL(buildStudiesUrl({ intr: '"pembrolizumab"', cond: '"melanoma"', overallStatus: "RECRUITING", advanced: "AREA[Phase]PHASE3", pageSize: 1000, countTotal: true, sort: "StartDate:desc" }));
    expect(url.origin + url.pathname).toBe("https://clinicaltrials.gov/api/v2/studies");
    expect(url.searchParams.get("query.intr")).toBe('"pembrolizumab"');
    expect(url.searchParams.get("query.cond")).toBe('"melanoma"');
    expect(url.searchParams.get("filter.overallStatus")).toBe("RECRUITING");
    expect(url.searchParams.get("filter.advanced")).toBe("AREA[Phase]PHASE3");
    expect(url.searchParams.get("fields")).toBe(STUDY_FIELDS.join(","));
    expect(url.searchParams.get("pageSize")).toBe("1000");
    expect(url.searchParams.get("countTotal")).toBe("true");
    expect(url.searchParams.get("sort")).toBe("StartDate:desc");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.has("query.spons")).toBe(false);
  });
  it("carries the page token", () => {
    expect(new URL(buildStudiesUrl({ pageToken: "t" })).searchParams.get("pageToken")).toBe("t");
  });
});
