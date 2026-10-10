import { describe, expect, it } from "vitest";
import { bucketLabel, citationExcerpt, citationField, conditionIdentity, drugIdentity, fixedOrder, isMultiValued, timeKey, valuesOf } from "./dimensions";
import { SAMPLE, study } from "./test-studies";

const byId = (id: string) => SAMPLE.find((s) => s.nct_id === id)!;

describe("identity sets", () => {
  it("prefers MeSH terms", () => expect(drugIdentity(byId("NCT00000001"))).toEqual(["pembrolizumab", "lenvatinib"]));
  it("falls back to drug/biological names, lowercased and deduped", () => expect(drugIdentity(byId("NCT00000006"))).toEqual(["pembrolizumab 200mg", "pembrolizumab", "placebo"]));
  it("dedupes case-insensitively", () => expect(drugIdentity(study({ nct_id: "NCT00000099", mesh_interventions: [], interventions: [{ name: "Aspirin", type: "DRUG" }, { name: "aspirin", type: "DRUG" }] }))).toEqual(["aspirin"]));
  it("conditions prefer MeSH", () => expect(conditionIdentity(byId("NCT00000005"))).toEqual(["Melanoma", "Lung Neoplasms"]));
});

describe("valuesOf", () => {
  it("phase is multi-valued", () => expect(valuesOf(byId("NCT00000002"), "phase")).toEqual(["PHASE1", "PHASE2"]));
  it("a study without phases has no phase value", () => expect(valuesOf(byId("NCT00000004"), "phase")).toEqual([]));
  it("time keys follow the granularity", () => {
    const s = byId("NCT00000005");
    expect(valuesOf(s, "start_year", "year")).toEqual(["2019"]);
    expect(valuesOf(s, "start_year", "quarter")).toEqual(["2019-Q2"]);
    expect(valuesOf(s, "start_year", "month")).toEqual(["2019-05"]);
    expect(timeKey(byId("NCT00000004"), "year")).toBeNull();
  });
  it("enrollment falls into a bin", () => {
    expect(valuesOf(byId("NCT00000001"), "enrollment")).toEqual(["201-500"]);
    expect(valuesOf(byId("NCT00000009"), "enrollment")).toEqual(["1001+"]);
    expect(valuesOf(byId("NCT00000003"), "enrollment")).toEqual([]);
  });
  it("country, sponsor, class, type, sex, age", () => {
    expect(valuesOf(byId("NCT00000001"), "country")).toEqual(["United States", "Germany"]);
    expect(valuesOf(byId("NCT00000001"), "sponsor")).toEqual(["Merck"]);
    expect(valuesOf(byId("NCT00000003"), "sponsor_class")).toEqual(["NIH"]);
    expect(valuesOf(byId("NCT00000001"), "intervention_type")).toEqual(["BIOLOGICAL", "DRUG"]);
    expect(valuesOf(byId("NCT00000010"), "sex")).toEqual(["FEMALE"]);
    expect(valuesOf(byId("NCT00000010"), "age_group")).toEqual(["CHILD", "ADULT"]);
    expect(valuesOf(byId("NCT00000001"), "none")).toEqual([]);
  });
});

describe("labels, order, citations", () => {
  it("knows which dimensions are multi-valued", () => {
    expect(isMultiValued("phase")).toBe(true); expect(isMultiValued("status")).toBe(false); expect(isMultiValued("country")).toBe(true);
  });
  it("orders closed sets and bins", () => {
    expect(fixedOrder("phase")).toEqual(["EARLY_PHASE1", "PHASE1", "PHASE2", "PHASE3", "PHASE4", "NA"]);
    expect(fixedOrder("enrollment")).toEqual(["1-50", "51-100", "101-200", "201-500", "501-1000", "1001+"]);
    expect(fixedOrder("sponsor")).toBeNull();
  });
  it("labels phases and classes", () => {
    expect(bucketLabel("phase", "PHASE3")).toBe("Phase 3"); expect(bucketLabel("phase", "NA")).toBe("Not applicable");
    expect(bucketLabel("sponsor_class", "OTHER_GOV")).toBe("Other government"); expect(bucketLabel("country", "Japan")).toBe("Japan");
  });
  it("cites the field and the exact value", () => {
    expect(citationField("phase")).toBe("protocolSection.designModule.phases");
    expect(citationExcerpt(byId("NCT00000002"), "phase", "PHASE2")).toBe("PHASE2");
    expect(citationField("start_year")).toBe("protocolSection.statusModule.startDateStruct.date");
    expect(citationExcerpt(byId("NCT00000005"), "start_year", "2019")).toBe("2019-05-20");
    expect(citationExcerpt(byId("NCT00000001"), "country", "Germany")).toBe("Germany");
    expect(citationExcerpt(byId("NCT00000001"), "enrollment", "201-500")).toBe("500");
    expect(citationExcerpt(byId("NCT00000006"), "drug", "placebo")).toBe("Placebo");
  });
});
