// @vitest-environment jsdom
import type { Interpretation, Judged } from "@chatctg/contracts";
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
