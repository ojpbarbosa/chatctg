import type { FastifyReply } from "fastify";

export function startSse(reply: FastifyReply): void {
  reply.hijack();
  reply.raw.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
  // Send the headers now, so the client sees the stream open before the first event (about half a second later).
  if (typeof reply.raw.flushHeaders === "function") reply.raw.flushHeaders();
}

export function writeSse(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
