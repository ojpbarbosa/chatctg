import type { Answer, AnswersFor, FailureReason, JsonValue, JudgmentClient, JudgmentRequest, JudgmentResult, Question, QuestionMap, Usage } from "./types";

export const USD_PER_MILLION_INPUT_TOKENS = 0.042;
export const MAX_STATE_TOKENS = 32_000;
export const costUsd = (inputTokens: number): number => (inputTokens * USD_PER_MILLION_INPUT_TOKENS) / 1_000_000;
/** Pessimistic: three characters per token keeps the estimate above the real count. */
export const estimateTokens = (value: JsonValue): number => Math.ceil((typeof value === "string" ? value : JSON.stringify(value)).length / 3);
export const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, requests: 0, costUsd: 0 };
const addUsage = (a: Usage, b: Usage): Usage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, requests: a.requests + b.requests, costUsd: a.costUsd + b.costUsd });

export interface HttpJudgmentConfig {
  apiKey: string; baseUrl?: string; model?: string;
  timeoutMs?: number; maxRetries?: number; backoffMs?: number;
  fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; random?: () => number;
}

const RETRYABLE: Record<number, FailureReason> = { 429: "rate_limited", 529: "overloaded" };
const FATAL: Record<number, FailureReason> = { 400: "invalid_request", 401: "unauthorized", 403: "unauthorized", 422: "invalid_request" };

export class HttpJudgmentClient implements JudgmentClient {
  readonly enabled = true;
  readonly model: string;
  private readonly url: string; private readonly timeoutMs: number; private readonly maxRetries: number; private readonly backoffMs: number;
  private readonly http: typeof fetch; private readonly sleep: (ms: number) => Promise<void>; private readonly now: () => number; private readonly random: () => number;

  constructor(private readonly cfg: HttpJudgmentConfig) {
    this.url = `${(cfg.baseUrl ?? "https://api.typesafe.ai").replace(/\/+$/, "")}/v1/systemone`;
    this.model = cfg.model ?? "jev-latest";
    this.timeoutMs = cfg.timeoutMs ?? 5_000; this.maxRetries = cfg.maxRetries ?? 2; this.backoffMs = cfg.backoffMs ?? 300;
    this.http = cfg.fetch ?? fetch; this.sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = cfg.now ?? Date.now; this.random = cfg.random ?? Math.random;
  }

  async ask<Q extends QuestionMap>(req: JudgmentRequest<Q>): Promise<JudgmentResult<Q>> {
    const started = this.now();
    let usage = NO_USAGE;
    const fail = (reason: FailureReason, detail?: string): JudgmentResult<Q> => ({ ok: false, reason, ...(detail ? { detail } : {}), usage, ms: this.now() - started });
    if (!Object.keys(req.questions).length) return fail("invalid_request", "no questions");
    if (estimateTokens(req.state) > MAX_STATE_TOKENS) return fail("state_too_large");
    const body = JSON.stringify({ state: req.state, model: this.model, questions: req.questions });
    let last: { reason: FailureReason; detail?: string } = { reason: "network" };
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (req.signal?.aborted) return fail("timeout", "aborted by caller");
      usage = addUsage(usage, { ...NO_USAGE, requests: 1 });
      const tried = await this.once(body, req.signal);
      if (tried.kind === "response") {
        const parsed = parseAnswers(tried.json, req.questions);
        if (!parsed.ok) return fail("bad_response", parsed.detail);
        usage = addUsage(usage, { inputTokens: parsed.inputTokens, outputTokens: parsed.outputTokens, requests: 0, costUsd: costUsd(parsed.inputTokens) });
        return { ok: true, answers: parsed.answers as AnswersFor<Q>, usage, model: parsed.model, ms: this.now() - started };
      }
      last = { reason: tried.reason, ...(tried.detail ? { detail: tried.detail } : {}) };
      if (!tried.retryable || attempt === this.maxRetries) break;
      const ceiling = this.backoffMs * 2 ** attempt;
      await this.sleep(Math.max(tried.retryAfterMs ?? 0, Math.round(ceiling * (0.5 + this.random() / 2))));
    }
    return fail(last.reason, last.detail);
  }

  private async once(body: string, outer?: AbortSignal): Promise<
    | { kind: "response"; json: unknown }
    | { kind: "failure"; reason: FailureReason; detail?: string; retryable: boolean; retryAfterMs?: number }
  > {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = outer ? AbortSignal.any([outer, timeout]) : timeout;
    let res: Response;
    try {
      res = await this.http(this.url, { method: "POST", headers: { authorization: `Bearer ${this.cfg.apiKey}`, "content-type": "application/json" }, body, signal });
    } catch (e) {
      const timedOut = timeout.aborted || (e instanceof Error && e.name === "TimeoutError");
      return { kind: "failure", reason: timedOut ? "timeout" : "network", detail: String(e), retryable: !outer?.aborted };
    }
    if (res.ok) {
      try { return { kind: "response", json: await res.json() }; } catch (e) { return { kind: "failure", reason: "bad_response", detail: String(e), retryable: false }; }
    }
    const detail = await res.text().then((t) => t.slice(0, 300)).catch(() => "");
    const fatal = FATAL[res.status];
    if (fatal) return { kind: "failure", reason: fatal, detail, retryable: false };
    const retryAfter = Number(res.headers.get("retry-after"));
    return {
      kind: "failure", reason: RETRYABLE[res.status] ?? "server_error", detail, retryable: res.status === 429 || res.status >= 500,
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterMs: Math.min(retryAfter * 1000, 30_000) } : {}),
    };
  }
}

