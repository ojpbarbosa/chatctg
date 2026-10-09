import { interpolateRgb } from "d3-interpolate";

export const BRAND = "#1f4fff";
/**
 * Blue first, then hues spaced for distinguishability on white. Passes the dataviz validator
 * (lightness band, chroma floor, adjacent CVD separation, normal-vision floor, 3:1 contrast).
 */
export const CATEGORICAL = ["#1f4fff", "#e4572e", "#0f9d8a", "#b8860b", "#9b5de5", "#c2185b", "#6b8e23", "#0a8ac2"];
export const colorFor = (i: number): string => CATEGORICAL[i % CATEGORICAL.length]!;
const ramp = interpolateRgb("#e9eeff", BRAND);
export const sequential = (t: number): string => ramp(Math.max(0, Math.min(1, t)));
export const GRID = "rgba(16, 24, 40, 0.08)";
export const AXIS = "#8a8f9c";
