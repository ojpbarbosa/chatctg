import { describe, expect, it } from "vitest";
import { normalizeStudy, normalizePage } from "./study";

const raw = {
  protocolSection: {
    identificationModule: { nctId: "NCT02432963", briefTitle: "Vaccine Therapy and Pembrolizumab" },
    statusModule: { overallStatus: "ACTIVE_NOT_RECRUITING", startDateStruct: { date: "2016-06-14" }, primaryCompletionDateStruct: { date: "2017-12" } },
    sponsorCollaboratorsModule: { leadSponsor: { name: "City of Hope Medical Center", class: "OTHER" }, collaborators: [{ name: "National Cancer Institute (NCI)" }] },
    conditionsModule: { conditions: ["Melanoma", "Colon Carcinoma"] },
    designModule: { studyType: "INTERVENTIONAL", phases: ["PHASE1"], enrollmentInfo: { count: 11 } },
    armsInterventionsModule: { interventions: [{ type: "OTHER", name: "Laboratory Biomarker Analysis" }, { type: "BIOLOGICAL", name: "Pembrolizumab" }] },
    eligibilityModule: { sex: "ALL", stdAges: ["ADULT", "OLDER_ADULT"] },
    contactsLocationsModule: { locations: [{ country: "United States" }, { country: "United States" }, { country: "Canada" }] },
  },
  derivedSection: { conditionBrowseModule: { meshes: [{ term: "Melanoma" }] }, interventionBrowseModule: { meshes: [{ term: "pembrolizumab" }] } },
};

describe("normalizeStudy", () => {
  it("flattens the modules and dedupes countries", () => {
    expect(normalizeStudy(raw)).toEqual({
      nct_id: "NCT02432963", title: "Vaccine Therapy and Pembrolizumab", status: "ACTIVE_NOT_RECRUITING",
      phases: ["PHASE1"], start_date: "2016-06-14", start_year: 2016, primary_completion_date: "2017-12",
      lead_sponsor: { name: "City of Hope Medical Center", class: "OTHER" }, collaborators: ["National Cancer Institute (NCI)"],
      conditions: ["Melanoma", "Colon Carcinoma"], mesh_conditions: ["Melanoma"],
      interventions: [{ name: "Laboratory Biomarker Analysis", type: "OTHER" }, { name: "Pembrolizumab", type: "BIOLOGICAL" }],
      mesh_interventions: ["pembrolizumab"], countries: ["United States", "Canada"], enrollment: 11,
      study_type: "INTERVENTIONAL", sex: "ALL", std_ages: ["ADULT", "OLDER_ADULT"],
    });
  });
  it("tolerates missing modules", () => {
    const s = normalizeStudy({ protocolSection: { identificationModule: { nctId: "NCT00000001" } } });
    expect(s).toMatchObject({ nct_id: "NCT00000001", title: "", status: "UNKNOWN", phases: [], start_date: null, start_year: null, enrollment: null, countries: [], lead_sponsor: { name: "", class: "UNKNOWN" } });
  });
  it("returns null without an nctId", () => {
    expect(normalizeStudy({ protocolSection: {} })).toBeNull();
    expect(normalizeStudy("nope")).toBeNull();
  });
});

describe("normalizePage", () => {
  it("reads studies, totalCount and the next token", () => {
    const page = normalizePage({ totalCount: 5, studies: [raw], nextPageToken: "abc" });
    expect(page).toMatchObject({ totalCount: 5, nextPageToken: "abc" });
    expect(page?.studies).toHaveLength(1);
  });
  it("returns null for a non-page", () => {
    expect(normalizePage({ nope: 1 })).toBeNull();
  });
});
