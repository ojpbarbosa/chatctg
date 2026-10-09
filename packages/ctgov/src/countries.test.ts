import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { iso3, iso3ToNumeric } from "./countries";
import { normalizePage } from "./study";

const FIXTURES = ["melanoma-p1.json", "pembrolizumab-p1.json"];
const fixtureCountries = (): string[] => {
  const names = new Set<string>();
  for (const f of FIXTURES) {
    const page = normalizePage((JSON.parse(readFileSync(new URL(`../fixtures/${f}`, import.meta.url), "utf8")) as { page: unknown }).page);
    for (const s of page?.studies ?? []) for (const c of s.countries) names.add(c);
  }
  return [...names].sort();
};

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
    expect(iso3("Moldova")).toBe("MDA");
  });
  it("tries the name before a trailing parenthetical, then the parenthetical", () => {
    expect(iso3("Turkey (Türkiye)")).toBe("TUR");
    expect(iso3("Narnia (Germany)")).toBe("DEU");
    expect(iso3("Virgin Islands (U.S.)")).toBe("VIR");
  });
  it("maps every country in the recorded registry pages", () => {
    const names = fixtureCountries();
    expect(names.length).toBeGreaterThan(10);
    expect(names.filter((n) => iso3(n) === null)).toEqual([]);
  });
  it("returns null for the unknown and for names on the prototype chain", () => {
    expect(iso3("Narnia")).toBeNull();
    expect(iso3("constructor")).toBeNull();
    expect(iso3("toString")).toBeNull();
    expect(iso3("__proto__")).toBeNull();
  });
  it("gives the numeric code world-atlas uses", () => {
    expect(iso3ToNumeric("USA")).toBe("840");
    expect(iso3ToNumeric("XXX")).toBeNull();
  });
});
