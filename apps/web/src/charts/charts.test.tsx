// @vitest-environment jsdom
import { Visualization } from "@chatctg/contracts";
import type { BarViz, BubbleViz, GroupedBarViz, HeatmapViz, SankeyViz, TimelineViz, HistogramViz, LineViz, MapViz, NetworkViz, ScatterViz, SingleValueViz, StackedBarViz, TableViz } from "@chatctg/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarView, widen } from "./Bar";
import { BubbleView } from "./Bubble";
import { HeatmapView, ZERO } from "./Heatmap";
import { SankeyView } from "./Sankey";
import { TimelineView } from "./Timeline";
import { HistogramView } from "./Histogram";
import { LineView } from "./Line";
import { CATEGORICAL, colorFor, sequential } from "./palette";
import { NetworkView } from "./Network";
import { compact, ScatterView } from "./Scatter";
import { SingleValueView } from "./SingleValue";
import { TableView } from "./Table";
import { WorldMapView } from "./WorldMap";
import { renderChart } from "./index";
import { countLabel, pickLabel } from "./common";
import { dataPoints } from "./points";

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
  it("scatter: enrollment on a log axis with compact decade ticks, and no point for an enrollment of 0", () => {
    const wide: ScatterViz = { ...scatter, data: [...scatter.data, row({ nct_id: "NCT00000006", title: "Trial 6", start_date: "2016-03-01", enrollment: 0, phase: "Phase 2" }), row({ nct_id: "NCT00000007", title: "Trial 7", start_date: "2017-03-01", enrollment: 5_000_000, phase: "Phase 3" })] as ScatterViz["data"] };
    const html = renderToStaticMarkup(<ScatterView viz={wide} onPick={noop} {...size} />);
    expect(count(html, /recharts-scatter-symbol/g)).toBe(6);
    const yTicks = [...html.matchAll(/recharts-yAxis[\s\S]*?<\/g><\/g>/g)].join("");
    for (const label of ["10", "100", "1k", "100k", "1M"]) expect(yTicks).toContain(`>${label}</tspan>`);
    expect(compact(1500)).toBe("1.5k"); expect(compact(2_500_000)).toBe("2.5M"); expect(compact(40)).toBe("40");
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
    const picked: { c: unknown; l: string }[] = [];
    const { el, done } = await mount(<NetworkView viz={network} onPick={(c, l) => picked.push({ c, l })} />, async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(el.querySelectorAll("circle")).toHaveLength(3);
    expect(el.querySelectorAll("line")).toHaveLength(2);
    expect(el.textContent).toContain("Sponsor");
    // Only nodes above the median radius carry a visible label; every node stays inside the 920 × 560 frame.
    expect([...el.querySelectorAll("svg text")].map((t) => t.textContent)).toEqual(["Pfizer"]);
    for (const g of el.querySelectorAll("svg g[transform]")) {
      const [x, y] = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute("transform")!)!.slice(1).map(Number) as [number, number];
      const r = Number(g.querySelector("circle")!.getAttribute("r"));
      expect(x).toBeGreaterThanOrEqual(r + 4); expect(x).toBeLessThanOrEqual(920 - r - 4);
      expect(y).toBeGreaterThanOrEqual(r + 4); expect(y).toBeLessThanOrEqual(560 - r - 4);
    }
    act(() => { el.querySelector("line")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(picked).toEqual([{ c: network.data.edges[0]!.citations, l: "Pfizer and Aspirin, 3 trials" }]);
    expect(el.querySelector("line title")!.textContent).toBe("Pfizer and Aspirin, 3 trials");
    picked.length = 0;
    act(() => { el.querySelector("circle")!.parentElement!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(picked).toEqual([{ c: [...network.data.edges[0]!.citations, ...network.data.edges[1]!.citations], l: "Pfizer, 5 trials" }]);
    done();
  });
  it("map: a path per country once the topology loads, plus the sphere, with unmapped rows listed", async () => {
    const picked: { c: unknown; l: string }[] = [];
    const { el, done } = await mount(<WorldMapView viz={map} onPick={(c, l) => picked.push({ c, l })} />, async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(el.querySelectorAll("path")).toHaveLength(3);
    const usa = [...el.querySelectorAll("path")].find((p) => p.querySelector("title")?.textContent?.includes("United States"))!;
    expect(usa.querySelector("title")!.textContent).toBe("United States, 9 trials");
    expect(usa.getAttribute("fill")).not.toBe("#eceef2");
    const grey = [...el.querySelectorAll("path")].filter((p) => p.getAttribute("fill") === "#eceef2");
    expect(grey).toHaveLength(0);
    act(() => { usa.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(picked).toEqual([{ c: map.data[0]!.citations, l: "United States, 9 trials" }]);
    expect(el.textContent).toContain("Not on the map: Kosovo 1");
    expect(el.textContent).toContain("Top: United States 9, Canada 4, Kosovo 1");
    done();
  });
  it("table: a row per trial with an NCT link", () => {
    const html = renderToStaticMarkup(<TableView viz={table} onPick={noop} />);
    expect(count(html, /<tr/g)).toBe(3);
    expect(html).toContain('href="https://clinicaltrials.gov/study/NCT00000002"');
    expect(html).toContain("1,200");
  });
  it("table: a row click picks its citations, the NCT link click does not", async () => {
    const picked: { c: unknown; l: string }[] = [];
    const { el, done } = await mount(<TableView viz={table} onPick={(c, l) => picked.push({ c, l })} />, async () => {});
    const tr = el.querySelectorAll("tbody tr")[0]!;
    act(() => { tr.querySelectorAll("td")[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(picked).toEqual([{ c: table.data[0]!.citations, l: "NCT00000001" }]);
    picked.length = 0;
    act(() => { tr.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
    expect(picked).toHaveLength(0);
    done();
  });
  it("single value: the formatted number and its label", () => {
    const html = renderToStaticMarkup(<SingleValueView viz={single} onPick={noop} />);
    expect(html).toContain("12,345");
    expect(html).toContain("trials, click for the most recent");
  });
});

/** A phase by sponsor class grid; `values[i][j]` is the count for the i-th phase and j-th class, and an empty cell cites nothing. */
const gridRows = (values: number[][]) => ["Phase 1", "Phase 2", "Phase 3"].flatMap((x, i) => ["Industry", "Other"].map((y, j) => {
  const v = values[i]![j]!;
  return { x, x_key: x.toUpperCase().replace(" ", ""), y, y_key: y.toUpperCase(), trial_count: v, study_count: v, citations: v ? cite(i * 2 + j) : [] };
}));
const gridAxes = { x: { field: "x", type: "ordinal", label: "Phase", order: ["Phase 1", "Phase 2", "Phase 3"] }, y: { field: "y", type: "ordinal", label: "Sponsor class", order: ["Industry", "Other"] } };
const bubble = parse<BubbleViz>({ type: "bubble", title: "T", subtitle: "S", encoding: { ...gridAxes, size: { field: "trial_count", label: "Trials", unit: "trials" } }, data: gridRows([[10, 0], [3, 1], [40, 0]]) });
const heatmap = parse<HeatmapViz>({ type: "heatmap", title: "T", subtitle: "S", encoding: { ...gridAxes, color: { field: "trial_count", label: "Trials", unit: "trials" } }, data: gridRows([[10, 0], [3, 1], [40, 0]]) });
/** The grid cell whose hover title is `title`. */
const cellTitled = (el: HTMLElement, title: string) => [...el.querySelectorAll("g.cell")].find((g) => g.querySelector("title")?.textContent === title)!;

describe("grid charts", () => {
  it("bubble: a circle per non-empty cell, area proportional to the value, labelled inside when the label fits", async () => {
    const picked: { c: unknown; l: string }[] = [];
    const { el, done } = await mount(<BubbleView viz={bubble} onPick={(c, l) => picked.push({ c, l })} />, async () => {});
    expect(el.querySelectorAll("g.cell")).toHaveLength(6);
    expect(el.querySelectorAll("circle.bubble")).toHaveLength(4);
    const r = (title: string) => Number(cellTitled(el, title).querySelector("circle")!.getAttribute("r"));
    expect(r("Phase 3, Industry, 40 trials") / r("Phase 1, Industry, 10 trials")).toBeCloseTo(2, 5);
    expect(cellTitled(el, "Phase 3, Industry, 40 trials").querySelector("text")!.textContent).toBe("40");
    expect(cellTitled(el, "Phase 2, Other, 1 trial").querySelector("text")).toBeNull();
    expect(cellTitled(el, "Phase 1, Other, 0 trials").querySelector("circle")).toBeNull();
    expect(el.textContent).toContain("Sponsor class");
    act(() => { cellTitled(el, "Phase 1, Other, 0 trials").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(picked).toEqual([]);
    act(() => { cellTitled(el, "Phase 3, Industry, 40 trials").querySelector("circle")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(picked).toEqual([{ c: bubble.data[4]!.citations, l: "Phase 3, Industry" }]);
    done();
  });
});

describe("heatmap", () => {
  it("a cell per pair of categories, empty ones neutral, shaded by the blue ramp, labelled in the ink its fill needs", async () => {
    const picked: { c: unknown; l: string }[] = [];
    const { el, done } = await mount(<HeatmapView viz={heatmap} onPick={(c, l) => picked.push({ c, l })} />, async () => {});
    expect(el.querySelectorAll("rect.heat")).toHaveLength(6);
    const fill = (title: string) => cellTitled(el, title).querySelector("rect.heat")!.getAttribute("fill");
    expect(fill("Phase 1, Other, 0 trials")).toBe(ZERO);
    expect(fill("Phase 3, Industry, 40 trials")).toBe(sequential(1));
    expect(new Set([fill("Phase 1, Industry, 10 trials"), fill("Phase 2, Industry, 3 trials"), fill("Phase 2, Other, 1 trial")]).size).toBe(3);
    expect(cellTitled(el, "Phase 3, Industry, 40 trials").querySelector("text")!.getAttribute("fill")).toBe("#fff");
    expect(cellTitled(el, "Phase 2, Other, 1 trial").querySelector("text")!.getAttribute("fill")).toBe("var(--fg)");
    expect(cellTitled(el, "Phase 1, Other, 0 trials").querySelector("text")).toBeNull();
    // The scale legend names the measure and runs from 0 to the largest value.
    expect(el.querySelector(".legend")!.textContent).toBe("Trials040");
    act(() => { cellTitled(el, "Phase 2, Industry, 3 trials").querySelector("rect.heat")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(picked).toEqual([{ c: heatmap.data[2]!.citations, l: "Phase 2, Industry" }]);
    done();
  });
});

const timeline = parse<TimelineViz>({
  type: "timeline", title: "T", subtitle: "S",
  encoding: {
    start: { field: "start_date", type: "temporal", label: "Start date" }, end: { field: "end_date", type: "temporal", label: "Primary completion" },
    label: { field: "title" }, color: { field: "phase", label: "Phase", values: ["Phase 2", "Phase 3"] }, point_id: "nct_id",
  },
  data: [
    row({ nct_id: "NCT00000001", title: "A trial whose title is far too long to fit beside the bars of the chart", start_date: "2018-03", end_date: "2021-06-30", phase: "Phase 3", status: "Completed" }, 1),
    row({ nct_id: "NCT00000002", title: "Trial 2", start_date: "2020-01-15", end_date: null, phase: "Phase 2", status: "Recruiting" }, 2),
    row({ nct_id: "NCT00000003", title: "Trial 3", start_date: "2022-05-01", end_date: "2024-12-31", phase: "Phase 2", status: "Active not recruiting" }, 3),
  ],
});

describe("timeline", () => {
  it("a bar per trial from start to primary completion, coloured by phase, open-ended with a dashed cap when the end is unknown", async () => {
    const picked: { c: unknown; l: string }[] = [];
    const { el, done } = await mount(<TimelineView viz={timeline} onPick={(c, l) => picked.push({ c, l })} />, async () => {});
    const bars = [...el.querySelectorAll("rect.span")];
    expect(bars).toHaveLength(3);
    expect(bars.map((b) => b.getAttribute("fill"))).toEqual([colorFor(1), colorFor(0), colorFor(0)]);
    expect(el.querySelectorAll(".open")).toHaveLength(1);
    expect(el.querySelector(".open")!.closest("g.row")!.querySelector("title")!.textContent).toMatch(/^NCT00000002, Trial 2, /);
    const ys = bars.map((b) => Number(b.getAttribute("y")));
    expect(ys[0]).toBeLessThan(ys[1]!); expect(ys[1]).toBeLessThan(ys[2]!);
    // The 2018-03 to 2021-06-30 bar is about as long as the 2022-05-01 to 2024-12-31 one plus a year.
    const w = bars.map((b) => Number(b.getAttribute("width")));
    expect(w[0]! / w[2]!).toBeCloseTo((2021.5 - 2018.17) / (2025 - 2022.33), 1);
    expect(el.querySelector('a[href="https://clinicaltrials.gov/study/NCT00000001"]')!.textContent).toBe("NCT00000001");
    const label = [...el.querySelectorAll("text.trial")][0]!;
    expect(label.textContent).toMatch(/…/); expect(label.querySelector("title")!.textContent).toBe(timeline.data[0]!.title);
    expect(el.textContent).toContain("2020");
    expect(el.querySelector(".legend")!.textContent).toContain("Phase 3");
    act(() => { bars[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(picked).toEqual([{ c: timeline.data[1]!.citations, l: "NCT00000002" }]);
    picked.length = 0;
    act(() => { el.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
    expect(picked).toHaveLength(0);
    done();
  });
});

const sankey = parse<SankeyViz>({
  type: "sankey", title: "T", subtitle: "S",
  encoding: {
    nodes: { id_field: "id", label_field: "label", side_field: "side" }, links: { source_field: "source", target_field: "target", value_field: "value", unit: "trials" },
    left: { field: "sponsor_class", label: "Sponsor class" }, right: { field: "phase", label: "Phase" },
  },
  data: {
    nodes: [
      { id: "left:INDUSTRY", label: "Industry", side: "left", study_count: 7 }, { id: "left:NIH", label: "NIH", side: "left", study_count: 1 },
      { id: "right:PHASE2", label: "Phase 2", side: "right", study_count: 4 }, { id: "right:PHASE3", label: "Phase 3", side: "right", study_count: 4 },
    ],
    links: [
      { source: "left:INDUSTRY", target: "right:PHASE2", value: 3, study_count: 3, citations: cite(1) },
      { source: "left:INDUSTRY", target: "right:PHASE3", value: 4, study_count: 4, citations: cite(2) },
      { source: "left:NIH", target: "right:PHASE2", value: 1, study_count: 1, citations: cite(3) },
    ],
  },
});

describe("sankey", () => {
  it("left and right node columns, a ribbon per link as wide as its value, coloured by its left node", async () => {
    const picked: { c: unknown; l: string }[] = [];
    const { el, done } = await mount(<SankeyView viz={sankey} onPick={(c, l) => picked.push({ c, l })} />, async () => {});
    const ribbons = [...el.querySelectorAll("path.ribbon")];
    expect(ribbons).toHaveLength(3);
    expect(el.querySelectorAll("rect.node")).toHaveLength(4);
    const titled = (t: string) => ribbons.find((r) => r.querySelector("title")?.textContent === t)!;
    const width = (t: string) => Number(titled(t).getAttribute("stroke-width"));
    expect(width("Industry to Phase 3, 4 trials") / width("NIH to Phase 2, 1 trial")).toBeCloseTo(4, 5);
    expect(titled("Industry to Phase 3, 4 trials").getAttribute("stroke")).toBe(colorFor(0));
    expect(titled("NIH to Phase 2, 1 trial").getAttribute("stroke")).toBe(colorFor(1));
    const x = (label: string) => Number([...el.querySelectorAll("g.node")].find((g) => g.querySelector("title")?.textContent?.startsWith(`${label},`))!.querySelector("rect")!.getAttribute("x"));
    expect(x("Industry")).toBeLessThan(x("Phase 3"));
    for (const text of ["Sponsor class", "Phase", "Industry", "NIH", "Phase 2", "Phase 3"]) expect(el.textContent).toContain(text);
    act(() => { titled("Industry to Phase 3, 4 trials").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(picked).toEqual([{ c: sankey.data.links[1]!.citations, l: "Industry to Phase 3" }]);
    done();
  });
});

describe("labels", () => {
  it("name what was clicked with commas, not separator characters", () => {
    expect(pickLabel("Phase 3", "nivolumab")).toBe("Phase 3, nivolumab");
    expect(pickLabel("2021", null)).toBe("2021");
    expect(countLabel("Germany", 24, "trials")).toBe("Germany, 24 trials");
    expect(countLabel("Pfizer", 1, "trials")).toBe("Pfizer, 1 trial");
    expect(countLabel("Canada", 1200, "participants")).toBe("Canada, 1,200 participants");
  });
});

describe("renderChart", () => {
  it("routes the non-cartesian types to their renderers", () => {
    for (const [viz, mark] of [[bubble, 'class="bubble"'], [heatmap, 'class="heat"'], [timeline, 'class="span"'], [sankey, 'class="ribbon"']] as const) {
      const html = renderToStaticMarkup(<>{renderChart(viz, noop)}</>);
      expect(html, viz.type).toContain(mark); expect(html, viz.type).not.toContain("<pre");
    }
    expect(renderToStaticMarkup(<>{renderChart(single, noop)}</>)).toContain("12,345");
    expect(renderToStaticMarkup(<>{renderChart(table, noop)}</>)).toContain("<table");
    expect(renderToStaticMarkup(<>{renderChart(map, noop)}</>)).not.toContain("<pre");
    expect(renderToStaticMarkup(<>{renderChart(network, noop)}</>)).not.toContain("<pre");
  });
  it("renders a cartesian type through the responsive path without throwing", () => {
    expect(() => renderToStaticMarkup(<>{renderChart(bar, noop)}</>)).not.toThrow();
  });
});

describe("dataPoints", () => {
  const labels = (v: Parameters<typeof dataPoints>[0]) => dataPoints(v).points.map((p) => p.label);
  it("lists the rows of a row chart in the spec's data order, labelled as a click on each is, and opens on the first", () => {
    expect(labels(bar)).toEqual(["Phase 1", "Phase 2", "Phase 3"]);
    expect(dataPoints(bar).points[1]!.citations).toBe(bar.data[1]!.citations);
    expect(labels(grouped)).toEqual(["Phase 1, Recruiting", "Phase 1, Completed", "Phase 2, Recruiting", "Phase 2, Completed"]);
    expect(labels(stacked)).toEqual(labels(grouped));
    expect(labels(line).slice(0, 3)).toEqual(["2020, Phase 2", "2020, Phase 3", "2021, Phase 2"]);
    expect(labels(hist)).toEqual(["0-50", "51-200", "200+"]);
    expect(labels(scatter)).toEqual(["NCT00000001", "NCT00000002", "NCT00000003", "NCT00000004", "NCT00000005"]);
    expect(labels(map)).toEqual(["United States, 9 trials", "Canada, 4 trials", "Kosovo, 1 trial"]);
    expect(labels(table)).toEqual(["NCT00000001", "NCT00000002"]);
    expect(labels(timeline)).toEqual(["NCT00000001", "NCT00000002", "NCT00000003"]);
    expect(dataPoints(single)).toEqual({ points: [{ label: "Trials", citations: single.data[0]!.citations }], initial: 0 });
    for (const v of [bar, grouped, line, hist, scatter, map, table, timeline]) expect(dataPoints(v).initial, v.type).toBe(0);
  });
  it("lists only the non-empty cells of a grid and opens on the first of them", () => {
    expect(labels(bubble)).toEqual(["Phase 1, Industry", "Phase 2, Industry", "Phase 2, Other", "Phase 3, Industry"]);
    expect(dataPoints(bubble).initial).toBe(0);
    const late = parse<HeatmapViz>({ ...heatmap, data: gridRows([[0, 2], [3, 0], [0, 0]]) });
    expect(labels(late)).toEqual(["Phase 1, Other", "Phase 2, Industry"]);
    expect(dataPoints(late).points[0]!.citations).toBe(late.data[1]!.citations);
  });
  it("opens a network on its heaviest edge and a sankey on its largest link, in data order", () => {
    expect(labels(network)).toEqual(["Pfizer and Aspirin, 3 trials", "Pfizer and Placebo, 1 trial"]);
    expect(dataPoints(network).initial).toBe(0);
    const reversed = { ...network, data: { ...network.data, edges: [...network.data.edges].reverse() } };
    expect(dataPoints(reversed).initial).toBe(1);
    expect(labels(sankey)).toEqual(["Industry to Phase 2", "Industry to Phase 3", "NIH to Phase 2"]);
    expect(dataPoints(sankey).initial).toBe(1);
    expect(dataPoints(sankey).points[1]!.citations).toBe(sankey.data.links[1]!.citations);
  });
});
