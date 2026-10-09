import { costUsd, estimateTokens } from "./client";
import type { Answer, AnswersFor, FailureReason, JudgmentClient, JudgmentRequest, JudgmentResult, Question, QuestionMap } from "./types";

export type Scripted = { noul: number } | { choice: string; confidence?: number };
export type Script = Record<string, Scripted> | ((id: string, question: Question, req: JudgmentRequest) => Scripted | undefined);

/** Deterministic and offline. Unscripted questions answer "cannot tell" (0.5, or the last option, flat). */
export class FakeJudgmentClient implements JudgmentClient {
  readonly enabled = true; readonly model = "fake";
  readonly requests: JudgmentRequest[] = [];
  private failure: FailureReason | null = null;
  constructor(private script: Script = {}) {}
  failWith(reason: FailureReason | null): void { this.failure = reason; }

  async ask<Q extends QuestionMap>(req: JudgmentRequest<Q>): Promise<JudgmentResult<Q>> {
    this.requests.push(req);
    const inputTokens = estimateTokens(req.state) + estimateTokens(req.questions as never);
    const usage = { inputTokens, outputTokens: 0, requests: 1, costUsd: costUsd(inputTokens) };
    if (this.failure) return { ok: false, reason: this.failure, usage, ms: 0 };
    const answers: Record<string, Answer> = {};
    for (const [id, q] of Object.entries(req.questions)) {
      const s = typeof this.script === "function" ? this.script(id, q, req) : this.script[id];
      answers[id] = answer(q, s);
    }
    return { ok: true, answers: answers as AnswersFor<Q>, usage, model: "fake", ms: 0 };
  }
}

function answer(q: Question, s: Scripted | undefined): Answer {
  if (q.type === "noul") return { type: "noul", noul: s && "noul" in s ? s.noul : 0.5 };
  const options = Object.keys(q.criteria);
  const wanted = s && "choice" in s ? s.choice : options[options.length - 1]!;
  if (!options.includes(wanted)) throw new Error(`fake judgment: "${wanted}" is not an option`);
  const confidence = s && "choice" in s ? (s.confidence ?? 0.9) : 0;
  const n = options.length;
  // confidence = (p_max - 1/n) / (1 - 1/n)  =>  p_max = confidence * (1 - 1/n) + 1/n
  const pMax = confidence * (1 - 1 / n) + 1 / n;
  const rest = n > 1 ? (1 - pMax) / (n - 1) : 0;
  const probabilities = Object.fromEntries(options.map((o) => [o, o === wanted ? pMax : rest]));
  return { type: "choice", choice: wanted, probabilities, confidence };
}
