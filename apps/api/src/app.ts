import { existsSync } from "node:fs";
import { jsonSchemas, QueryRequest, VERSION } from "@cheiron/contracts";
import { runQuery, type Deps } from "@cheiron/engine";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { startSse, writeSse } from "./sse";

export function buildApp(deps: Deps, opts: { staticDir?: string; logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 64 * 1024 });
  const schemas = jsonSchemas();

  app.get("/health", async () => ({ ok: true, version: VERSION, ...(await deps.ctgov.version()) }));
  app.get("/schema", async () => schemas);

  app.post("/query", async (req, reply) => {
    const parsed = QueryRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_request", message: "The request does not match the schema", details: parsed.error.issues } });
    const ac = new AbortController();
    reply.raw.on("close", () => { if (!reply.raw.writableFinished) ac.abort(); });
    const result = await runQuery(parsed.data, deps, undefined, ac.signal);
    return reply.code(result.status).send(result.body);
  });

  app.post("/query/stream", async (req, reply) => {
    const parsed = QueryRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_request", message: "The request does not match the schema", details: parsed.error.issues } });
    startSse(reply);
    const ac = new AbortController();
    reply.raw.on("close", () => { if (!reply.raw.writableFinished) ac.abort(); });
    const result = await runQuery(parsed.data, deps, (e) => writeSse(reply, e.event, e.data), ac.signal);
    writeSse(reply, result.ok ? "result" : "error", result.body);
    reply.raw.end();
  });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = typeof err.statusCode === "number" && err.statusCode >= 400 ? err.statusCode : 500;
    reply.code(status).send({ error: { code: status === 400 ? "invalid_request" : "internal", message: status === 500 ? "Internal error" : err.message } });
  });

  if (opts.staticDir && existsSync(`${opts.staticDir}/index.html`)) {
    app.register(fastifyStatic, { root: opts.staticDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/query") && !req.url.startsWith("/schema")) return reply.sendFile("index.html");
      return reply.code(404).send({ error: { code: "internal", message: "Not found" } });
    });
  }
  return app;
}
