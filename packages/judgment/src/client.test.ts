import { describe, expect, it } from "vitest";
import { HttpJudgmentClient, parseAnswers } from "./client";
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
  it("does not retry a 401", async () => {
    let calls = 0;
    const client = new HttpJudgmentClient({ apiKey: "k", sleep: async () => {}, fetch: async () => { calls++; return response({}, 401); } });
    const r = await client.ask({ state: "s", questions });
    expect(r).toMatchObject({ ok: false, reason: "unauthorized" }); expect(calls).toBe(1);
  });
  it("gives up after the retries with the last reason", async () => {
    const client = new HttpJudgmentClient({ apiKey: "k", maxRetries: 1, sleep: async () => {}, fetch: async () => response({}, 503) });
    expect(await client.ask({ state: "s", questions })).toMatchObject({ ok: false, reason: "server_error" });
  });
});
