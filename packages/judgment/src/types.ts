export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Instructions = string | JsonValue[] | { [key: string]: JsonValue };

export interface NoulQuestion { type: "noul"; instructions: Instructions; criteria?: { true: string; false: string } }
export interface ChoiceQuestion<O extends string = string> {
  type: "choice"; instructions: Instructions;
  /** Up to 255 options. `null` means the option's name says it all. */
  criteria: Record<O, string | { [key: string]: JsonValue } | null>;
}
export type Question = NoulQuestion | ChoiceQuestion;
export type QuestionMap = Record<string, Question>;

export interface NoulAnswer { type: "noul"; /** probability of yes; 0.5 is "cannot tell" */ noul: number }
export interface ChoiceAnswer<O extends string = string> {
  type: "choice"; choice: O; probabilities: Record<O, number>;
  /** How concentrated the distribution is: (p_max - 1/n) / (1 - 1/n). Not the odds of being right. */
  confidence: number;
}
export type Answer = NoulAnswer | ChoiceAnswer;
export type AnswerFor<Q extends Question> = Q extends NoulQuestion ? NoulAnswer : Q extends ChoiceQuestion<infer O> ? ChoiceAnswer<O> : never;
export type AnswersFor<Q extends QuestionMap> = { [K in keyof Q]: AnswerFor<Q[K]> };

export interface Usage { inputTokens: number; outputTokens: number; requests: number; costUsd: number }

export type FailureReason =
  | "disabled" | "state_too_large" | "timeout" | "network" | "rate_limited" | "overloaded"
  | "unauthorized" | "invalid_request" | "server_error" | "bad_response";

export type JudgmentResult<Q extends QuestionMap = QuestionMap> =
  | { ok: true; answers: AnswersFor<Q>; usage: Usage; model: string; ms: number }
  | { ok: false; reason: FailureReason; detail?: string; usage: Usage; ms: number };

export interface JudgmentRequest<Q extends QuestionMap = QuestionMap> { state: JsonValue; questions: Q; signal?: AbortSignal }

export interface JudgmentClient {
  readonly enabled: boolean;
  readonly model: string;
  /** Never throws. A failure is a value the caller decides what to do with. */
  ask<Q extends QuestionMap>(req: JudgmentRequest<Q>): Promise<JudgmentResult<Q>>;
}
