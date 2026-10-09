// @vitest-environment jsdom
import { Visualization } from "@cheiron/contracts";
import type { BarViz, GroupedBarViz, HistogramViz, LineViz, MapViz, NetworkViz, ScatterViz, SingleValueViz, StackedBarViz, TableViz } from "@cheiron/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarView, widen } from "./Bar";
import { HistogramView } from "./Histogram";
import { LineView } from "./Line";
import { CATEGORICAL, colorFor, sequential } from "./palette";
import { NetworkView } from "./Network";
import { ScatterView } from "./Scatter";
import { SingleValueView } from "./SingleValue";
import { TableView } from "./Table";
import { WorldMapView } from "./WorldMap";
import { renderChart } from "./index";

// Two square "countries": USA (840) and Canada (124), as a topology without a transform.
vi.mock("world-atlas/countries-110m.json", () => {
  const sq = (x: number, y: number) => [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10], [x, y]];
  return { default: { type: "Topology", arcs: [sq(-100, 30), sq(-100, 50)], objects: { countries: { type: "GeometryCollection", geometries: [
    { type: "Polygon", id: "840", properties: { name: "United States of America" }, arcs: [[0]] },
    { type: "Polygon", id: "124", properties: { name: "Canada" }, arcs: [[1]] },
  ] } } } };
});

const cite = (n: number) => [{ nct_id: `NCT0000000${n}`, title: `Trial ${n}`, field: "protocolSection.x", excerpt: "x" }];
const row = (o: Record<string, string | number | null>, n = 1) => ({ ...o, study_count: n, citations: cite(n) });
const size = { width: 800, height: 400 };
const noop = () => {};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
/** Mounts into jsdom (Recharts 3 draws nothing in a static server render) and returns the SVG markup. */
function renderToStaticMarkup(node: ReactNode): string {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  act(() => root.render(node));
  const html = el.innerHTML;
  act(() => root.unmount());
  el.remove();
  return html;
}
const parse = <T,>(v: unknown): T => {
  const r = Visualization.safeParse(v);
  expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  return (r as unknown as { data: T }).data;
};
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

const barEnc = { x: { field: "phase", type: "nominal", label: "Phase" }, y: { field: "trial_count", type: "quantitative", label: "Trials", unit: "trials" }, orientation: "vertical", sort: "value_desc" };
const bar = parse<BarViz>({
  type: "bar", title: "T", subtitle: "S", encoding: barEnc,
  data: [row({ phase: "Phase 1", phase_key: "PHASE1", trial_count: 5 }, 5), row({ phase: "Phase 2", phase_key: "PHASE2", trial_count: 3 }, 3), row({ phase: "Phase 3", phase_key: "PHASE3", trial_count: 2 }, 2)],
});
const seriesEnc = { ...barEnc, series: { field: "status", label: "Status", values: ["Recruiting", "Completed"] } };
const seriesRows = ["Phase 1", "Phase 2"].flatMap((p, i) => ["Recruiting", "Completed"].map((s, j) => row({ phase: p, phase_key: p, series: s, trial_count: i + j + 1 })));
const grouped = parse<GroupedBarViz>({ type: "grouped_bar", title: "T", subtitle: "S", encoding: seriesEnc, data: seriesRows });
const stacked = parse<StackedBarViz>({ type: "stacked_bar", title: "T", subtitle: "S", encoding: seriesEnc, data: seriesRows });
const line = parse<LineViz>({
  type: "line", title: "T", subtitle: "S",
  encoding: { x: { field: "period", type: "temporal", granularity: "year", label: "Year" }, y: { field: "trial_count", type: "quantitative", label: "Trials", unit: "trials" }, series: { field: "phase", label: "Phase", values: ["Phase 2", "Phase 3"] } },
  data: ["2020", "2021", "2022"].flatMap((p, i) => ["Phase 2", "Phase 3"].map((s, j) => row({ period: p, series: s, trial_count: i + j + 1 }))),
});
const hist = parse<HistogramViz>({
  type: "histogram", title: "T", subtitle: "S",
  encoding: { x: { field: "bin", type: "ordinal", label: "Enrollment", bins: [{ label: "0-50", min: 0, max: 50 }, { label: "51-200", min: 51, max: 200 }, { label: "200+", min: 201, max: null }] }, y: { field: "trial_count", type: "quantitative", label: "Trials", unit: "trials" } },
  data: [row({ bin: "0-50", bin_key: "0", trial_count: 4 }), row({ bin: "51-200", bin_key: "1", trial_count: 7 }), row({ bin: "200+", bin_key: "2", trial_count: 2 })],
});
const scatter = parse<ScatterViz>({
  type: "scatter", title: "T", subtitle: "S",
  encoding: { x: { field: "start_date", type: "temporal", label: "Start" }, y: { field: "enrollment", type: "quantitative", label: "Enrollment", unit: "participants" }, color: { field: "phase", label: "Phase", values: ["Phase 2", "Phase 3"] }, point_id: "nct_id" },
  data: [1, 2, 3, 4, 5].map((n) => row({ nct_id: `NCT0000000${n}`, title: `Trial ${n}`, start_date: `201${n}-03-01`, enrollment: n * 100, phase: n % 2 ? "Phase 2" : "Phase 3" })),
});

