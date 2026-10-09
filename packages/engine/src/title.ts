import { responsesCall, TITLER_MODEL, type OpenAiEnv } from "./openai";

export type Titler = (summary: string, signal?: AbortSignal) => Promise<{ title: string | null; ms: number }>;

const TITLE_INSTRUCTIONS = "Write a chart title of six to twelve words for the chart described. Plain text: no quotes, no trailing period, sentence case. Name the entities and the measure. Do not add facts that are not in the description.";

export function openAiTitler(env: OpenAiEnv, http: typeof fetch = fetch): Titler {
  const model = env.TITLER_MODEL ?? TITLER_MODEL;
  return async (summary, signal) => {
    const r = await responsesCall({ env, http, model, system: TITLE_INSTRUCTIONS, user: summary, maxOutputTokens: 60, timeoutMs: 4_000, ...(signal ? { signal } : {}) });
    if (!r.ok) return { title: null, ms: r.ms };
    const title = r.text.trim().replace(/^["'“”]+|["'“”]+$/g, "").replace(/[.。]+$/, "").trim();
    return { title: title.length >= 3 && title.length <= 120 ? title : null, ms: r.ms };
  };
}

export const fakeTitler = (title: string | null): Titler => async () => ({ title, ms: 0 });
