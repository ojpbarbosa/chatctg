import { z } from "zod";
import { Citation, DataRow } from "./citation";
import { GRANULARITIES } from "./enums";

const unit = z.enum(["trials", "participants"]);
const QuantAxis = z.object({ field: z.string(), type: z.literal("quantitative"), label: z.string(), unit });
const CatAxis = z.object({ field: z.string(), type: z.enum(["nominal", "ordinal"]), label: z.string(), order: z.array(z.string()).optional() });
const TemporalAxis = z.object({ field: z.string(), type: z.literal("temporal"), granularity: z.enum(GRANULARITIES), label: z.string() });
const Series = z.object({ field: z.string(), label: z.string(), values: z.array(z.string()) });
/** A measured value carried by a mark's size or colour rather than by an axis. */
const Measure = z.object({ field: z.string(), label: z.string(), unit });
const head = { title: z.string(), subtitle: z.string() };

const barEncoding = z.object({ x: CatAxis, y: QuantAxis, orientation: z.enum(["vertical", "horizontal"]), sort: z.enum(["x_order", "value_desc"]) });

export const BarViz = z.object({ type: z.literal("bar"), ...head, encoding: barEncoding, data: z.array(DataRow) });
export const GroupedBarViz = z.object({ type: z.literal("grouped_bar"), ...head, encoding: barEncoding.extend({ series: Series }), data: z.array(DataRow) });
export const StackedBarViz = z.object({ type: z.literal("stacked_bar"), ...head, encoding: barEncoding.extend({ series: Series }), data: z.array(DataRow) });
export const LineViz = z.object({ type: z.literal("line"), ...head, encoding: z.object({ x: TemporalAxis, y: QuantAxis, series: Series.optional() }), data: z.array(DataRow) });
export const HistogramViz = z.object({
  type: z.literal("histogram"), ...head,
  encoding: z.object({ x: z.object({ field: z.string(), type: z.literal("ordinal"), label: z.string(), bins: z.array(z.object({ label: z.string(), min: z.number(), max: z.number().nullable() })) }), y: QuantAxis }),
  data: z.array(DataRow),
});
export const ScatterViz = z.object({
  type: z.literal("scatter"), ...head,
  encoding: z.object({
    x: z.object({ field: z.string(), type: z.enum(["temporal", "quantitative"]), label: z.string() }),
    y: z.object({ field: z.string(), type: z.literal("quantitative"), label: z.string(), unit }),
    color: z.object({ field: z.string(), label: z.string(), values: z.array(z.string()) }).optional(),
    series: Series.optional(),
    point_id: z.literal("nct_id"),
  }),
  data: z.array(DataRow),
});
export const NetworkViz = z.object({
  type: z.literal("network_graph"), ...head,
  encoding: z.object({
    nodes: z.object({ id_field: z.literal("id"), label_field: z.literal("label"), kind_field: z.literal("kind"), size_field: z.literal("size"), kinds: z.array(z.object({ kind: z.string(), label: z.string() })) }),
    edges: z.object({ source_field: z.literal("source"), target_field: z.literal("target"), weight_field: z.literal("weight") }),
    layout: z.literal("force"),
  }),
  data: z.object({
    nodes: z.array(z.object({ id: z.string(), label: z.string(), kind: z.string(), size: z.number(), study_count: z.number().int() })),
    edges: z.array(z.object({ source: z.string(), target: z.string(), weight: z.number(), study_count: z.number().int(), citations: z.array(Citation) })),
  }),
});
export const MapViz = z.object({
  type: z.literal("map"), ...head,
  encoding: z.object({ geo: z.object({ field: z.literal("country"), code_field: z.literal("iso3"), level: z.literal("country") }), value: z.object({ field: z.string(), label: z.string(), unit }) }),
  data: z.array(DataRow),
});
export const TableViz = z.object({
  type: z.literal("table"), ...head,
  encoding: z.object({ columns: z.array(z.object({ field: z.string(), label: z.string(), type: z.enum(["string", "number", "date", "list"]) })), sort: z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }) }),
  data: z.array(DataRow),
});
export const SingleValueViz = z.object({
  type: z.literal("single_value"), ...head,
  encoding: z.object({ value: z.object({ field: z.string(), label: z.string(), unit }) }),
  data: z.array(DataRow).length(1),
});

/** Two categorical axes and one circle per pair of categories, its area proportional to the value. Rows: `{ x, x_key, y, y_key, [size.field] }`. */
export const BubbleViz = z.object({
  type: z.literal("bubble"), ...head,
  encoding: z.object({ x: CatAxis, y: CatAxis, size: Measure }),
  data: z.array(DataRow),
});

/** The same grid with every cell shaded by its value on a sequential ramp. Rows: `{ x, x_key, y, y_key, [color.field] }`. */
export const HeatmapViz = z.object({
  type: z.literal("heatmap"), ...head,
  encoding: z.object({ x: CatAxis, y: CatAxis, color: Measure }),
  data: z.array(DataRow),
});

export const Visualization = z.discriminatedUnion("type", [
  BarViz, GroupedBarViz, StackedBarViz, LineViz, HistogramViz, ScatterViz, NetworkViz, MapViz, TableViz, SingleValueViz,
  BubbleViz, HeatmapViz,
]);
export type Visualization = z.infer<typeof Visualization>;
export type BarViz = z.infer<typeof BarViz>;
export type GroupedBarViz = z.infer<typeof GroupedBarViz>;
export type StackedBarViz = z.infer<typeof StackedBarViz>;
export type LineViz = z.infer<typeof LineViz>;
export type HistogramViz = z.infer<typeof HistogramViz>;
export type ScatterViz = z.infer<typeof ScatterViz>;
export type NetworkViz = z.infer<typeof NetworkViz>;
export type MapViz = z.infer<typeof MapViz>;
export type TableViz = z.infer<typeof TableViz>;
export type SingleValueViz = z.infer<typeof SingleValueViz>;
export type BubbleViz = z.infer<typeof BubbleViz>;
export type HeatmapViz = z.infer<typeof HeatmapViz>;