describe("palette", () => {
  it("starts with the brand blue, has 8 colours and wraps", () => {
    expect(CATEGORICAL).toHaveLength(8);
    expect(colorFor(0)).toBe("#1f4fff");
    expect(colorFor(8)).toBe("#1f4fff");
  });
  it("ramps from near-white to the brand and clamps", () => {
    expect(sequential(1)).toBe("rgb(31, 79, 255)");
    expect(sequential(-5)).toBe(sequential(0));
    expect(sequential(9)).toBe(sequential(1));
  });
});

describe("widen", () => {
  it("makes one wide row per category with a key per series, zero-filled", () => {
    const rows = seriesRows.slice(0, 3);
    const w = widen({ ...grouped, data: rows as GroupedBarViz["data"] });
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ phase: "Phase 1", Recruiting: 1, Completed: 2 });
    expect(w[1]).toMatchObject({ phase: "Phase 2", Recruiting: 2, Completed: 0 });
  });
  it("follows x.order when sort is x_order", () => {
    const v = { ...bar, encoding: { ...bar.encoding, sort: "x_order" as const, x: { ...bar.encoding.x, order: ["Phase 3", "Phase 1", "Phase 2"] } } };
    expect(widen(v).map((r) => r.phase)).toEqual(["Phase 3", "Phase 1", "Phase 2"]);
  });
});

