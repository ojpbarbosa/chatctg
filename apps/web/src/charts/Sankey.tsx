import { useMemo } from "react";
import type { SankeyViz } from "@chatctg/contracts";
import { sankey, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from "d3-sankey";
import type { OnPick } from "./index";
import { countLabel } from "./common";
import { clip, textWidth, VIEW_W } from "./grid";
import { BRAND, CATEGORICAL, colorFor } from "./palette";

type Node = SankeyViz["data"]["nodes"][number];
type Link = { source: string; target: string; value: number; idx: number };
type LaidNode = SankeyNode<Node, Link>;
type LaidLink = SankeyLink<Node, Link>;

const TOP = 36, BOTTOM = 12, NODE_W = 12, GAP = 8;
const margin = (labels: string[]) => Math.min(200, Math.max(48, textWidth("x".repeat(Math.max(1, ...labels.map((s) => clip(s).length))), 12) + GAP * 2));
const end = (n: LaidNode | string | number): LaidNode => n as LaidNode;

/**
 * Two node columns, the dimension's categories on the left and the secondary dimension's on the right, joined by ribbons as wide as their
 * value. A ribbon takes its left node's colour while the left side fits the eight categorical hues, else the one brand blue. The ribbon is
 * the hover and click target.
 */
export function SankeyView({ viz, onPick }: { viz: SankeyViz; onPick: OnPick }) {
  const { left: leftAxis, right: rightAxis } = viz.encoding;
  const lefts = viz.data.nodes.filter((n) => n.side === "left"), rights = viz.data.nodes.filter((n) => n.side === "right");
  const height = TOP + Math.max(260, Math.max(lefts.length, rights.length) * 34) + BOTTOM;
  const x0 = margin(lefts.map((n) => n.label)), x1 = VIEW_W - margin(rights.map((n) => n.label));
  const { nodes, links } = useMemo(() => sankey<Node, Link>()
    .nodeId((n) => n.id).nodeWidth(NODE_W).nodePadding(14).nodeSort(null)
    .extent([[x0, TOP], [x1, height - BOTTOM]])({ nodes: viz.data.nodes.map((n) => ({ ...n })), links: viz.data.links.map((l, idx) => ({ source: l.source, target: l.target, value: l.value, idx })) }),
  [viz, x0, x1, height]);
  const hue = (n: LaidNode) => (lefts.length > CATEGORICAL.length ? BRAND : colorFor(lefts.findIndex((l) => l.id === n.id)));
  const path = sankeyLinkHorizontal<Node, Link>();
  return (
    <div className="chart" style={{ minHeight: 0 }}>
      <svg viewBox={`0 0 ${VIEW_W} ${height}`} width="100%" role="img" aria-label={viz.title} style={{ display: "block" }}>
        <text x={x0 + NODE_W} y={TOP - 16} textAnchor="end" fontSize={11} fill="var(--faint)">{leftAxis.label}</text>
        <text x={x1 - NODE_W} y={TOP - 16} fontSize={11} fill="var(--faint)">{rightAxis.label}</text>
        <g fill="none">
          {links.map((l: LaidLink) => {
            const s = end(l.source), t = end(l.target); const link = viz.data.links[l.idx]!; const name = `${s.label} to ${t.label}`;
            return (
              <path key={l.idx} className="ribbon" d={path(l) ?? ""} stroke={hue(s)} strokeOpacity={0.35} strokeWidth={Math.max(1, l.width ?? 0)} style={{ cursor: "pointer" }} onClick={() => onPick(link.citations, name)}>
                <title>{countLabel(name, link.study_count, "trials")}</title>
              </path>
            );
          })}
        </g>
        {nodes.map((n) => {
          const isLeft = n.side === "left"; const y = ((n.y0 ?? 0) + (n.y1 ?? 0)) / 2;
          return (
            <g key={n.id} className="node">
              <title>{countLabel(n.label, n.study_count, "trials")}</title>
              <rect className="node" x={n.x0} y={n.y0} width={(n.x1 ?? 0) - (n.x0 ?? 0)} height={Math.max(1, (n.y1 ?? 0) - (n.y0 ?? 0))} rx={2} fill={isLeft ? hue(n) : "var(--muted)"} />
              <text x={isLeft ? (n.x0 ?? 0) - GAP : (n.x1 ?? 0) + GAP} y={y} textAnchor={isLeft ? "end" : "start"} dominantBaseline="central" fontSize={12} fill="var(--muted)">{clip(n.label)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
