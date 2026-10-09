import { describe, expect, it } from "vitest";
import { HttpJudgmentClient, parseAnswers, topK } from "./client";
import { choice, noul } from "./questions";

const questions = { kind: choice("Which?", { a: null, b: null, none: "neither" }), yes: noul("Is it?") };

const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const good = { model: "jev-1", usage: { input_tokens: 10, output_tokens: 0 }, answers: {
  kind: { type: "choice", choice: "a", probabilities: { a: 0.7, b: 0.2, none: 0.1 }, confidence: 0.55 },
  yes: { type: "noul", noul: 0.9 },
} };

describe("parseAnswers", () => {
  it("accepts a well-formed answer set", () => {
    const r = parseAnswers(good, questions);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answers.kind).toMatchObject({ type: "choice", choice: "a" });
  });
  it("rejects a distribution that omits an option", () => {
    const bad = { ...good, answers: { ...good.answers, kind: { ...good.answers.kind, probabilities: { a: 0.8, b: 0.2 } } } };
    expect(parseAnswers(bad, questions)).toMatchObject({ ok: false });
  });
  it("rejects a distribution that does not sum to 1", () => {
    const bad = { ...good, answers: { ...good.answers, kind: { ...good.answers.kind, probabilities: { a: 0.5, b: 0.5, none: 0.5 } } } };
    expect(parseAnswers(bad, questions)).toMatchObject({ ok: false });
  });
  it("rejects a wrong type", () => {
    const bad = { ...good, answers: { ...good.answers, yes: { type: "choice", choice: "a" } } };
    expect(parseAnswers(bad, questions)).toMatchObject({ ok: false });
  });
});

describe("HttpJudgmentClient", () => {
  it("sends state, model and questions with a bearer token", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const client = new HttpJudgmentClient({ apiKey: "k", fetch: async (url, init) => { seen = { url: String(url), init: init! }; return response(good); } });
    const r = await client.ask({ state: { question: "q" }, questions });
    expect(r.ok).toBe(true);
    expect(seen!.url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((seen!.init.headers as Record<string, string>).authorization).toBe("Bearer k");
    expect(JSON.parse(seen!.init.body as string)).toEqual({ state: { question: "q" }, model: "jev-latest", questions });
  });
  it("retries a 429 and honours retry-after, then succeeds", async () => {
    let calls = 0; const sleeps: number[] = [];
    const client = new HttpJudgmentClient({ apiKey: "k", sleep: async (ms) => { sleeps.push(ms); }, fetch: async () => (++calls === 1 ? response({}, 429, { "retry-after": "1" }) : response(good)) });
    const r = await client.ask({ state: "s", questions });
    expect(r.ok).toBe(true); expect(calls).toBe(2); expect(sleeps[0]).toBeGreaterThanOrEqual(1000);
  });
  it("does not retry a 401, and keeps only the status of an auth failure", async () => {
    let calls = 0;
    const client = new HttpJudgmentClient({ apiKey: "k", sleep: async () => {}, fetch: async () => { calls++; return response({ error: "invalid key ts_live_abc123 for account acme" }, 401); } });
    const r = await client.ask({ state: "s", questions });
    expect(r).toMatchObject({ ok: false, reason: "unauthorized", detail: "401" }); expect(calls).toBe(1);
    const forbidden = new HttpJudgmentClient({ apiKey: "k", fetch: async () => response({ error: "key ts_live_abc123 lacks access" }, 403) });
    expect(await forbidden.ask({ state: "s", questions })).toMatchObject({ ok: false, reason: "unauthorized", detail: "403" });
    const bad = new HttpJudgmentClient({ apiKey: "k", fetch: async () => response({ error: "questions.kind: unknown type" }, 400) });
    expect(await bad.ask({ state: "s", questions })).toMatchObject({ ok: false, reason: "invalid_request", detail: expect.stringContaining("unknown type") });
  });
  it("gives up after the retries with the last reason", async () => {
    const client = new HttpJudgmentClient({ apiKey: "k", maxRetries: 1, sleep: async () => {}, fetch: async () => response({}, 503) });
    expect(await client.ask({ state: "s", questions })).toMatchObject({ ok: false, reason: "server_error" });
  });
});

describe("hardening", () => {
  const never = async () => { throw new Error("fetch should not be called"); };
  it("never throws on a circular state", async () => {
    const state: Record<string, unknown> = {}; state.self = state;
    const client = new HttpJudgmentClient({ apiKey: "k", fetch: never });
    expect(await client.ask({ state: state as never, questions })).toMatchObject({ ok: false, reason: "invalid_request" });
  });
  it("rejects a choice that is only on the prototype chain", () => {
    const bad = { ...good, answers: { ...good.answers, kind: { ...good.answers.kind, choice: "toString" } } };
    expect(parseAnswers(bad, questions)).toMatchObject({ ok: false });
  });
  it("fails state_too_large before any fetch", async () => {
    let calls = 0;
    const client = new HttpJudgmentClient({ apiKey: "k", fetch: async () => { calls++; return response(good); } });
    const r = await client.ask({ state: "x".repeat(32_000 * 3 + 1), questions });
    expect(r).toMatchObject({ ok: false, reason: "state_too_large" }); expect(calls).toBe(0);
  });
  it("rejects a noul outside [0,1]", () => {
    const bad = { ...good, answers: { ...good.answers, yes: { type: "noul", noul: 1.5 } } };
    expect(parseAnswers(bad, questions)).toMatchObject({ ok: false });
  });
  it("topK returns the most probable, descending", () => {
    expect(topK({ a: 0.1, b: 0.6, c: 0.3 }, 2)).toEqual([{ value: "b", p: 0.6 }, { value: "c", p: 0.3 }]);
  });
});
