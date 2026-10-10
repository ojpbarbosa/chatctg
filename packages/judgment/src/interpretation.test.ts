import { describe, expect, it } from "vitest";
import { CHART_TYPES, DIMENSIONS, EDGE_KINDS, GRANULARITIES, INTENTS, METRICS, PHASES } from "@chatctg/contracts";
import { interpretationQuestions, interpretationState, QUESTION_SET } from "./interpretation";

describe("interpretation questions", () => {
  const q = interpretationQuestions();

  it("asks the twelve questions", () => {
    expect(Object.keys(q).sort()).toEqual(["chart", "chart_named", "combination", "dimension", "edge_kind", "granularity", "in_scope", "intent", "metric", "phase_filter", "recruiting_only", "secondary_dimension"].sort());
  });

  it("uses exactly the contract enums as options", () => {
    expect(Object.keys(q.intent.criteria)).toEqual([...INTENTS]);
    expect(Object.keys(q.dimension.criteria)).toEqual([...DIMENSIONS]);
    expect(Object.keys(q.secondary_dimension.criteria)).toEqual([...DIMENSIONS]);
    expect(Object.keys(q.chart.criteria)).toEqual([...CHART_TYPES]);
    expect(Object.keys(q.granularity.criteria)).toEqual([...GRANULARITIES]);
    expect(Object.keys(q.metric.criteria)).toEqual([...METRICS]);
    expect(Object.keys(q.edge_kind.criteria)).toEqual([...EDGE_KINDS]);
    expect(Object.keys(q.phase_filter.criteria)).toEqual([...PHASES, "none"]);
  });

  it("gives every option a what, and every choice a way out", () => {
    for (const [id, question] of Object.entries(q)) {
      if (question.type !== "choice") continue;
      for (const [option, c] of Object.entries(question.criteria)) {
        expect(c, `${id}.${option}`).not.toBeNull();
        if (typeof c === "object" && c) expect(c, `${id}.${option}`).toHaveProperty("what");
      }
    }
    expect(q.intent.criteria).toHaveProperty("other");
    expect(q.dimension.criteria).toHaveProperty("none");
    expect(q.phase_filter.criteria).toHaveProperty("none");
  });

  it("says what each grid, timeline and flow chart is for, and what it is not for", () => {
    for (const chart of CHART_TYPES.slice(10)) {
      const c = q.chart.criteria[chart] as { what: string; not_for: string };
      expect(c.what.length, chart).toBeGreaterThan(20);
      expect(c.not_for.length, chart).toBeGreaterThan(10);
    }
    expect(CHART_TYPES.slice(10).length).toBeGreaterThan(0);
  });

  it("routes timelines and schedules to the timeline, and counts a timeline of trials as a lookup", () => {
    const timeline = q.chart.criteria.timeline as { what: string; examples: string[] };
    expect(timeline.what).toMatch(/start date to its primary completion date/);
    expect(timeline.examples.join(" ")).toMatch(/timeline/); expect(timeline.examples.join(" ")).toMatch(/schedule/); expect(timeline.examples.join(" ")).toMatch(/start and end/);
    expect((q.intent.criteria.lookup as { what: string }).what).toMatch(/timeline/);
  });

  it("builds a small state with only the provided fields", () => {
    expect(interpretationState("q", {})).toEqual({ question: "q", provided: {} });
    expect(interpretationState("q", { drugs: ["a"], start_year: 2015 })).toEqual({ question: "q", provided: { drugs: ["a"], start_year: 2015 } });
  });

  it("is versioned", () => {
    expect(QUESTION_SET).toEqual({ id: "query-interpretation", version: 3 });
  });
});
