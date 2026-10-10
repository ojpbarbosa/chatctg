import { readFileSync, writeFileSync } from "node:fs";
import { interpretationQuestions, interpretationState, judgmentClientFromEnv, QUESTION_SET, type InterpretationAnswers } from "@chatctg/judgment";

interface Case { q: string; intent?: string[]; dimension?: string[]; secondary_dimension?: string[]; edge_kind?: string[]; metric?: string[]; phase_filter?: string[]; chart?: string[]; flags?: Record<string, boolean>; entities?: Record<string, unknown> }
const cases = JSON.parse(readFileSync(new URL("./queries.json", import.meta.url), "utf8")) as Case[];
const judge = judgmentClientFromEnv();
if (!judge.enabled) { console.error("TYPESAFE_API_KEY is not set"); process.exit(1); }

const rows: string[] = []; const latencies: number[] = []; let hits = 0, checks = 0; const confusions: string[] = [];
for (const c of cases) {
  const r = await judge.ask({ state: interpretationState(c.q, {}), questions: interpretationQuestions() });
  if (!r.ok) { rows.push(`| ${c.q} | FAILED ${r.reason} | | | | |`); continue; }
  const a = r.answers as InterpretationAnswers; latencies.push(r.ms);
  // A second grouping equal to the dimension is no second grouping, so it never agrees, whatever the labels allow.
  const twice = (key: keyof Case, got: string) => key === "secondary_dimension" && got === a.dimension.choice;
  const cell = (key: keyof Case, got: string, p: number) => { const exp = c[key] as string[] | undefined; if (!exp) return `${got} (${p.toFixed(2)})`; checks++; const ok = exp.includes(got) && !twice(key, got); if (ok) hits++; else confusions.push(`${c.q}: ${String(key)} expected ${exp.join("|")}${twice(key, got) ? " other than the dimension" : ""}, got ${got} (${p.toFixed(2)})`); return `${ok ? "✓" : "✗"} ${got} (${p.toFixed(2)})`; };
  const flagCell = Object.entries(c.flags ?? {}).map(([k, v]) => { const n = (a[k as keyof InterpretationAnswers] as { noul: number }).noul; checks++; const ok = v ? n >= 0.5 : n < 0.5; if (ok) hits++; else confusions.push(`${c.q}: ${k} expected ${v}, got ${n.toFixed(2)}`); return `${ok ? "✓" : "✗"} ${k}=${n.toFixed(2)}`; }).join(" ");
  const other = (["secondary_dimension", "metric", "edge_kind", "phase_filter"] as const).filter((k) => c[k]).map((k) => { const x = a[k] as { choice: string; probabilities: Record<string, number> }; return cell(k, x.choice, x.probabilities[x.choice] ?? 0).replace(/ (\S+) \(/, ` ${k}=$1 (`); }).join(" ");
  rows.push(`| ${c.q} | ${cell("intent", a.intent.choice, a.intent.probabilities[a.intent.choice] ?? 0)} | ${cell("dimension", a.dimension.choice, a.dimension.probabilities[a.dimension.choice] ?? 0)} | ${cell("chart", a.chart.choice, a.chart.probabilities[a.chart.choice] ?? 0)} | ${flagCell} | ${other} | ${r.ms} |`);
}
latencies.sort((x, y) => x - y);
const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] ?? 0;
const report = [
  `# Jev agreement on ${cases.length} labelled questions`, "", `Run: ${new Date().toISOString()}, model: ${judge.model}, question set: ${QUESTION_SET.id} v${QUESTION_SET.version}, agreement: ${hits}/${checks} (${Math.round((100 * hits) / Math.max(1, checks))}%), latency p50 ${pct(0.5)} ms and p90 ${pct(0.9)} ms`, "",
  "| Question | Intent | Dimension | Chart | Flags | Other | ms |", "|---|---|---|---|---|---|---|", ...rows, "",
  "## Disagreements", "", ...(confusions.length ? confusions.map((x) => `- ${x}`) : ["None."]), "",
].join("\n");
writeFileSync(new URL("./report.md", import.meta.url), report);
console.log(report);
