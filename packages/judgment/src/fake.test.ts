import { describe, expect, it } from "vitest";
import { FakeJudgmentClient } from "./fake";
import { choice, noul } from "./questions";

const questions = { kind: choice("Which?", { a: null, b: null, c: null }), yes: noul("Is it?") };

describe("FakeJudgmentClient", () => {
  it("answers unscripted questions as cannot-tell", async () => {
    const r = await new FakeJudgmentClient().ask({ state: "s", questions });
    if (!r.ok) throw new Error("expected ok");
    expect(r.answers.yes.noul).toBe(0.5);
    expect(r.answers.kind.choice).toBe("c");
    expect(r.answers.kind.confidence).toBe(0);
    for (const p of Object.values(r.answers.kind.probabilities)) expect(p).toBeCloseTo(1 / 3, 9);
  });
  it("scripts a choice with a normalized distribution over exactly the options", async () => {
    const r = await new FakeJudgmentClient({ kind: { choice: "a", confidence: 0.8 } }).ask({ state: "s", questions });
    if (!r.ok) throw new Error("expected ok");
    const p = r.answers.kind.probabilities;
    expect(r.answers.kind.choice).toBe("a");
    expect(Object.keys(p).sort()).toEqual(["a", "b", "c"]);
    expect(Math.abs(Object.values(p).reduce((x, y) => x + y, 0) - 1)).toBeLessThan(1e-9);
  });
});
