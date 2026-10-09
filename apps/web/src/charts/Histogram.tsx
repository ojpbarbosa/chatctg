import type { BarViz, HistogramViz } from "@cheiron/contracts";
import { BarView } from "./Bar";
import type { OnPick } from "./index";
import type { Size } from "./common";

/** A histogram is a single-series vertical bar chart over ordered bins, with the bars touching. */
export function HistogramView({ viz, onPick, width, height }: { viz: HistogramViz; onPick: OnPick } & Size) {
  const { x, y } = viz.encoding;
  const asBar: BarViz = {
    ...viz,
    type: "bar",
    encoding: { x: { field: x.field, type: "ordinal", label: x.label, order: x.bins.map((b) => b.label) }, y, orientation: "vertical", sort: "x_order" },
  };
  return <BarView viz={asBar} onPick={onPick} gap="4%" radius={0} width={width} height={height} />;
}
