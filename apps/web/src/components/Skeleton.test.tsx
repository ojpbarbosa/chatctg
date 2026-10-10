// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ChartSkeleton } from "./Skeleton";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The skeleton's shape and how many placeholder pieces it draws. */
function ghost(type: string): { shape: string | null; pieces: number } {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  act(() => root.render(<ChartSkeleton type={type} />));
  const out = { shape: el.querySelector("[aria-busy]")!.getAttribute("data-shape"), pieces: el.querySelectorAll(".skeleton").length };
  act(() => root.unmount());
  el.remove();
  return out;
}

describe("ChartSkeleton", () => {
  it("draws the shape of the chart that is coming", () => {
    expect(ghost("bar")).toEqual({ shape: "bars", pieces: 6 });
    expect(ghost("bubble")).toEqual({ shape: "bubble", pieces: 18 });
    expect(ghost("heatmap")).toEqual({ shape: "heatmap", pieces: 18 });
    expect(ghost("timeline")).toEqual({ shape: "timeline", pieces: 6 });
    expect(ghost("map")).toEqual({ shape: "block", pieces: 1 });
  });
});
