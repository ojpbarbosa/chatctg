export const EXTRACTOR_MODEL = "gpt-5.4-nano";
export const TITLER_MODEL = "gpt-5.4-nano";
/** Lowest effort the gpt-5 family accepts; omitted for other families. */
const REASONING_EFFORT = "none";

export type OpenAiFailure = "missing_api_key" | "openai_timeout" | "openai_network" | "openai_http" | "openai_incomplete" | "openai_invalid_json" | "openai_invalid_shape";
export interface OpenAiEnv { OPENAI_API_KEY?: string; OPENAI_BASE_URL?: string; EXTRACTOR_MODEL?: string; TITLER_MODEL?: string }
type Rec = Record<string, unknown>;
const rec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

/** One Responses API request; the output text, or a typed failure. Retries once on 429 and 5xx. */
export async function responsesCall(opts: {
  env: OpenAiEnv; http?: typeof fetch; model: string; system: string; user: string;
  schema?: { name: string; schema: Record<string, unknown> }; maxOutputTokens: number; timeoutMs: number; signal?: AbortSignal;
}): Promise<{ ok: true; text: string; ms: number } | { ok: false; reason: OpenAiFailure; detail?: string; ms: number }> {
  const started = Date.now();
  const ms = () => Date.now() - started;
  const key = opts.env.OPENAI_API_KEY?.trim();
  if (!key) return { ok: false, reason: "missing_api_key", detail: "OPENAI_API_KEY is not set", ms: ms() };
  const http = opts.http ?? fetch;
  const url = `${(opts.env.OPENAI_BASE_URL ?? "https://api.openai.com").replace(/\/+$/, "")}/v1/responses`;
  const body = JSON.stringify({
    model: opts.model, store: false, max_output_tokens: opts.maxOutputTokens,
    ...(opts.model.startsWith("gpt-5") ? { reasoning: { effort: REASONING_EFFORT } } : {}),
    input: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
    ...(opts.schema ? { text: { format: { type: "json_schema", name: opts.schema.name, strict: true, schema: opts.schema.schema } } } : {}),
  });
  let last: { reason: OpenAiFailure; detail?: string } = { reason: "openai_network" };
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = AbortSignal.timeout(opts.timeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await http(url, { method: "POST", signal, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body });
    } catch (e) {
      last = { reason: timeout.aborted ? "openai_timeout" : "openai_network", detail: String(e) };
      if (opts.signal?.aborted) break; continue;
    }
    if (!res.ok) {
      // An auth failure's body can echo part of the key, and the detail reaches the caller, so only the status is kept.
      const auth = res.status === 401 || res.status === 403;
      if (auth) await res.body?.cancel().catch(() => undefined);
      last = { reason: "openai_http", detail: auth ? String(res.status) : `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}` };
      if (res.status === 429 || res.status >= 500) continue;
      break;
    }
    let json: unknown;
    try { json = await res.json(); } catch (e) { return { ok: false, reason: "openai_invalid_json", detail: String(e), ms: ms() }; }
    if (!rec(json) || json.status !== "completed" || !Array.isArray(json.output)) return { ok: false, reason: "openai_incomplete", detail: rec(json) ? String(json.status) : "no body", ms: ms() };
    const text = json.output.flatMap((o) => (rec(o) && o.type === "message" && Array.isArray(o.content) ? o.content.flatMap((c) => (rec(c) && c.type === "output_text" && typeof c.text === "string" ? [c.text] : [])) : [])).join("");
    return { ok: true, text, ms: ms() };
  }
  return { ok: false, ...last, ms: ms() };
}
