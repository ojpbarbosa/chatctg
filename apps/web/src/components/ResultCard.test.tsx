// @vitest-environment jsdom
import { Visualization } from "@chatctg/contracts";
import type { Citation, Interpretation, Judged, Meta, QueryRequestInput, QueryResponse } from "@chatctg/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { HistoryItem } from "../history";
import { ResultCard, type LiveState } from "./ResultCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item: HistoryItem = { id: "1", query: "Which countries run the most lupus trials?", created_at: "2026-10-09T00:00:00Z", response: null, error: null };
const judged: Judged = {
  intent: { value: "geographic", p: 0.88 }, dimension: { value: "country", p: 0.51 }, secondary_dimension: null,
  chart: { chosen: "bar", provisional: "map" }, chart_named: false, recruiting_only: true, phase_filter: null, jev_ms: 180,
};
const interpretation: Interpretation = {
  intent: { value: "geographic", p: 0.88, confidence: 0.3, alternatives: [{ value: "geographic", p: 0.88 }, { value: "ranking", p: 0.1 }] },
  dimension: { value: "country", p: 0.51 }, secondary_dimension: null,
  chart: { chosen: "bar", applied: "map", explicit: false, reason: "bar is only used for a geographic question when asked for; using map" },
  metric: "trial_count", granularity: null, edge_kind: null,
  entities: { drugs: [], conditions: ["lupus"], sponsors: [], countries: [] }, time_window: { start_year: 2015, end_year: null },
  limit: null, recruiting_only: true, combination: null, phase_filter: null, provided_fields: [],
  question_set: { id: "query-interpretation", version: 2 }, models: { judge: "fake", extractor: "fake", titler: "fake" },
};

describe("ResultCard", () => {
  it("shows the judged chips and the provisional skeleton, then the full chips once the interpretation lands", () => {
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    const render = (live: LiveState) => act(() => root.render(<ResultCard item={item} live={live} onDidYouMean={() => {}} />));
    const tags = () => [...el.querySelectorAll(".chip-tag")].map((t) => t.textContent);

    render({ judged });
    expect(el.textContent).toContain("Reading the names in the question…");
    expect(tags()).toEqual(["geographic 88%", "by country", "map (asked: bar)", "recruiting only"]);
    expect(el.querySelectorAll(".chips")).toHaveLength(1);
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();

    render({ judged, interpretation: { interpretation, chart: "map", arms: [{ label: "Lupus", filters: { "query.cond": '"lupus"' } }] } });
    expect(el.textContent).not.toContain("Reading the names in the question");
    expect(tags()).toEqual(["geographic 88%", "by country", "map (asked: bar)", "recruiting only", "from 2015"]);
    expect(el.querySelectorAll(".chips")).toHaveLength(1);
    expect(el.querySelector("button.chip")!.textContent).toBe("Did you mean ranking? 10%");
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();

    act(() => root.unmount());
    el.remove();
  });
});

const cite = (n: number): Citation => ({ nct_id: `NCT0000000${n}`, title: `Trial ${n}`, field: "protocolSection.designModule.phases", excerpt: `PHASE${n}` });
const phases = Visualization.parse({
  type: "bar", title: "Melanoma trials by phase", subtitle: "S",
  encoding: { x: { field: "phase", type: "ordinal", label: "Phase" }, y: { field: "trial_count", type: "quantitative", label: "Trials", unit: "trials" }, orientation: "vertical", sort: "x_order" },
  data: [
    { phase: "Phase 1", phase_key: "PHASE1", trial_count: 5, study_count: 5, citations: [cite(1), cite(2)] },
    { phase: "Phase 2", phase_key: "PHASE2", trial_count: 3, study_count: 3, citations: [cite(3)] },
    { phase: "Phase 3", phase_key: "PHASE3", trial_count: 1, study_count: 1, citations: [cite(4)] },
  ],
});
const trials = Visualization.parse({
  type: "table", title: "Recent trials", subtitle: "S",
  encoding: { columns: [{ field: "nct_id", label: "NCT ID", type: "string" }, { field: "title", label: "Title", type: "string" }], sort: { field: "start_date", direction: "desc" } },
  data: [1, 2].map((n) => ({ nct_id: `NCT0000000${n}`, title: `Trial ${n}`, study_count: 1, citations: [cite(n)] })),
});
const meta: Meta = {
  query: "How are melanoma trials distributed across phases?",
  request: { query: "How are melanoma trials distributed across phases?", max_studies: 3000, citations_per_point: 2 },
  extraction: { drugs: [], conditions: ["melanoma"], sponsors: [], countries: [], start_year: null, end_year: null, limit: null },
  interpretation, arms: [{ label: "Melanoma", filters: { "query.cond": '"melanoma"' } }],
  source: { name: "clinicaltrials.gov", api_version: "2.0.5", data_timestamp: "2026-10-09T09:00:05", requests: [] },
  coverage: { total_count: 2909, fetched_count: 2909, truncated: false, sorted_by: "StartDate:desc", studies_without_value: 0, omitted_categories: 0 },
  units: { y: "trials" }, granularity: null,
  timing: { jev_ms: 180, judged_ms: 310, extract_ms: 1100, fetch_ms: 3500, title_ms: 700, aggregate_ms: 12, total_ms: 4700 },
  notes: [], warnings: ["A warning stays as it is."], version: "chatctg/0.1.0",
};
const request: QueryRequestInput = { query: "How are melanoma trials distributed across phases?", citations_per_point: 2 };
const answered = (visualization: Visualization, extra: Partial<HistoryItem> = {}): HistoryItem => ({ ...item, query: request.query, response: { visualization, meta } satisfies QueryResponse, request, ...extra });

