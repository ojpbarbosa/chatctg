import { describe, expect, it } from "vitest";
import { iso3, iso3ToNumeric } from "./countries";

describe("iso3", () => {
  it("maps registry spellings", () => {
    expect(iso3("United States")).toBe("USA");
    expect(iso3("Korea, Republic of")).toBe("KOR");
    expect(iso3("Russian Federation")).toBe("RUS");
    expect(iso3("Taiwan")).toBe("TWN");
    expect(iso3("Türkiye")).toBe("TUR");
    expect(iso3("Iran, Islamic Republic of")).toBe("IRN");
    expect(iso3("Czechia")).toBe("CZE");
    expect(iso3("Viet Nam")).toBe("VNM");
  });
  it("returns null for the unknown", () => {
    expect(iso3("Narnia")).toBeNull();
  });
  it("gives the numeric code world-atlas uses", () => {
    expect(iso3ToNumeric("USA")).toBe("840");
    expect(iso3ToNumeric("XXX")).toBeNull();
  });
});
