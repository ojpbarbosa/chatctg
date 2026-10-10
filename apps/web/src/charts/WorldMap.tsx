import { useEffect, useMemo, useState } from "react";
import type { MapViz } from "@chatctg/contracts";
import { geoEqualEarth, geoPath } from "d3-geo";
import countries from "i18n-iso-countries";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";   // add "@types/topojson-specification"
import type { OnPick } from "./index";
import { sequential } from "./palette";
import { countLabel, fmt } from "./common";

type Feat = GeoJSON.Feature<GeoJSON.Geometry, { name?: string }> & { id?: string | number };

export function WorldMapView({ viz, onPick }: { viz: MapViz; onPick: OnPick }) {
  const [feats, setFeats] = useState<Feat[] | null>(null);
  useEffect(() => { let on = true; import("world-atlas/countries-110m.json").then((m) => { const topo = (m.default ?? m) as unknown as Topology; const fc = feature(topo, topo.objects.countries as GeometryCollection) as unknown as GeoJSON.FeatureCollection; if (on) setFeats(fc.features as Feat[]); }); return () => { on = false; }; }, []);
  const field = viz.encoding.value.field;
  const byNumeric = useMemo(() => { const m = new Map<string, MapViz["data"][number]>(); for (const r of viz.data) { const iso = r.iso3 ? countries.alpha3ToNumeric(String(r.iso3)) : null; if (iso) m.set(String(Number(iso)), r); } return m; }, [viz]);
  const max = Math.max(1, ...viz.data.map((r) => Number(r[field]) || 0));
  const W = 960, H = 480;
  const path = useMemo(() => geoPath(geoEqualEarth().fitSize([W, H], { type: "Sphere" })), []);
  const unmapped = viz.data.filter((r) => !r.iso3);
  if (!feats) return <div className="chart skeleton" style={{ height: H }} />;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={viz.title} style={{ display: "block" }}>
        <path d={path({ type: "Sphere" }) ?? ""} fill="var(--raised)" />
        {feats.map((f, i) => { const row = f.id === undefined || f.id === null ? undefined : byNumeric.get(String(Number(f.id))); const v = row ? Number(row[field]) : 0;
          return <path key={f.id ?? `f${i}`} d={path(f) ?? ""} fill={row ? sequential(0.15 + 0.85 * Math.sqrt(v / max)) : "#eceef2"} stroke="var(--bg)" strokeWidth={0.5} style={{ cursor: row ? "pointer" : "default" }} onClick={() => row && onPick(row.citations, countLabel(String(row.country), v, viz.encoding.value.unit))}><title>{row ? countLabel(String(row.country), v, viz.encoding.value.unit) : f.properties?.name ?? ""}</title></path>; })}
      </svg>
      <div className="foot" style={{ borderTop: 0, paddingTop: 4 }}>
        <span>Top: {[...viz.data].sort((a, b) => Number(b[field]) - Number(a[field])).slice(0, 5).map((r) => `${r.country} ${fmt(r[field])}`).join(", ")}</span>
        {unmapped.length > 0 && <span>Not on the map: {unmapped.map((r) => `${r.country} ${fmt(r[field])}`).join(", ")}</span>}
      </div>
    </div>
  );
}