describe("chart components render to SVG", () => {
  it("bar: one rectangle per category, axis labels present", () => {
    const html = renderToStaticMarkup(<BarView viz={bar} onPick={noop} {...size} />);
    expect(count(html, /recharts-bar-rectangle"/g)).toBe(3);
    expect(html).toContain("Phase 2");
    expect(html).not.toContain("recharts-legend-wrapper");
  });
  it("horizontal bar still renders every category", () => {
    const html = renderToStaticMarkup(<BarView viz={{ ...bar, encoding: { ...bar.encoding, orientation: "horizontal" } }} onPick={noop} {...size} />);
    expect(count(html, /recharts-bar-rectangle"/g)).toBe(3);
  });
  it("grouped: a bar per category per series, with a legend naming the series", () => {
    const html = renderToStaticMarkup(<BarView viz={grouped} onPick={noop} {...size} />);
    expect(count(html, /recharts-bar-rectangle"/g)).toBe(4);
    expect(html).toContain("Recruiting");
    expect(html).toContain("Completed");
  });
  it("stacked: same bars, stacked in one stack id", () => {
    const html = renderToStaticMarkup(<BarView viz={stacked} onPick={noop} {...size} />);
    expect(count(html, /recharts-bar-rectangle"/g)).toBe(4);
  });
  it("line: one line per series with a dot per period", () => {
    const html = renderToStaticMarkup(<LineView viz={line} onPick={noop} {...size} />);
    expect(count(html, /recharts-line-curve/g)).toBe(2);
    expect(count(html, /<circle/g)).toBeGreaterThanOrEqual(6);
    expect(html).toContain("2021");
  });
  it("histogram: one touching bar per bin, in bin order", () => {
    const html = renderToStaticMarkup(<HistogramView viz={hist} onPick={noop} {...size} />);
    expect(count(html, /recharts-bar-rectangle"/g)).toBe(3);
    expect(html.indexOf("0-50")).toBeLessThan(html.indexOf("200+"));
  });
  it("scatter: a point per trial, one scatter layer per colour group", () => {
    const html = renderToStaticMarkup(<ScatterView viz={scatter} onPick={noop} {...size} />);
    expect(count(html, /recharts-scatter-symbol/g)).toBe(5);
    expect(count(html, /class="recharts-layer recharts-scatter"/g)).toBe(2);
  });
});

const network = parse<NetworkViz>({
  type: "network_graph", title: "T", subtitle: "S",
  encoding: { nodes: { id_field: "id", label_field: "label", kind_field: "kind", size_field: "size", kinds: [{ kind: "sponsor", label: "Sponsor" }, { kind: "drug", label: "Drug" }] }, edges: { source_field: "source", target_field: "target", weight_field: "weight" }, layout: "force" },
  data: {
    nodes: [{ id: "a", label: "Pfizer", kind: "sponsor", size: 5, study_count: 5 }, { id: "b", label: "Aspirin", kind: "drug", size: 3, study_count: 3 }, { id: "c", label: "Placebo", kind: "drug", size: 1, study_count: 1 }],
    edges: [{ source: "a", target: "b", weight: 3, study_count: 3, citations: cite(1) }, { source: "a", target: "c", weight: 1, study_count: 1, citations: cite(2) }],
  },
});
const map = parse<MapViz>({
  type: "map", title: "T", subtitle: "S",
  encoding: { geo: { field: "country", code_field: "iso3", level: "country" }, value: { field: "trial_count", label: "Trials", unit: "trials" } },
  data: [row({ country: "United States", iso3: "USA", trial_count: 9 }, 9), row({ country: "Canada", iso3: "CAN", trial_count: 4 }, 4), row({ country: "Kosovo", iso3: null, trial_count: 1 })],
});
const table = parse<TableViz>({
  type: "table", title: "T", subtitle: "S",
  encoding: { columns: [{ field: "nct_id", label: "NCT", type: "string" }, { field: "title", label: "Title", type: "string" }, { field: "enrollment", label: "Enrollment", type: "number" }], sort: { field: "enrollment", direction: "desc" } },
  data: [row({ nct_id: "NCT00000001", title: "Trial 1", enrollment: 1200 }, 1), row({ nct_id: "NCT00000002", title: "Trial 2", enrollment: 80 }, 2)],
});
const single = parse<SingleValueViz>({ type: "single_value", title: "T", subtitle: "S", encoding: { value: { field: "trial_count", label: "Trials", unit: "trials" } }, data: [{ value: 12345, label: "Trials", study_count: 12345, citations: cite(1) }] });

/** Mounts, runs `settle` inside act, returns the live container; the caller unmounts via the returned cleanup. */
async function mount(node: ReactNode, settle: () => Promise<void>) {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  act(() => root.render(node));
  await act(settle);
  return { el, done: () => { act(() => root.unmount()); el.remove(); } };
}

describe("network, map, table and single value", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("network: a circle per node and a line per edge once the simulation has ticked", async () => {
    vi.useFakeTimers();
    const picked: string[] = [];
    const { el, done } = await mount(<NetworkView viz={network} onPick={(_, l) => picked.push(l)} />, async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(el.querySelectorAll("circle")).toHaveLength(3);
    expect(el.querySelectorAll("line")).toHaveLength(2);
    expect(el.textContent).toContain("Sponsor");
    act(() => { el.querySelector("line")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(picked).toHaveLength(1);
    done();
  });
  it("map: a path per country once the topology loads, plus the sphere, with unmapped rows listed", async () => {
    const { el, done } = await mount(<WorldMapView viz={map} onPick={noop} />, async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(el.querySelectorAll("path")).toHaveLength(3);
    expect(el.textContent).toContain("Not on the map: Kosovo 1");
    expect(el.textContent).toContain("Top: United States 9");
    done();
  });
  it("table: a row per trial with an NCT link", () => {
    const html = renderToStaticMarkup(<TableView viz={table} onPick={noop} />);
    expect(count(html, /<tr/g)).toBe(3);
    expect(html).toContain('href="https://clinicaltrials.gov/study/NCT00000002"');
    expect(html).toContain("1,200");
  });
  it("single value: the formatted number and its label", () => {
    const html = renderToStaticMarkup(<SingleValueView viz={single} onPick={noop} />);
    expect(html).toContain("12,345");
    expect(html).toContain("trials");
  });
});

describe("renderChart", () => {
  it("routes the four non-cartesian types to their renderers", () => {
    expect(renderToStaticMarkup(<>{renderChart(single, noop)}</>)).toContain("12,345");
    expect(renderToStaticMarkup(<>{renderChart(table, noop)}</>)).toContain("<table");
    expect(renderToStaticMarkup(<>{renderChart(map, noop)}</>)).not.toContain("<pre");
    expect(renderToStaticMarkup(<>{renderChart(network, noop)}</>)).not.toContain("<pre");
  });
  it("renders a cartesian type through the responsive path without throwing", () => {
    expect(() => renderToStaticMarkup(<>{renderChart(bar, noop)}</>)).not.toThrow();
  });
});
