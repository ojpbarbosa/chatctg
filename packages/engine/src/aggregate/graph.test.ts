import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph";
import { SAMPLE, study } from "../test-studies";

describe("buildGraph", () => {
  it("links sponsors to drugs, weighted by co-occurrence", () => {
    const g = buildGraph(SAMPLE, "sponsor_drug", 40);
    const merckPembro = g.edges.find((e) => e.source === "sponsor:merck" && e.target === "drug:pembrolizumab");
    expect(merckPembro?.weight).toBe(4);   // NCT01, NCT02, NCT09, NCT12
    expect(merckPembro?.studies.map((s) => s.nct_id).sort()).toEqual(["NCT00000001", "NCT00000002", "NCT00000009", "NCT00000012"]);
    expect(g.nodes.find((n) => n.id === "sponsor:merck")).toMatchObject({ label: "Merck", kind: "sponsor", study_count: 4 });
    expect(g.kinds).toEqual([{ kind: "sponsor", label: "Sponsor" }, { kind: "drug", label: "Drug" }]);
  });
  it("pairs drugs within a study, ordered, no self-loops", () => {
    const g = buildGraph(SAMPLE, "drug_drug", 40);
    const ids = g.edges.map((e) => `${e.source}|${e.target}`);
    expect(ids).toContain("drug:lenvatinib|drug:pembrolizumab");
    expect(g.edges.find((e) => e.source === "drug:lenvatinib")?.weight).toBe(2);
    expect(ids.some((i) => i.split("|")[0] === i.split("|")[1])).toBe(false);
  });
  it("keeps the top edges by weight and only the nodes they touch", () => {
    const g = buildGraph(SAMPLE, "sponsor_drug", 1);
    expect(g.edges).toHaveLength(1); expect(g.edges[0]).toMatchObject({ source: "sponsor:acme", target: "drug:pembrolizumab", weight: 4 });   // ties with Merck at 4; acme sorts first
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["drug:pembrolizumab", "sponsor:acme"]);
    expect(g.prunedEdges).toBeGreaterThan(0);
  });
  it("never prunes a large graph of weight-1 edges down to nothing", () => {
    // 250 studies, each a distinct sponsor with a distinct drug: 250 edges, every one of weight 1.
    const studies = Array.from({ length: 250 }, (_, i) => study({ nct_id: `NCT${String(i + 1).padStart(8, "0")}`, lead_sponsor: { name: `Sponsor ${i}`, class: "INDUSTRY" }, mesh_interventions: [`drug ${i}`] }));
    const g = buildGraph(studies, "sponsor_drug", 40);
    expect(g.edges).toHaveLength(40); expect(g.edges.every((e) => e.weight === 1)).toBe(true);
    expect(g.prunedEdges).toBe(210); expect(g.nodes).toHaveLength(80);
  });
  it("drops weight-1 edges first when heavier ones fill the limit", () => {
    const heavy = (i: number, n: number) => Array.from({ length: n }, (_, k) => study({ nct_id: `NCT9${String(i).padStart(3, "0")}${String(k).padStart(4, "0")}`, lead_sponsor: { name: `Big ${i}`, class: "INDUSTRY" }, mesh_interventions: [`hit ${i}`] }));
    const light = Array.from({ length: 220 }, (_, i) => study({ nct_id: `NCT${String(i + 1).padStart(8, "0")}`, lead_sponsor: { name: `Sponsor ${i}`, class: "INDUSTRY" }, mesh_interventions: [`drug ${i}`] }));
    const g = buildGraph([...light, ...Array.from({ length: 5 }, (_, i) => heavy(i, 2)).flat()], "sponsor_drug", 5);
    expect(g.edges.map((e) => e.weight)).toEqual([2, 2, 2, 2, 2]); expect(g.prunedEdges).toBe(220);
  });
  it("links lead sponsors to collaborators", () => {
    const g = buildGraph(SAMPLE, "sponsor_collaborator", 40);
    expect(g.edges).toEqual([expect.objectContaining({ source: "sponsor:acme", target: "collaborator:nci", weight: 1 })]);
  });
});