describe("ResultCard with an answer", () => {
  function setup(it: HistoryItem) {
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    act(() => root.render(<ResultCard item={it} live={null} onDidYouMean={() => {}} />));
    const drawer = () => el.querySelector<HTMLElement>('[aria-label="Cited trials"]');
    const button = (name: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === name)!;
    const click = (b: Element) => act(() => { b.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const cited = () => [...drawer()!.querySelectorAll(".cite a")].map((a) => a.textContent);
    return { el, drawer, button, click, cited, done: () => { act(() => root.unmount()); el.remove(); } };
  }

  it("opens a bar result with the first row's citations, and Next and Previous step through the rows in order", () => {
    const { drawer, button, click, cited, done } = setup(answered(phases));
    expect(drawer()).not.toBeNull();
    expect(drawer()!.querySelector("h3")!.textContent).toBe("Citations for Phase 1 (point 1 of 3)");
    expect(cited()).toEqual(["NCT00000001", "NCT00000002"]);
    expect(drawer()!.textContent).toContain("or click any point on the chart");
    expect(button("Previous").getAttribute("aria-disabled")).toBe("true");
    click(button("Next"));
    expect(drawer()!.querySelector("h3")!.textContent).toBe("Citations for Phase 2 (point 2 of 3)");
    expect(cited()).toEqual(["NCT00000003"]);
    expect(button("Previous").getAttribute("aria-disabled")).toBe("false");
    click(button("Next"));
    expect(cited()).toEqual(["NCT00000004"]);
    expect(button("Next").getAttribute("aria-disabled")).toBe("true");
    click(button("Next"));
    expect(drawer()!.querySelector("h3")!.textContent).toBe("Citations for Phase 3 (point 3 of 3)");
    click(button("Previous"));
    expect(drawer()!.querySelector("h3")!.textContent).toBe("Citations for Phase 2 (point 2 of 3)");
    done();
  });

  it("opens on the first point that cites a trial, and on the first point with the empty message only when none does", () => {
    const uncited = (rows: number[]) => Visualization.parse({ ...phases, data: phases.type === "bar" ? phases.data.map((r, k) => (rows.includes(k) ? { ...r, citations: [] } : r)) : [] });
    const first = setup(answered(uncited([0])));
    expect(first.drawer()!.querySelector("h3")!.textContent).toBe("Citations for Phase 2 (point 2 of 3)");
    expect(first.cited()).toEqual(["NCT00000003"]);
    first.click(first.button("Previous"));
    expect(first.drawer()!.textContent).toContain("No citations were requested for this data point.");
    first.done();
    const none = setup(answered(uncited([0, 1, 2])));
    expect(none.drawer()!.querySelector("h3")!.textContent).toBe("Citations for Phase 1 (point 1 of 3)");
    expect(none.drawer()!.textContent).toContain("No citations were requested for this data point.");
    none.done();
  });

  it("still selects the point a click on the chart picks", () => {
    const { el, drawer, click, cited, done } = setup(answered(trials));
    expect(drawer()!.querySelector("h3")!.textContent).toBe("Citations for NCT00000001 (point 1 of 2)");
    click(el.querySelectorAll("tbody tr")[1]!.querySelectorAll("td")[1]!);
    expect(drawer()!.querySelector("h3")!.textContent).toBe("Citations for NCT00000002 (point 2 of 2)");
    expect(cited()).toEqual(["NCT00000002"]);
    done();
  });

  it("times each stage in the footer with capitalised labels and no vendor name", () => {
    const { el, done } = setup(answered(phases));
    const foot = el.querySelector(".card .foot")!;
    expect([...foot.children].map((c) => c.textContent)).toEqual(["Judged in 310 ms", "Extraction 1.1 s", "ClinicalTrials.gov 3.5 s", "Total 4.7 s", "2,909 of 2,909 trials read", "A warning stays as it is.", "Show JSON"]);
    expect(foot.textContent).not.toContain("Jev");
    done();
  });

  it("opens the request, with the extraction at the same level as the query, and the response as JSON below the footer, inside the card, with the button left in place", () => {
    const { el, button, click, done } = setup(answered(phases));
    const foot = el.querySelector(".card .foot")!;
    const toggle = button("Show JSON");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    click(toggle);
    expect(button("Hide JSON")).toBe(toggle);
    expect(foot.lastElementChild!.contains(toggle)).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = el.querySelector<HTMLElement>("pre.json")!;
    expect(foot.contains(panel)).toBe(false);
    expect(panel.closest(".card")).not.toBeNull();
    expect(foot.nextElementSibling).toBe(panel);
    expect(toggle.getAttribute("aria-controls")).toBe(panel.id);
    expect(JSON.parse(panel.textContent!)).toEqual({ request: { ...request, ...meta.extraction }, response: { visualization: phases, meta } });
    click(toggle);
    expect(el.querySelector("pre.json")).toBeNull();
    expect(toggle.textContent).toBe("Show JSON");
    done();
  });

  it("shows a null request for an answer saved before requests were kept", () => {
    const { request: _, ...old } = answered(phases);
    const { el, button, click, done } = setup(old);
    click(button("Show JSON"));
    expect(JSON.parse(el.querySelector("pre.json")!.textContent!).request).toBeNull();
    done();
  });
});
