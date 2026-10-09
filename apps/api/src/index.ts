import { fileURLToPath } from "node:url";
import { buildApp } from "./app";
import { depsFromEnv } from "./deps";

const port = Number(process.env.PORT ?? 3001);
const staticDir = fileURLToPath(new URL("../public", import.meta.url));
const deps = depsFromEnv();
const app = buildApp(deps, { staticDir, logger: true });
if (!deps.judge.enabled) app.log.warn("TYPESAFE_API_KEY is not set: /query will answer 502 until it is");
if (!process.env.OPENAI_API_KEY) app.log.warn("OPENAI_API_KEY is not set: /query will answer 502 until it is");
await app.listen({ port, host: "0.0.0.0" });
