import type { Citation, DataRow, Visualization } from "@chatctg/contracts";
import { countLabel, pickLabel } from "./common";

/** A data point the citations drawer can show: the label a click on it gives, and the trials it cites. */
export interface DataPoint { label: string; citations: Citation[] }
/** A chart's data points in the spec's data order, and the one the drawer opens on. */
export interface DataPoints { points: DataPoint[]; initial: number }

const first = (points: DataPoint[]): DataPoints => ({ points, initial: 0 });
/** The index of the first largest value. */
const largest = (values: number[]): number => values.reduce((best, v, i) => (v > values[best]! ? i : best), 0);
const byId = (r: DataRow): DataPoint => ({ label: String(r.nct_id), citations: r.citations });

/**
 * Every data point a click on the chart can pick, labelled exactly as that click labels it, so a click can be found in the list. Rows keep
 * the spec's order; a grid lists only its non-empty cells, which are the clickable ones. The drawer opens on the first point, except on a
 * network's heaviest edge and a sankey's largest link.
 */
export function dataPoints(viz: Visualization): DataPoints {
  switch (viz.type) {
    case "bar": case "histogram": {
      const x = viz.encoding.x.field;
      return first(viz.data.map((r) => ({ label: pickLabel(String(r[x]), null), citations: r.citations })));
    }
    case "grouped_bar": case "stacked_bar": case "line": {
      const x = viz.encoding.x.field; const split = viz.encoding.series !== undefined;
      return first(viz.data.map((r) => ({ label: pickLabel(String(r[x]), split ? String(r.series) : null), citations: r.citations })));
    }
    case "scatter": case "table": case "timeline": return first(viz.data.map(byId));
    case "map": {
      const { field, unit } = viz.encoding.value;
      return first(viz.data.map((r) => ({ label: countLabel(String(r.country), Number(r[field]), unit), citations: r.citations })));
    }
    case "single_value": return first(viz.data.map((r) => ({ label: viz.encoding.value.label, citations: r.citations })));
    case "bubble": case "heatmap": {
      const { x, y } = viz.encoding; const value = viz.type === "bubble" ? viz.encoding.size.field : viz.encoding.color.field;
      return first(viz.data.filter((r) => (Number(r[value]) || 0) > 0).map((r) => ({ label: pickLabel(String(r[x.field]), String(r[y.field])), citations: r.citations })));
    }
    case "network_graph": {
      const name = new Map(viz.data.nodes.map((n) => [n.id, n.label]));
      const edges = viz.data.edges;
      const points = edges.map((e) => ({ label: countLabel(`${name.get(e.source) ?? e.source} and ${name.get(e.target) ?? e.target}`, e.weight, "trials"), citations: e.citations }));
      return { points, initial: largest(edges.map((e) => e.weight)) };
    }
    case "sankey": {
      const name = new Map(viz.data.nodes.map((n) => [n.id, n.label]));
      const links = viz.data.links;
      const points = links.map((l) => ({ label: `${name.get(l.source) ?? l.source} to ${name.get(l.target) ?? l.target}`, citations: l.citations }));
      return { points, initial: largest(links.map((l) => l.value)) };
    }
  }
}
