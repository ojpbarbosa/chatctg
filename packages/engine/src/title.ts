import { responsesCall, TITLER_MODEL, type OpenAiEnv } from "./openai";

export type Titler = (summary: string, signal?: AbortSignal) => Promise<{ title: string | null; ms: number }>;

/** gpt-5 models spend reasoning tokens from the same budget as the answer, so the cap leaves room for both. */
export const TITLER_MAX_OUTPUT_TOKENS = 300;

/**
 * Titles the subject, not the chart: earlier titles named the chart and repeated themselves ("... Network by Sponsor-Drug Pairs").
 * The examples use other entities than the demo questions, so they teach the shapes, not the answers.
 */
const TITLE_INSTRUCTIONS = [
  "Write a title of six to twelve words for the data described; fewer is fine when it says everything.",
  "Title the subject, not the chart: never name the chart type (bar, line, histogram, scatter, network, graph, map, table, single value) and never use the word chart.",
  "Never repeat a word or a phrase. Use 'by' only before an attribute the data is split by.",
  "Sentence case: capitalize only the first word, names and acronyms. Plain text: no quotes, no trailing period. No dashes, middots or colons. Add no fact that is not in the description.",
  "Prefer these shapes: '<Entity> trials by <attribute>', '<Entity> trials per year since <year>', 'Recruiting <entity> trials'. Examples:",
  "'A bar chart of the number of trials by phase, for asthma trials.' -> Asthma trials by phase.",
  "'A line chart of the number of trials per year, for nivolumab trials, started from 2018.' -> Nivolumab trials per year since 2018.",
  "'A map chart of the number of trials by country, for recruiting asthma trials.' -> Recruiting asthma trials by country.",
  "'A network graph chart of which sponsors test which drugs, for breast cancer trials.' -> Sponsors and the drugs they test in breast cancer trials.",
  "'The total number of recruiting phase 2 asthma trials.' -> Recruiting phase 2 asthma trials.",
].join(" ");

export function openAiTitler(env: OpenAiEnv, http: typeof fetch = fetch): Titler {
  const model = env.TITLER_MODEL ?? TITLER_MODEL;
  return async (summary, signal) => {
    const r = await responsesCall({ env, http, model, system: TITLE_INSTRUCTIONS, user: summary, maxOutputTokens: TITLER_MAX_OUTPUT_TOKENS, timeoutMs: 4_000, ...(signal ? { signal } : {}) });
    if (!r.ok) return { title: null, ms: r.ms };
    // An em-dash, en-dash or middot that slips through becomes a comma, as everywhere else the service writes.
    const title = r.text.trim().replace(/^["'“”]+|["'“”]+$/g, "").replace(/[.。]+$/, "").trim().replace(/\s*[\u2014\u2013\u00b7]\s*/g, ", ");
    return { title: title.length >= 3 && title.length <= 120 ? title : null, ms: r.ms };
  };
}

export const fakeTitler = (title: string | null): Titler => async () => ({ title, ms: 0 });
