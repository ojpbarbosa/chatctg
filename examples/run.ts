import { mkdirSync, writeFileSync } from "node:fs";
import { QueryRequest, type QueryRequestInput } from "@cheiron/contracts";
import { runQuery } from "@cheiron/engine";
import { depsFromEnv } from "../apps/api/src/deps";

const EXAMPLES: { slug: string; request: QueryRequestInput }[] = [
  { slug: "time-trend-pembrolizumab", request: { query: "How has the number of trials for this drug changed per year since 2015?", drug_name: "Pembrolizumab" } },
  { slug: "distribution-melanoma-phases", request: { query: "How are melanoma trials distributed across phases?" } },
  { slug: "comparison-pembrolizumab-nivolumab", request: { query: "Compare phases for trials involving pembrolizumab vs nivolumab" } },
  // The request names the chart, so this run always draws the map and shows the request-level chart override.
  { slug: "geographic-lupus-recruiting", request: { query: "Which countries have the most recruiting trials for lupus?", chart: "map" } },
  { slug: "network-sponsors-drugs-melanoma", request: { query: "Show a network of sponsors and drugs for melanoma trials", citations_per_datum: 3 } },
];

const deps = depsFromEnv();
const dir = new URL("./", import.meta.url);
mkdirSync(dir, { recursive: true });
const index: string[] = ["# Example runs", "", "Produced by `npm run examples` against the live APIs. Each file holds the request and the full response.", "", "| File | Question | Type | Total trials | Jev | Total |", "|---|---|---|---|---|---|"];
let failed = 0;
for (const ex of EXAMPLES) {
  const request = QueryRequest.parse(ex.request);
  const r = await runQuery(request, deps);
  writeFileSync(new URL(`./${ex.slug}.json`, dir), JSON.stringify({ request: ex.request, status: r.status, response: r.body }, null, 2));
  if (r.ok) index.push(`| [${ex.slug}.json](./${ex.slug}.json) | ${request.query} | ${r.body.visualization?.type} | ${r.body.meta.coverage.total_count.toLocaleString("en-US")} | ${r.body.meta.timing.jev_ms} ms | ${r.body.meta.timing.total_ms} ms |`);
  else { failed++; index.push(`| [${ex.slug}.json](./${ex.slug}.json) | ${request.query} | ERROR ${r.status} | | | |`); }
  console.log(ex.slug, r.status, r.ok ? r.body.visualization?.type : JSON.stringify(r.body));
}
writeFileSync(new URL("./README.md", dir), index.join("\n") + "\n");
if (failed) {
  console.error(`${failed} of ${EXAMPLES.length} example runs failed`);
  process.exitCode = 1;
}
