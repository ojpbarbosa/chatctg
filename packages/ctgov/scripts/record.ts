import { mkdirSync, writeFileSync } from "node:fs";
import { buildStudiesUrl } from "../src/url";

const FIXTURES: Record<string, Parameters<typeof buildStudiesUrl>[0]> = {
  "pembrolizumab-p1": { intr: '"pembrolizumab"', pageSize: 50, countTotal: true, sort: "StartDate:desc" },
  "melanoma-p1": { cond: '"melanoma"', pageSize: 50, countTotal: true, sort: "StartDate:desc" },
};

mkdirSync(new URL("../fixtures/", import.meta.url), { recursive: true });
for (const [name, q] of Object.entries(FIXTURES)) {
  const url = buildStudiesUrl(q);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const json = (await res.json()) as { studies: unknown[]; totalCount?: number };
  writeFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), JSON.stringify({ url, recorded_at: new Date().toISOString(), page: json }, null, 1));
  console.log(`${name}: ${json.studies.length} studies of ${json.totalCount}`);
}
