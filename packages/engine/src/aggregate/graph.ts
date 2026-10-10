import type { EdgeKind } from "@chatctg/contracts";
import type { Study } from "@chatctg/ctgov";
import { conditionIdentity, drugIdentity } from "../dimensions";

export interface GraphNode { id: string; label: string; kind: string; size: number; study_count: number }
export interface GraphEdge { source: string; target: string; weight: number; studies: Study[]; a: { kind: string; value: string }; b: { kind: string; value: string } }

export const EDGE_ENDS: Record<EdgeKind, { a: string; b: string }> = {
  sponsor_drug: { a: "sponsor", b: "drug" }, drug_drug: { a: "drug", b: "drug" }, condition_drug: { a: "condition", b: "drug" },
  sponsor_condition: { a: "sponsor", b: "condition" }, sponsor_collaborator: { a: "sponsor", b: "collaborator" },
};
export const KIND_LABEL: Record<string, string> = { sponsor: "Sponsor", drug: "Drug", condition: "Condition", collaborator: "Collaborator" };
export const KIND_FIELD: Record<string, string> = {
  sponsor: "protocolSection.sponsorCollaboratorsModule.leadSponsor.name",
  drug: "derivedSection.interventionBrowseModule.meshes[].term",
  condition: "derivedSection.conditionBrowseModule.meshes[].term",
  collaborator: "protocolSection.sponsorCollaboratorsModule.collaborators[].name",
};

function valuesFor(kind: string, s: Study): string[] {
  switch (kind) {
    case "sponsor": return s.lead_sponsor.name ? [s.lead_sponsor.name] : [];
    case "drug": return drugIdentity(s);
    case "condition": return conditionIdentity(s);
    case "collaborator": return s.collaborators;
    default: return [];
  }
}
const nodeId = (kind: string, value: string) => `${kind}:${value.toLowerCase()}`;

export function buildGraph(studies: Study[], edgeKind: EdgeKind, limit: number): { nodes: GraphNode[]; edges: GraphEdge[]; kinds: { kind: string; label: string }[]; prunedEdges: number } {
  const { a: kindA, b: kindB } = EDGE_ENDS[edgeKind];
  const labels = new Map<string, { label: string; kind: string }>();
  const nodeStudies = new Map<string, Set<string>>();
  const edgeMap = new Map<string, GraphEdge>();
  const touch = (id: string, kind: string, value: string, s: Study) => {
    if (!labels.has(id)) labels.set(id, { label: value, kind });
    const set = nodeStudies.get(id) ?? new Set<string>(); set.add(s.nct_id); nodeStudies.set(id, set);
  };
  for (const s of studies) {
    const pairs: [string, string][] = [];
    if (kindA === kindB) {
      const vs = valuesFor(kindA, s).sort((x, y) => x.localeCompare(y));
      for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) pairs.push([vs[i]!, vs[j]!]);
    } else {
      for (const va of valuesFor(kindA, s)) for (const vb of valuesFor(kindB, s)) pairs.push([va, vb]);
    }
    for (const [va, vb] of pairs) {
      const ia = nodeId(kindA, va), ib = nodeId(kindB, vb);
      if (ia === ib) continue;
      touch(ia, kindA, va, s); touch(ib, kindB, vb, s);
      const key = `${ia}|${ib}`;
      const e = edgeMap.get(key) ?? { source: ia, target: ib, weight: 0, studies: [], a: { kind: kindA, value: va }, b: { kind: kindB, value: vb } };
      if (!e.studies.some((x) => x.nct_id === s.nct_id)) { e.weight++; e.studies.push(s); }
      edgeMap.set(key, e);
    }
  }
  // Keep the `limit` heaviest edges. Sorting by weight puts the weight-1 edges last, so they are the first dropped, and a graph made
  // only of weight-1 edges still shows `limit` of them instead of none.
  const all = [...edgeMap.values()].sort((x, y) => y.weight - x.weight || x.source.localeCompare(y.source) || x.target.localeCompare(y.target));
  const edges = all.slice(0, limit);
  const used = new Set(edges.flatMap((e) => [e.source, e.target]));
  const nodes: GraphNode[] = [...used].sort().map((id) => {
    const n = nodeStudies.get(id)!.size; const l = labels.get(id)!;
    return { id, label: l.label, kind: l.kind, size: n, study_count: n };
  });
  const kinds = kindA === kindB ? [{ kind: kindA, label: KIND_LABEL[kindA]! }] : [{ kind: kindA, label: KIND_LABEL[kindA]! }, { kind: kindB, label: KIND_LABEL[kindB]! }];
  return { nodes, edges, kinds, prunedEdges: all.length - edges.length };
}
