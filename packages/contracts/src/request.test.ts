import { describe, expect, it } from "vitest";
import { QueryRequest, asList } from "./request";

describe("QueryRequest", () => {
  it("applies defaults", () => {
    const r = QueryRequest.parse({ query: "  trials by phase " });
    expect(r).toEqual({ query: "trials by phase", max_studies: 3000, citations_per_datum: 5 });
  });

  it("rejects unknown fields", () => {
    expect(QueryRequest.safeParse({ query: "x", drug: "a" }).success).toBe(false);
  });

  it("rejects end_year before start_year", () => {
    expect(QueryRequest.safeParse({ query: "x", start_year: 2020, end_year: 2019 }).success).toBe(false);
  });

  it("accepts one or many entity values", () => {
    expect(QueryRequest.parse({ query: "x", drug_name: "a" }).drug_name).toBe("a");
    expect(QueryRequest.parse({ query: "x", drug_name: ["a", "b"] }).drug_name).toEqual(["a", "b"]);
    expect(QueryRequest.safeParse({ query: "x", drug_name: [] }).success).toBe(false);
  });

  it("bounds the caps", () => {
    expect(QueryRequest.safeParse({ query: "x", max_studies: 50 }).success).toBe(false);
    expect(QueryRequest.safeParse({ query: "x", citations_per_datum: 26 }).success).toBe(false);
  });
});

describe("asList", () => {
  it("normalizes", () => {
    expect(asList(undefined)).toEqual([]);
    expect(asList("a")).toEqual(["a"]);
    expect(asList(["a", "b"])).toEqual(["a", "b"]);
  });
});
