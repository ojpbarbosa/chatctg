import { describe, expect, it } from "vitest";
import { citeBucket, citeCell, citeEdge, citeSelf, mostRecent } from "./cite";
import { SAMPLE } from "./test-studies";

describe("citations", () => {
  it("picks the most recently started, nulls last", () => {
    expect(mostRecent(SAMPLE, 3).map((s) => s.nct_id)).toEqual(["NCT00000012", "NCT00000011", "NCT00000010"]);
    expect(mostRecent(SAMPLE, 20).at(-1)?.nct_id).toBe("NCT00000004");
  });
  it("cites the field and exact value for a bucket", () => {
    const c = citeBucket(SAMPLE.filter((s) => s.phases.includes("PHASE3")), "phase", "PHASE3", 2);
    expect(c).toEqual([
      { nct_id: "NCT00000012", title: "Study NCT00000012", field: "protocolSection.designModule.phases", excerpt: "PHASE3" },
      { nct_id: "NCT00000009", title: "Study NCT00000009", field: "protocolSection.designModule.phases", excerpt: "PHASE3" },
    ]);
  });
  it("cites a study for itself", () => {
    expect(citeSelf(SAMPLE[0]!)).toEqual({ nct_id: "NCT00000001", title: "Study NCT00000001", field: "protocolSection.identificationModule.nctId", excerpt: "NCT00000001" });
  });
  it("cites both ends of an edge", () => {
    const c = citeEdge([SAMPLE[0]!], { field: "protocolSection.sponsorCollaboratorsModule.leadSponsor.name", value: "Merck" }, { field: "derivedSection.interventionBrowseModule.meshes[].term", value: "lenvatinib" }, 5);
    expect(c[0]).toMatchObject({ nct_id: "NCT00000001", excerpt: 'leadSponsor.name "Merck"; meshes[].term "lenvatinib"' });
    expect(c[0]!.field).toBe("protocolSection.sponsorCollaboratorsModule.leadSponsor.name | derivedSection.interventionBrowseModule.meshes[].term");
  });
  it("cites both values that put a study in a grid cell", () => {
    const c = citeCell(SAMPLE.filter((s) => s.phases.includes("PHASE3")), { dimension: "phase", key: "PHASE3" }, { dimension: "sponsor_class", key: "INDUSTRY" }, 1);
    expect(c).toEqual([{
      nct_id: "NCT00000012", title: "Study NCT00000012",
      field: "protocolSection.designModule.phases | protocolSection.sponsorCollaboratorsModule.leadSponsor.class",
      excerpt: 'designModule.phases "PHASE3"; leadSponsor.class "INDUSTRY"',
    }]);
    // A drug or condition cites the path that holds the study's value: the MeSH term when mapped, else the name as registered.
    const named = citeCell([SAMPLE[5]!], { dimension: "drug", key: "pembrolizumab" }, { dimension: "phase", key: "PHASE2" }, 5);
    expect(named[0]).toMatchObject({ field: "protocolSection.armsInterventionsModule.interventions[].name | protocolSection.designModule.phases", excerpt: 'interventions[].name "pembrolizumab"; designModule.phases "PHASE2"' });
    const mesh = citeCell([SAMPLE[0]!], { dimension: "condition", key: "Melanoma" }, { dimension: "phase", key: "PHASE3" }, 5);
    expect(mesh[0]!.field).toBe("derivedSection.conditionBrowseModule.meshes[].term | protocolSection.designModule.phases");
    expect(citeCell(SAMPLE, { dimension: "phase", key: "PHASE3" }, { dimension: "sponsor_class", key: "INDUSTRY" }, 0)).toEqual([]);
  });
  it("respects k = 0", () => expect(citeBucket(SAMPLE, "phase", "PHASE2", 0)).toEqual([]));
});
