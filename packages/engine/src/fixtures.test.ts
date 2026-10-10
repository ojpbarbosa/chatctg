import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QueryRequest, QueryResponse } from "@chatctg/contracts";
import { normalizePage, type Study } from "@chatctg/ctgov";
import { drugIdentity } from "./dimensions";
import { fakeDeps, runQuery } from "./run";

/** The two first pages recorded from the live registry (packages/ctgov/fixtures), run through the whole engine. */
const load = (file: string): Study[] => {
  const page = normalizePage((JSON.parse(readFileSync(new URL(`../../ctgov/fixtures/${file}`, import.meta.url), "utf8")) as { page: unknown }).page);
  if (!page) throw new Error(`${file} is not a studies page`);
  return page.studies;
};
const melanoma = load("melanoma-p1.json");
const pembrolizumab = load("pembrolizumab-p1.json");
const studies = [...new Map([...melanoma, ...pembrolizumab].map((s) => [s.nct_id, s])).values()];

const req = (query: string) => QueryRequest.parse({ query, citations_per_point: 3 });
const okBody = (r: Awaited<ReturnType<typeof runQuery>>) => {
  if (!r.ok) throw new Error(JSON.stringify(r.body));
  const v = QueryResponse.safeParse(r.body);
  if (!v.success) throw new Error(JSON.stringify(v.error.issues));
  return v.data;
};
/** Every row that stands for a study cites one, and every citation names a study in the fixtures. */
const cited = (rows: { study_count: number; citations: { nct_id: string }[] }[]) => {
  const ids = new Set(studies.map((s) => s.nct_id));
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) {
    if (r.study_count > 0) expect(r.citations.length).toBeGreaterThan(0);
    for (const c of r.citations) expect(ids.has(c.nct_id)).toBe(true);
  }
};

describe("the engine over recorded registry pages", () => {
  it("loads both pages", () => {
    expect(melanoma).toHaveLength(50); expect(pembrolizumab).toHaveLength(50);
  });
  it("phase distribution", async () => {
    const body = okBody(await runQuery(req("How are melanoma trials distributed across phases?"), fakeDeps({ intent: { choice: "distribution" }, dimension: { choice: "phase" }, chart: { choice: "bar" } }, { conditions: ["melanoma"] }, melanoma, 3773)));
    if (body.visualization?.type !== "bar") throw new Error(body.visualization?.type);
    cited(body.visualization.data);
    const counted = body.visualization.data.reduce((n, r) => n + r.study_count, 0);
    expect(counted).toBeGreaterThanOrEqual(melanoma.length - body.meta.coverage.studies_without_value);
    expect(body.visualization.data.every((r) => r.citations.every((c) => c.field === "protocolSection.designModule.phases" && c.excerpt === r.phase_key))).toBe(true);
  });
  it("phase by sponsor class as bubbles: every cell of the grid, cells citing both values", async () => {
    const body = okBody(await runQuery(req("Show phase by sponsor class for melanoma trials as bubbles"), fakeDeps({ dimension: { choice: "phase" }, secondary_dimension: { choice: "sponsor_class" }, chart: { choice: "bubble" } }, { conditions: ["melanoma"] }, melanoma, 3773)));
    if (body.visualization?.type !== "bubble") throw new Error(body.visualization?.type);
    const { encoding, data } = body.visualization;
    cited(data);
    expect(data).toHaveLength(encoding.x.order!.length * encoding.y.order!.length);
    for (const r of data) for (const c of r.citations) expect(c.excerpt).toBe(`designModule.phases "${r.x_key}"; leadSponsor.class "${r.y_key}"`);
  });
  it("sponsor to drug network", async () => {
    const body = okBody(await runQuery(req("Show a network of sponsors and drugs for pembrolizumab trials"), fakeDeps({ intent: { choice: "network" }, edge_kind: { choice: "sponsor_drug" }, chart: { choice: "network_graph" } }, { drugs: ["pembrolizumab"] }, pembrolizumab)));
    if (body.visualization?.type !== "network_graph") throw new Error(body.visualization?.type);
    const { nodes, edges } = body.visualization.data;
    expect(nodes.length).toBeGreaterThan(1); cited(edges);
    const ids = new Set(nodes.map((n) => n.id));
    expect(edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
    expect(nodes.some((n) => n.id === "drug:pembrolizumab")).toBe(true);
  });
  it("country map, every country mapped", async () => {
    const body = okBody(await runQuery(req("Where are melanoma and pembrolizumab trials run?"), fakeDeps({ intent: { choice: "geographic" }, chart: { choice: "map" } }, {}, studies)));
    if (body.visualization?.type !== "map") throw new Error(body.visualization?.type);
    cited(body.visualization.data);
    expect(body.visualization.data.filter((r) => r.iso3 === null)).toEqual([]);
    expect(body.visualization.data.find((r) => r.country === "Turkey (Türkiye)")?.iso3).toBe("TUR");
    expect(body.visualization.data.find((r) => r.country === "Moldova")?.iso3).toBe("MDA");
    expect(body.meta.warnings.join(" ")).not.toMatch(/ISO code/);
  });
  it("identifies drugs by registered name when the registry mapped no MeSH term", async () => {
    const fallback = studies.filter((s) => !s.mesh_interventions.length && drugIdentity(s).length);
    expect(fallback.length).toBeGreaterThan(0);
    const body = okBody(await runQuery(req("Which drugs do these trials test?"), fakeDeps({ intent: { choice: "distribution" }, dimension: { choice: "drug" }, chart: { choice: "bar" } }, { limit: 1000 }, studies)));
    if (body.visualization?.type !== "bar") throw new Error(body.visualization?.type);
    const fallbackIds = new Set(fallback.map((s) => s.nct_id));
    const named = body.visualization.data.filter((r) => r.citations.some((c) => fallbackIds.has(c.nct_id) && c.excerpt.toLowerCase() === String(r.drug_key)));
    expect(named.length).toBeGreaterThan(0);
    for (const r of named) for (const c of r.citations.filter((x) => fallbackIds.has(x.nct_id))) {
      const s = studies.find((x) => x.nct_id === c.nct_id)!;
      expect(s.interventions.map((i) => i.name)).toContain(c.excerpt);   // the excerpt is the name as registered
    }
    expect(body.meta.notes.join(" ")).toMatch(/MeSH terms when the registry mapped any, else by the names as registered/);
  });
});