const probability = (n: unknown): n is number => typeof n === "number" && n >= 0 && n <= 1;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const PROBABILITY_SUM_TOLERANCE = 0.02;

/** Keys must be exactly the options asked, each a probability, mass summing to 1 (within rounding). */
function distribution(value: unknown, options: readonly string[]): Record<string, number> | null {
  if (!isRecord(value) || Object.keys(value).length !== options.length) return null;
  let mass = 0;
  for (const option of options) { const p = value[option]; if (!probability(p)) return null; mass += p; }
  return Math.abs(mass - 1) <= PROBABILITY_SUM_TOLERANCE ? (value as Record<string, number>) : null;
}

/** Every requested question must come back with the type that was asked and numbers in range; otherwise the whole set is bad. */
export function parseAnswers(json: unknown, questions: QuestionMap):
  | { ok: true; answers: Record<string, Answer>; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; detail: string } {
  if (!isRecord(json) || !isRecord(json.answers)) return { ok: false, detail: "no answers object" };
  const answers: Record<string, Answer> = {};
  for (const [id, q] of Object.entries(questions)) {
    const parsed = parseOne(json.answers[id], q);
    if (typeof parsed === "string") return { ok: false, detail: `answer for "${id}": ${parsed}` };
    answers[id] = parsed;
  }
  const usage = isRecord(json.usage) ? json.usage : {};
  return { ok: true, answers, model: typeof json.model === "string" ? json.model : "unknown",
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0, outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0 };
}

function parseOne(a: unknown, q: Question): Answer | string {
  if (!isRecord(a)) return "missing";
  if (a.type !== q.type) return `is a ${String(a.type)}, and a ${q.type} was asked`;
  if (q.type === "noul") return probability(a.noul) ? { type: "noul", noul: a.noul } : "noul is not a probability";
  const confidence = a.confidence === undefined || a.confidence === null ? 0 : a.confidence;
  if (!probability(confidence)) return "confidence is not a probability";
  const options = Object.keys(q.criteria);
  const probabilities = distribution(a.probabilities, options);
  if (!probabilities) return `probabilities do not cover ${options.length} options, or do not sum to 1`;
  if (typeof a.choice !== "string" || !(a.choice in q.criteria)) return "choice is not one of the options";
  return { type: "choice", choice: a.choice, probabilities, confidence };
}

export class DisabledJudgmentClient implements JudgmentClient {
  readonly enabled = false; readonly model = "disabled";
  async ask<Q extends QuestionMap>(): Promise<JudgmentResult<Q>> { return { ok: false, reason: "disabled", detail: "TYPESAFE_API_KEY is not set", usage: NO_USAGE, ms: 0 }; }
}

export function judgmentClientFromEnv(env: Record<string, string | undefined> = process.env, overrides: Partial<HttpJudgmentConfig> = {}): JudgmentClient {
  const apiKey = env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) return new DisabledJudgmentClient();
  return new HttpJudgmentClient({ apiKey, ...(env.TYPESAFE_BASE_URL ? { baseUrl: env.TYPESAFE_BASE_URL } : {}), ...(env.TYPESAFE_MODEL ? { model: env.TYPESAFE_MODEL } : {}), ...overrides });
}

/** The k most probable options, descending. */
export function topK(probabilities: Record<string, number>, k: number): { value: string; p: number }[] {
  return Object.entries(probabilities).sort(([, a], [, b]) => b - a).slice(0, k).map(([value, p]) => ({ value, p }));
}
