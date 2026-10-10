import { describe, expect, it } from "vitest";
import { timelineRows } from "./spans";
import { SAMPLE } from "../test-studies";

describe("timelineRows", () => {
  it("keeps the N most recently started trials that have a start date, and counts the undated ones", () => {
    const r = timelineRows(SAMPLE, 3);
    expect(r.studies.map((s) => s.nct_id)).toEqual(["NCT00000012", "NCT00000011", "NCT00000010"]);
    expect(r.withoutValue).toBe(1);   // NCT00000004 has no start date
    expect(timelineRows(SAMPLE, 25).studies).toHaveLength(11);
    expect(timelineRows(SAMPLE.filter((s) => s.start_date !== null), 25).withoutValue).toBe(0);
  });
});
