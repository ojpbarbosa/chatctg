import { HttpCtgovClient } from "@chatctg/ctgov";
import { EXTRACTOR_MODEL, openAiExtractor, openAiTitler, TITLER_MODEL, type Deps } from "@chatctg/engine";
import { judgmentClientFromEnv } from "@chatctg/judgment";

export function depsFromEnv(env: Record<string, string | undefined> = process.env): Deps {
  return {
    judge: judgmentClientFromEnv(env),
    extract: openAiExtractor(env),
    title: openAiTitler(env),
    ctgov: new HttpCtgovClient(),
    models: { extractor: env.EXTRACTOR_MODEL ?? EXTRACTOR_MODEL, titler: env.TITLER_MODEL ?? TITLER_MODEL },
  };
}
