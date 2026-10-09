import { describe, expect, it } from "vitest";
import { scatterPoints } from "./points";
import { tableRows } from "./rows";
import { SAMPLE } from "../test-studies";

describe("scatterPoints", () => {
  it("one point per dated, sized study, most recent first, capped", () => {
    const r = scatterPoints(SAMPLE, null, 5);
    expect(r.points).toHaveLength(5); expect(r.dropped).toBe(5); expect(r.withoutValue).toBe(2);   // NCT03 no enrollment, NCT04 no date
    expect(r.points[0]).toMatchObject({ nct_id: "NCT00000012", start_date: "2024-06-06", enrollment: 900, phase: "PHASE3", series: null });
  });
  it("uses the first phase or NA", () => {
    expect(scatterPoints(SAMPLE, "arm").points.find((p) => p.nct_id === "NCT00000002")?.phase).toBe("PHASE1");
    expect(scatterPoints(SAMPLE, "arm").points.find((p) => p.nct_id === "NCT00000008")?.phase).toBe("NA");
  });
});

describe("tableRows", () => {
  it("takes the most recent N", () => {
    expect(tableRows(SAMPLE, 3).map((s) => s.nct_id)).toEqual(["NCT00000012", "NCT00000011", "NCT00000010"]);
  });
});
