import { useEffect, useMemo, useRef, useState } from "react";
import type { NetworkViz } from "@cheiron/contracts";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import type { OnPick } from "./index";
import { colorFor } from "./palette";

type N = SimulationNodeDatum & { id: string; label: string; kind: string; size: number };
type L = SimulationLinkDatum<N> & { weight: number; idx: number };

export function NetworkView({ viz, onPick }: { viz: NetworkViz; onPick: OnPick }) {
  const ref = useRef<SVGSVGElement>(null);
  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const W = 920, H = 520;
  const { nodes, links } = useMemo(() => {
    const nodes: N[] = viz.data.nodes.map((n) => ({ ...n }));
    const links: L[] = viz.data.edges.map((e, idx) => ({ source: e.source, target: e.target, weight: e.weight, idx }));
    return { nodes, links };
  }, [viz]);
  const maxSize = Math.max(1, ...nodes.map((n) => n.size)); const maxW = Math.max(1, ...links.map((l) => l.weight));
  const r = (n: N) => 6 + 18 * Math.sqrt(n.size / maxSize);
  useEffect(() => {
    const sim = forceSimulation(nodes).force("link", forceLink<N, L>(links).id((d) => d.id).distance((l) => 90 - 50 * (l.weight / maxW)).strength(0.6))
      .force("charge", forceManyBody().strength(-220)).force("center", forceCenter(W / 2, H / 2)).force("collide", forceCollide<N>((n) => r(n) + 6));
    sim.on("tick", () => setTick((t) => t + 1));
    return () => { sim.stop(); };
  }, [nodes, links, maxW]);
  const kinds = viz.encoding.nodes.kinds.map((k) => k.kind);
  const neighbours = useMemo(() => { const m = new Map<string, Set<string>>(); for (const l of links) { const s = (l.source as N).id ?? String(l.source), t = (l.target as N).id ?? String(l.target); (m.get(s) ?? m.set(s, new Set()).get(s)!).add(t); (m.get(t) ?? m.set(t, new Set()).get(t)!).add(s); } return m; }, [links, tick > 0]);
  const dim = (id: string) => hover !== null && hover !== id && !neighbours.get(hover)?.has(id);
  return (
    <div className="chart">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={viz.title} style={{ display: "block" }}>
        {links.map((l) => { const s = l.source as N, t = l.target as N; if (s.x === undefined || t.x === undefined) return null; const e = viz.data.edges[l.idx]!; const faded = hover !== null && s.id !== hover && t.id !== hover;
          return <line key={l.idx} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="var(--fg)" strokeOpacity={faded ? 0.04 : 0.18} strokeWidth={1 + 5 * (l.weight / maxW)} style={{ cursor: "pointer" }} onClick={() => onPick(e.citations, `${s.label} — ${t.label} (${e.weight})`)}><title>{`${s.label} — ${t.label}: ${e.weight} trials`}</title></line>; })}
        {nodes.map((n) => n.x === undefined ? null : (
          <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={dim(n.id) ? 0.25 : 1} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}
            onClick={() => { const es = viz.data.edges.filter((e) => e.source === n.id || e.target === n.id); onPick(es.flatMap((e) => e.citations), `${n.label} (${n.size} trials)`); }}>
            <circle r={r(n)} fill={colorFor(kinds.indexOf(n.kind))} fillOpacity={0.9} stroke="var(--bg)" strokeWidth={1.5} />
            {(r(n) > 11 || hover === n.id) && <text y={r(n) + 12} textAnchor="middle" fontSize={11} fill="var(--muted)">{n.label.length > 28 ? n.label.slice(0, 26) + "…" : n.label}</text>}
            <title>{`${n.label}: ${n.size} trials`}</title>
          </g>
        ))}
      </svg>
      <div className="chips" style={{ justifyContent: "flex-start", marginTop: 8 }}>{viz.encoding.nodes.kinds.map((k, i) => <span key={k.kind} className="chip-tag"><span style={{ width: 8, height: 8, borderRadius: "50%", background: colorFor(i), display: "inline-block" }} /> {k.label}</span>)}</div>
    </div>
  );
}
