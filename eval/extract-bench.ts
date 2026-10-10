import { readFileSync } from "node:fs";
import { openAiExtractor } from "@chatctg/engine";

interface Case { q: string; entities?: { drugs?: string[]; conditions?: string[]; sponsors?: string[]; countries?: string[]; start_year?: number; end_year?: number; limit?: number } }
const cases = (JSON.parse(readFileSync(new URL("./queries.json", import.meta.url), "utf8")) as Case[]).filter((c) => c.entities);
const models = (process.env.BENCH_MODELS ?? "gpt-5.4-nano,gpt-4.1-nano").split(",");
const norm = (xs: string[] = []) => xs.map((x) => x.toLowerCase().trim()).sort();
const overlaps = (got: string[], exp: string[]) => exp.length === 0 ? got.length === 0 : exp.some((e) => got.some((g) => g.includes(e) || e.includes(g)));

for (const model of models) {
  const extract = openAiExtractor({ OPENAI_API_KEY: process.env.OPENAI_API_KEY, EXTRACTOR_MODEL: model });
  let ok = 0; const ms: number[] = []; const misses: string[] = [];
  for (const c of cases) {
    const r = await extract(c.q, "2026-10-09");
    if (!r.ok) { misses.push(`${c.q}: ${r.reason} ${r.detail ?? ""}`); continue; }
    ms.push(r.ms);
    const e = c.entities!; const g = r.entities;
    const good = overlaps(norm(g.drugs), norm(e.drugs)) && overlaps(norm(g.conditions), norm(e.conditions)) && overlaps(norm(g.sponsors), norm(e.sponsors)) && overlaps(norm(g.countries), norm(e.countries))
      && (e.start_year ?? null) === g.start_year && (e.end_year ?? null) === g.end_year && (e.limit ?? null) === g.limit;
    if (good) ok++; else misses.push(`${c.q}: got ${JSON.stringify(g)}`);
  }
  ms.sort((a, b) => a - b);
  console.log(`\n${model}: ${ok}/${cases.length} correct · p50 ${ms[Math.floor(ms.length / 2)] ?? 0} ms · p90 ${ms[Math.floor(ms.length * 0.9)] ?? 0} ms`);
  for (const m of misses) console.log(`  - ${m}`);
}
