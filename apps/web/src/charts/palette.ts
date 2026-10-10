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

/** sRGB channels of "#rrggbb" or "rgb(r, g, b)". */
const channels = (c: string): number[] => (c.startsWith("#") ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number));
const luminance = (c: string): number => {
  const [r, g, b] = channels(c).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** The text colour a label set inside a fill needs: white or ink, whichever contrasts more with the fill. */
export function inkOn(fill: string): "#fff" | "var(--fg)" {
  const l = luminance(fill);
  return 1.05 / (l + 0.05) >= (l + 0.05) / (luminance("#0b0b0c") + 0.05) ? "#fff" : "var(--fg)";
}
