import { describe, expect, it } from "vitest";
import { EXTRACTION_INSTRUCTIONS, openAiExtractor, parseEntities } from "./extract";
import { openAiTitler } from "./title";

const responsesBody = (text: string) => JSON.stringify({ id: "resp_1", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }], usage: { input_tokens: 10, output_tokens: 5 } });
const ok = (text: string) => new Response(responsesBody(text), { status: 200, headers: { "content-type": "application/json" } });

describe("parseEntities", () => {
  it("accepts the strict shape and normalizes", () => {
    expect(parseEntities(JSON.stringify({ drugs: [" Pembrolizumab ", ""], conditions: [], sponsors: [], countries: ["Germany"], start_year: 2015, end_year: null, limit: 10 })))
      .toEqual({ drugs: ["Pembrolizumab"], conditions: [], sponsors: [], countries: ["Germany"], start_year: 2015, end_year: null, limit: 10 });
  });
  it("drops a trailing trial or study word from every name, then dedupes case-insensitively", () => {
    expect(parseEntities(JSON.stringify({ drugs: ["Pembrolizumab Trials"], conditions: ["Melanoma trials", "melanoma", "Lung cancer STUDIES", "asthma study "], sponsors: ["Merck trial"], countries: ["Germany"], start_year: null, end_year: null, limit: null })))
      .toEqual({ drugs: ["Pembrolizumab"], conditions: ["Melanoma", "Lung cancer", "asthma"], sponsors: ["Merck"], countries: ["Germany"], start_year: null, end_year: null, limit: null });
  });
  it("rejects bad shapes and out-of-range numbers", () => {
    expect(parseEntities("not json")).toBeNull();
    expect(parseEntities(JSON.stringify({ drugs: "x" }))).toBeNull();
    expect(parseEntities(JSON.stringify({ drugs: [], conditions: [], sponsors: [], countries: [], start_year: 1200, end_year: null, limit: null }))).toBeNull();
    expect(parseEntities(JSON.stringify({ drugs: [], conditions: [], sponsors: [], countries: [], start_year: null, end_year: null, limit: 0 }))).toBeNull();
  });
});

describe("extraction instructions", () => {
  it("leave the end of an open window empty", () => {
    expect(EXTRACTION_INSTRUCTIONS).toContain(`"since 2015" means start_year 2015 and end_year null; never set end_year to today's year unless the question names an end.`);
  });
});

describe("openAiExtractor", () => {
  it("fails fast without a key", async () => {
    expect(await openAiExtractor({})("q", "2026-10-09")).toMatchObject({ ok: false, reason: "missing_api_key" });
  });
  it("sends a strict json_schema request and parses the entities", async () => {
    let body: Record<string, unknown> = {};
    const extract = openAiExtractor({ OPENAI_API_KEY: "k" }, async (_u, init) => { body = JSON.parse(init!.body as string); return ok(JSON.stringify({ drugs: ["pembrolizumab"], conditions: [], sponsors: [], countries: [], start_year: 2015, end_year: null, limit: null })); });
    const r = await extract("How have pembrolizumab trials changed since 2015?", "2026-10-09");
    expect(r).toMatchObject({ ok: true, entities: { drugs: ["pembrolizumab"], start_year: 2015 } });
    expect(body.model).toBe("gpt-5.4-nano"); expect(body.store).toBe(false); expect(body.max_output_tokens).toBe(1200);
    expect((body.text as { format: { type: string; strict: boolean; name: string } }).format).toMatchObject({ type: "json_schema", strict: true, name: "entities" });
    expect(JSON.stringify(body.input)).toContain("2026-10-09");
  });
  it("maps invalid JSON and HTTP errors", async () => {
    expect(await openAiExtractor({ OPENAI_API_KEY: "k" }, async () => ok("{nope"))("q", "2026-10-09")).toMatchObject({ ok: false, reason: "openai_invalid_json" });
    expect(await openAiExtractor({ OPENAI_API_KEY: "k" }, async () => new Response("no", { status: 401 }))("q", "2026-10-09")).toMatchObject({ ok: false, reason: "openai_http", detail: expect.stringContaining("401") });
    expect(await openAiExtractor({ OPENAI_API_KEY: "k" }, async () => new Response("bad model gpt-x", { status: 404 }))("q", "2026-10-09")).toMatchObject({ detail: "404 bad model gpt-x" });
  });
  it("keeps only the status of an auth failure, never its body", async () => {
    const leaky = (status: number) => async () => new Response(JSON.stringify({ error: { message: "Incorrect API key provided: sk-proj-abc123" } }), { status });
    expect(await openAiExtractor({ OPENAI_API_KEY: "k" }, leaky(401))("q", "2026-10-09")).toEqual({ ok: false, reason: "openai_http", detail: "401", ms: expect.any(Number) });
    expect(await openAiExtractor({ OPENAI_API_KEY: "k" }, leaky(403))("q", "2026-10-09")).toMatchObject({ detail: "403" });
  });
});

describe("openAiTitler", () => {
  it("returns a trimmed title without quotes or a final period", async () => {
    expect(await openAiTitler({ OPENAI_API_KEY: "k" }, async () => ok('"Pembrolizumab trials per year since 2015."'))("summary")).toMatchObject({ title: "Pembrolizumab trials per year since 2015" });
  });
  it("turns a dash or a middot into a comma, and asks for none", async () => {
    let body: Record<string, unknown> = {};
    const titler = openAiTitler({ OPENAI_API_KEY: "k" }, async (_u, init) => { body = JSON.parse(init!.body as string); return ok("Pembrolizumab trials \u2014 per year since 2015 \u00b7 by phase \u2013 2026"); });
    expect((await titler("summary")).title).toBe("Pembrolizumab trials, per year since 2015, by phase, 2026");
    expect(JSON.stringify(body.input)).toContain("No dashes, middots or colons.");
  });
  it("leaves room for reasoning tokens in its output cap", async () => {
    let body: Record<string, unknown> = {};
    await openAiTitler({ OPENAI_API_KEY: "k" }, async (_u, init) => { body = JSON.parse(init!.body as string); return ok("Pembrolizumab trials by phase"); })("summary");
    expect(body.max_output_tokens).toBe(300);
  });
  it("returns null on any failure", async () => {
    expect((await openAiTitler({}, async () => ok("x"))("s")).title).toBeNull();
    expect((await openAiTitler({ OPENAI_API_KEY: "k" }, async () => new Response("", { status: 500 }))("s")).title).toBeNull();
  });
});
