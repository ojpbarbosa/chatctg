import { describe, expect, it } from "vitest";
import { CHART_TYPES, DIMENSIONS, EDGE_KINDS, GRANULARITIES, INTENTS, METRICS, PHASES } from "@cheiron/contracts";
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

  it("builds a small state with only the provided fields", () => {
    expect(interpretationState("q", {})).toEqual({ question: "q", provided: {} });
    expect(interpretationState("q", { drugs: ["a"], start_year: 2015 })).toEqual({ question: "q", provided: { drugs: ["a"], start_year: 2015 } });
  });

  it("is versioned", () => {
    expect(QUESTION_SET).toEqual({ id: "query-interpretation", version: 2 });
  });
});
