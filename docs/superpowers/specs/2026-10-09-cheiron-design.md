# Cheiron: a ClinicalTrials.gov query-to-visualization service

Date: 2026-10-09 · Owner: João Barbosa · Status: design approved in chat; this document awaits review before the implementation plan.

Cheiron (Chiron, the centaur who taught the healers) answers a natural-language question about clinical trials with a visualization specification backed by live ClinicalTrials.gov data. It is the take-home assignment for Cureon: a backend that interprets the question, retrieves the data, decides whether and which visualization fits, and returns a structured spec a frontend can render without guessing. A small web UI demonstrates it.

## Why it is built this way

The assignment scores system design (35%), AI design (20%), code quality (20%), query coverage (15%) and I/O design (10%), with deep citations as a bonus. Its AI criteria are explicit: avoid hallucination-prone steps, include validation and constraints, use sensible planning steps and appropriate tools. Its coverage criterion asks for many question classes handled by a single coherent approach, not one-off hacks.

The approach is a **judged pipeline**. Every closed decision about the question (what kind of question it is, what to group by, which chart, which granularity, which metric, which relationship) is answered by TypeSafe's Jev, a model that returns a probability distribution over options and cannot answer outside them. The only generative step is a strict-JSON extraction of the strings the question names (drugs, conditions, sponsors, countries, years, a limit), run in parallel with Jev. Everything after that is deterministic code: planning the ClinicalTrials.gov requests, fetching, aggregating, and emitting the spec. Numbers are computed from records, never generated, and every datum cites the records it came from.

Two alternatives were considered and rejected:

- **A tool-calling agent** (an LLM loop with search and aggregate tools) is slower (three to six round trips) and puts the planning step, the one most prone to invention, inside a generative model.
- **A pre-indexed warehouse with text-to-SQL** gives fast aggregates but needs a mirror of the registry, goes stale, and text-to-SQL is the least constrained AI step possible.

## Pipeline

```
request ──► interpret ──► plan ──► fetch ──► aggregate ──► spec ──► response
             │ Jev (one request, 11 questions)        │
             │ OpenAI extraction (strict JSON)         │ OpenAI title (parallel with fetch)
```

Each stage is a pure function with its own tests. `runQuery(request, deps)` orchestrates them, records timing per stage, and never throws: every failure is a typed value that becomes an HTTP status.

### 1. Interpret

Two calls run in parallel.

**Jev** receives a tiny state, `{ question, provided }`, where `provided` is the structured request fields the caller passed (so Jev knows a drug was already given and need not be inferred). It answers eleven questions in one request. Instructions are in English, each option has a `what`, a `not_for` where it matters, and one example; every choice has a way out.

| Key | Type | Options or criteria | Read when |
|---|---|---|---|
| `in_scope` | noul | Can this be answered from a clinical-trials registry (trials, sponsors, phases, conditions, interventions, locations, dates, enrollment)? | always |
| `intent` | choice | `time_trend`, `distribution`, `comparison`, `ranking`, `geographic`, `network`, `count`, `lookup`, `other` | always |
| `dimension` | choice | `phase`, `status`, `sponsor_class`, `sponsor`, `intervention_type`, `drug`, `condition`, `country`, `start_year`, `enrollment`, `study_type`, `sex`, `age_group`, `none` | all but `network`, `count` |
| `secondary_dimension` | choice | same list | `time_trend`, `distribution`, `comparison` |
| `chart` | choice | `bar`, `grouped_bar`, `stacked_bar`, `line`, `histogram`, `scatter`, `network_graph`, `map`, `table`, `single_value` | always |
| `chart_named` | noul | Does the user explicitly name the kind of chart or visual they want? | always |
| `granularity` | choice | `year`, `quarter`, `month` | `time_trend` |
| `metric` | choice | `trial_count`, `enrollment_total`, `enrollment_median` | all but `network`, `lookup` |
| `edge_kind` | choice | `sponsor_drug`, `drug_drug`, `condition_drug`, `sponsor_condition`, `sponsor_collaborator` | `network` |
| `recruiting_only` | noul | Does the user restrict to trials currently recruiting or open? | always |
| `combination` | noul | When several drugs are named, does the user mean trials that involve all of them together (a combination), rather than any of them? | ≥ 2 drugs and not `comparison` |

The question set carries `{ id: "query-interpretation", version: 1 }`, returned in `meta`, and the version is bumped whenever wording or options change.

**Extraction** is one OpenAI Responses call with `text.format = json_schema, strict: true`, `store: false`, and the lowest reasoning effort the model accepts. It returns, verbatim from the question:

```json
{ "drugs": [], "conditions": [], "sponsors": [], "countries": [],
  "start_year": null, "end_year": null, "limit": null }
```

The prompt says: extract only what the question names, as written; resolve "since 2015" and "last five years" to years using today's date; do not translate brand names to generics; do not infer a condition from a drug. Structured request fields override extracted values field by field, and `meta.interpretation.provided_fields` lists which ones did.

Model: `gpt-5.4-nano` and `gpt-4.1-nano` are benchmarked on the 25-query evaluation set during implementation; the faster one that extracts every entity in the set correctly is kept, and the choice is recorded in the README. The model id is one constant.

### 2. Plan

`plan(answers, entities, request) → Plan` is pure.

**Thresholds** (from the confidence page of the Jev docs: a choice's confidence is `(p_max − 1/n) / (1 − 1/n)`; a noul near 0.5 means "cannot tell"):

| Signal | Rule |
|---|---|
| `in_scope < 0.5` | not answerable: `visualization: null`, HTTP 422, interpretation still returned |
| `intent` confidence `< 0.4` | the top three intents with probabilities go to `meta.interpretation.intent.alternatives` (the UI shows them as "did you mean") |
| `chart_named ≥ 0.6` | the chart is explicit; it is applied whenever the matrix allows it |
| `recruiting_only ≥ 0.7` | `filter.overallStatus = RECRUITING` |
| `combination ≥ 0.6` | drugs joined with `AND` in `query.intr`, else `OR` |

**Arms.** A comparison has one arm per compared entity. The arms come from the first entity list with two or more members, in the order drugs, conditions, sponsors, countries; the other lists apply as common filters to every arm. A comparison with fewer than two resolvable arms becomes a distribution, with a note. Every other intent has exactly one arm.

**Chart compatibility.** Jev's chart applies if the matrix allows it for the intent and dimension; otherwise the default applies and `meta.interpretation.chart` records `chosen`, `applied`, `explicit` and `reason`. A `chart` in the request is treated like an explicit Jev answer (validated the same way).

| Intent | Data shape | Default | Also allowed |
|---|---|---|---|
| `time_trend` | buckets over time, optional series | `line` | `bar`, `stacked_bar` (with secondary), `scatter` (explicit) |
| `distribution` | buckets over dimension, optional series | `bar`; `histogram` when dimension is `enrollment`; `line` when dimension is `start_year` | `stacked_bar`, `grouped_bar` (with secondary), `histogram` (dimension `start_year` or `enrollment`), `scatter` (explicit) |
| `comparison` | arms × dimension | `grouped_bar`; `line` when dimension is `start_year` | `stacked_bar`, `bar` (one arm), `scatter` (explicit) |
| `ranking` | top-N buckets over an open dimension | `bar` (horizontal, value-sorted) | `map` (dimension `country`) |
| `geographic` | buckets over `country` | `map` | `bar` |
| `network` | nodes and edges | `network_graph` | none |
| `count` | one number | `single_value` | none |
| `lookup` | rows of studies | `table` | none |
| `other` | none | `null` | none |

A dimension of `none` with `distribution` or `ranking` falls back to `phase` with a note. `scatter` is only ever applied on explicit request because it plots one point per trial, which no aggregate intent asks for by itself.

**Dimensions** map to normalized study fields:

| Dimension | Field | Kind | Buckets |
|---|---|---|---|
| `phase` | `phases[]` | ordinal | `EARLY_PHASE1`, `PHASE1`, `PHASE2`, `PHASE3`, `PHASE4`, `NA`, labelled "Early Phase 1" … "Not applicable" |
| `status` | `status` | nominal | the registry's status enum, fixed order |
| `sponsor_class` | `lead_sponsor.class` | nominal | `INDUSTRY`, `NIH`, `FED`, `OTHER_GOV`, `NETWORK`, `OTHER`, `INDIV`, `UNKNOWN` |
| `sponsor` | `lead_sponsor.name` | open | top N |
| `intervention_type` | `interventions[].type` distinct per study | nominal | the registry's enum |
| `drug` | drug identity set (below) | open | top N |
| `condition` | condition identity set (below) | open | top N |
| `country` | `countries[]` distinct per study | open | top N for bars, all for maps |
| `start_year` | `start_year` | temporal | by granularity, gap-filled, trimmed of empty extremes |
| `enrollment` | `enrollment` | quantitative | fixed bins: 1–50, 51–100, 101–200, 201–500, 501–1000, 1001+ |
| `study_type` | `study_type` | nominal | `INTERVENTIONAL`, `OBSERVATIONAL`, `EXPANDED_ACCESS` |
| `sex` | `sex` | nominal | `ALL`, `FEMALE`, `MALE` |
| `age_group` | `std_ages[]` | nominal | `CHILD`, `ADULT`, `OLDER_ADULT` |

**Identity sets.** A study's drug identity is its `InterventionMeshTerm` set when non-empty, else the lowercased names of its interventions of type `DRUG` or `BIOLOGICAL`. Its condition identity is its `ConditionMeshTerm` set when non-empty, else its `Condition` list. MeSH terms collapse "Pembrolizumab 200 mg" and "MK-3475" into one node and one bucket; the fallback keeps trials that have no MeSH mapping. The rule is stated in `meta.notes` whenever it is used.

**Limits.** `limit` from extraction, else 10 for rankings and open-dimension distributions, 15 for country bars, 25 rows for tables, 40 edges for networks.

### 3. Fetch

One ClinicalTrials.gov v2 request sequence per arm, from `GET /api/v2/studies`:

| Plan field | Parameter |
|---|---|
| drugs | `query.intr`, terms quoted, joined by `OR` or `AND` per `combination` |
| conditions | `query.cond`, quoted, `OR` |
| sponsors | `query.spons`, quoted, `OR` |
| countries | `query.locn`, quoted, `OR` |
| recruiting_only / `status` | `filter.overallStatus` |
| `trial_phase` | `filter.advanced=AREA[Phase]PHASE3` |
| start_year / end_year | `filter.advanced=AREA[StartDate]RANGE[2015-01-01,MAX]` (joined with `AND` to the phase clause) |
| always | `fields=` the 19 fields below, `pageSize=1000`, `sort=StartDate:desc`, `countTotal=true` on the first page, `format=json` |

Fields: `NCTId, BriefTitle, OverallStatus, Phase, StartDate, PrimaryCompletionDate, LeadSponsorName, LeadSponsorClass, CollaboratorName, Condition, InterventionName, InterventionType, LocationCountry, EnrollmentCount, StudyType, Sex, StdAge, ConditionMeshTerm, InterventionMeshTerm`. All verified valid against the live API on 2026-10-09; a bad field name returns a plain-text 400, which the client surfaces as `ctgov_invalid_request`.

Pages follow `nextPageToken` until `max_studies` (default 3,000, so three pages, about 2.5 s worst case at the 0.8 s per page measured) or the end. `totalCount` is always reported; when the fetch stops early, `meta.coverage.truncated` is true and the subtitle says "based on the 3,000 most recently started of 12,480 trials". Sorting by start date descending makes the truncated sample deterministic and explainable.

Each page is normalized into a `Study`:

```ts
{ nct_id, title, status, phases: string[], start_date: string | null, start_year: number | null,
  primary_completion_date: string | null, lead_sponsor: { name, class }, collaborators: string[],
  conditions: string[], mesh_conditions: string[], interventions: { name, type }[],
  mesh_interventions: string[], countries: string[], enrollment: number | null,
  study_type, sex, std_ages: string[] }
```

`countries` is the distinct set across a study's locations. Missing modules become empty arrays or null; nothing is invented.

An in-memory LRU cache (200 entries, one-hour TTL) keyed by the full request URL makes repeated queries instant. Per page: 15 s timeout, one retry on 429, 5xx or a network error with jittered backoff.

**Title.** While the fetch runs, the fast model writes a title (six to twelve words) from the plan summary, not the question, so it can never describe a chart that was not built. Four-second timeout; on failure the template title stands ("Pembrolizumab trials by phase"). The subtitle is always from the template: counts, counting rule, truncation, data timestamp.

### 4. Aggregate

Pure functions over `Study[]`, one per data shape:

- **Buckets** (`bar`, `stacked_bar`, `grouped_bar`, `histogram`, `line`, `map`): group by dimension, optional series by secondary dimension or by arm. A study with several values of a multi-valued field (phases, countries, conditions, drugs, age groups, intervention types) counts once per distinct value; `meta.notes` says so whenever it happens. The metric is `trial_count`, `enrollment_total` (sum where present) or `enrollment_median`; studies without enrollment are counted in `meta.coverage.studies_without_value`. Time buckets by `year`, `quarter` or `month`, gap-filled with zeros between the first and last non-empty bucket. Open dimensions keep the top N by value; the number dropped goes to `meta.coverage.omitted_categories`.
- **Points** (`scatter`): one point per study with a start date and an enrollment, x = start date, y = enrollment, colour = first phase, series = arm when there are arms. Capped at 500 points, most recent first, with a note.
- **Graph** (`network_graph`): nodes and weighted edges by `edge_kind`. `sponsor_drug`: lead sponsor to each drug identity. `drug_drug`: every pair within a study's drug identity set of size ≥ 2. `condition_drug`, `sponsor_condition`: analogous. `sponsor_collaborator`: lead sponsor to each collaborator. Edge weight is the number of studies where the pair co-occurs; node size is the number of studies the node appears in. Keep the top `limit` edges by weight, then the nodes they touch. When the unpruned graph has over 200 edges, edges of weight 1 are dropped first.
- **Rows** (`table`): the top N studies (by start date descending) with NCT ID, title, status, phases, start date, lead sponsor, conditions, enrollment.
- **Value** (`single_value`): the registry's `totalCount` for the arm, which is exact even when the fetch was truncated.

### 5. Citations (the bonus, mandatory here)

Every datum carries `study_count` and `citations`: up to `citations_per_datum` (default 5, max 25) of the most recently started studies that contributed to it. A citation is

```json
{ "nct_id": "NCT04380636", "title": "Pembrolizumab Plus …",
  "field": "protocolSection.designModule.phases", "excerpt": "PHASE3" }
```

`field` is the JSON path in the ClinicalTrials.gov response and `excerpt` the exact value that put the study in that datum: the phase string for a phase bucket, the `startDateStruct.date` for a time bucket, the country for a country bucket, the sponsor name for a sponsor bucket. A network edge cites studies where both endpoints co-occur, with an excerpt naming both values (`leadSponsor.name: "Merck Sharp & Dohme LLC" · interventions: "Pembrolizumab"`). A scatter point and a table row cite themselves. `meta.source.requests` lists every ClinicalTrials.gov URL sent, with its `totalCount` and the number fetched, so any number can be reproduced by hand.

## Contract

Request and response are zod schemas in `packages/contracts`, the single source for validation, TypeScript types, the JSON Schema served at `GET /schema`, and the README tables.

### Request `POST /query`

| Field | Type | Required | Validation |
|---|---|---|---|
| `query` | string | yes | 1–500 characters after trim |
| `drug_name` | string or string[] | no | each 1–200 characters; overrides extracted drugs |
| `condition` | string or string[] | no | same; overrides conditions |
| `sponsor` | string or string[] | no | same; overrides sponsors |
| `country` | string or string[] | no | same; overrides countries |
| `trial_phase` | enum | no | `EARLY_PHASE1`, `PHASE1`, `PHASE2`, `PHASE3`, `PHASE4`, `NA` |
| `status` | enum | no | the registry's overall-status enum |
| `start_year`, `end_year` | integer | no | 1900–2100; `end_year ≥ start_year` |
| `intent` | enum | no | an intent; replaces Jev's intent answer (this is what a "did you mean" chip sends) |
| `chart` | enum | no | a chart type; validated by the compatibility matrix like an explicit answer |
| `max_studies` | integer | no | 100–10,000; default 3,000 |
| `citations_per_datum` | integer | no | 0–25; default 5 |

Unknown fields are rejected (400) so a typo in a filter never silently widens a query.

### Response

```ts
{
  visualization: Visualization | null,
  meta: Meta
}
```

`Visualization` is a discriminated union on `type`. Common to all: `type`, `title`, `subtitle`, `encoding`, `data`. Every data row carries `study_count` and `citations`.

| Type | `encoding` | `data` row |
|---|---|---|
| `bar` | `x: { field, type: "nominal" \| "ordinal", label, order? }`, `y: { field, type: "quantitative", label, unit }`, `orientation: "vertical" \| "horizontal"`, `sort: "x_order" \| "value_desc"` | `{ [x.field]: string, [y.field]: number }` |
| `grouped_bar`, `stacked_bar` | as `bar` plus `series: { field, label, values: string[] }` | `{ [x.field], [series.field], [y.field] }` |
| `line` | `x: { field, type: "temporal", granularity, label }`, `y`, optional `series` | `{ [x.field]: "2019" \| "2019-Q2" \| "2019-05", [series.field]?, [y.field] }` |
| `histogram` | `x: { field, type: "ordinal", label, bins: [{ label, min, max }] }`, `y` | `{ [x.field]: bin label, [y.field] }` |
| `scatter` | `x: { field, type: "temporal" \| "quantitative", label }`, `y`, optional `color: { field, label, values }`, optional `series`, `point_id: "nct_id"` | `{ nct_id, title, [x.field], [y.field], [color.field]? }` |
| `network_graph` | `nodes: { id_field, label_field, kind_field, size_field, kinds: [{ kind, label }] }`, `edges: { source_field, target_field, weight_field }`, `layout: "force"` | `data` is `{ nodes: [{ id, label, kind, size, study_count }], edges: [{ source, target, weight, study_count, citations }] }` |
| `map` | `geo: { field: "country", code_field: "iso3", level: "country" }`, `value: { field, label, unit }` | `{ country, iso3, [value.field] }` |

For `map`, `iso3` comes from `i18n-iso-countries` plus a small override table for the registry's spellings ("Korea, Republic of", "Russian Federation", "Taiwan", "Türkiye"); a country that cannot be mapped keeps `iso3: null`, stays in `data`, and is counted in `warnings`.
| `table` | `columns: [{ field, label, type }]`, `sort: { field, direction }` | one row per study |
| `single_value` | `value: { field, label, unit }` | exactly one row `{ value, label }` |

`Meta`:

```ts
{
  query: string,
  interpretation: {
    intent: { value, p, confidence, alternatives: { value, p }[] },
    dimension: { value, p } | null,
    secondary_dimension: { value, p } | null,
    chart: { chosen, applied, explicit: boolean, reason: string | null },
    metric, granularity: string | null, edge_kind: string | null,
    entities: { drugs: string[], conditions: string[], sponsors: string[], countries: string[] },
    time_window: { start_year: number | null, end_year: number | null },
    limit: number | null, recruiting_only: boolean, combination: boolean | null,
    provided_fields: string[],
    question_set: { id, version }, models: { judge: string, extractor: string, titler: string }
  },
  arms: { label: string, filters: Record<string, string> }[],
  source: { name: "clinicaltrials.gov", api_version, data_timestamp,
            requests: { url, total_count, fetched }[] },
  coverage: { total_count, fetched_count, truncated: boolean, sorted_by: "StartDate:desc",
              studies_without_value: number, omitted_categories: number },
  units: { y: "trials" | "participants" }, granularity: string | null,
  timing: { jev_ms, extract_ms, fetch_ms, title_ms, aggregate_ms, total_ms },
  notes: string[], warnings: string[],
  version: "cheiron/0.1.0"
}
```

### Errors

All errors are `{ error: { code, message, details? } }`.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_request` | zod issues in `details` |
| 422 | `not_answerable` | `in_scope < 0.5` or intent `other`; `details.meta` carries the interpretation |
| 502 | `upstream_failed` | `details.upstream` is `jev`, `openai` or `ctgov`, with the client's failure reason |
| 504 | `timeout` | the 40 s overall budget was exceeded |
| 500 | `internal` | anything else; logged with a request id |

Jev and the extractor are both required: there is no silent fallback from the judge to a generative model, because the whole design rests on the judge being the one that decides.

### Streaming `POST /query/stream`

Server-Sent Events with the same request body, for the UI:

| Event | Data | When |
|---|---|---|
| `interpretation` | `meta.interpretation` plus `{ chart, arms }` | after interpret and plan, about 0.5 s |
| `progress` | `{ arm, fetched, total }` | after each page |
| `title` | `{ title }` | when the titler returns |
| `result` | the full response | at the end |
| `error` | the error body | on failure, then the stream closes |

### Other routes

`GET /health` returns `{ ok, data_timestamp }` (the registry's version endpoint, cached). `GET /schema` returns the JSON Schema of request and response. In production the API also serves the built web app.

## Web UI

Vite, React 19, TypeScript. White only. One saturated blue (`--brand: #1f4fff`, deep `#1740e0`, tint `#e9eeff`) spent only on the action and the live things; ink at three weights (`#0b0b0c`, `#5b5f6b`, `#8a8f9c`); hairlines as alpha (`rgba(16, 24, 40, 0.12)`). Schibsted Grotesk variable (self-hosted via fontsource) for everything, a system monospace for numbers and IDs. Minimal chrome, rich charts.

**Layout.** A 260 px left sidebar holds the history: one row per past query (query text, chart glyph, relative time), a "New question" button at the top, remove on hover. History lives in `localStorage` (the last 30 responses), restored on click without a network call. The main column has two states:

- **Landing**: the question box centred vertically, one sentence above it, five example chips below it (one per chart family: trend, distribution, comparison, map, network). Enter submits; the chips fill and submit.
- **Result**: the box docks to the top and stays there. Below it the result card: title, subtitle, a row of chips (intent · dimension · applied chart · confidence; "did you mean" chips when alternatives exist, each one re-submits the same question with `intent` set), the chart, then a footer with coverage and timing ("Jev 180 ms · extraction 410 ms · ClinicalTrials.gov 1.9 s · 2,973 trials"). A "JSON" toggle shows the raw response. Clicking any datum opens a citations drawer: NCT IDs linking to `clinicaltrials.gov/study/<id>`, titles, field and excerpt.

**Motion.** The box lifts from centre to top; a skeleton of the applied chart type appears as soon as the `interpretation` event lands (about 0.5 s), so the shape of the answer shows before the data; bars and lines draw in when `result` lands. `prefers-reduced-motion` disables all of it.

**Charts.** Recharts for `bar`, `grouped_bar`, `stacked_bar`, `line`, `histogram`, `scatter`; D3 force for `network_graph` (drag, hover highlighting of neighbours, node colour by kind); D3 geo with `world-atlas` 110 m and an Equal Earth projection for `map` (sequential blue, hover tooltip); a plain table and a large number for the last two. Colour follows the `dataviz` skill's method: one sequential blue for single series, a categorical palette with the brand blue first for series, every chart readable without colour via labels and order. Each chart component reads the spec's `encoding` and `data` only, which is the proof that the contract is enough to render.

## Repository

```
cheiron/
  package.json                npm workspaces, scripts: dev, build, start, check, test, eval:jev, examples
  packages/contracts/         zod schemas for request, response, plan; JSON Schema export
  packages/judgment/          Jev client (adapted from the author's earlier client: fetch over
                              POST /v1/systemone, timeout, retries with jitter on 429/529/5xx,
                              strict validation of every answer, never throws), the question
                              set, a scripted fake for tests
  packages/ctgov/             URL builder, paged fetcher, normalizer, LRU cache, recorded fixtures
  packages/engine/            extract (OpenAI), plan, aggregate, cite, spec, runQuery
  apps/api/                   Fastify 5 + zod type provider: /query, /query/stream, /schema, /health
  apps/web/                   Vite + React 19
  eval/                       queries.json (25 labelled questions), report.md
  examples/                   five real runs: request, response, and a README listing them
  docs/superpowers/specs/     this document
  README.md
  Dockerfile                  one image: API serving the built web app (deployment is tomorrow's work)
```

Node 24 (≥ 22 works), ESM, TypeScript 5.7, zod 3, Fastify 5, vitest 3, eslint 9 with typescript-eslint, Vite 7, React 19, Recharts 3, D3 7, topojson-client, world-atlas, `@fontsource-variable/schibsted-grotesk`. Secrets come from `.env` at the root: `TYPESAFE_API_KEY`, `OPENAI_API_KEY`; optional `TYPESAFE_MODEL` (default `jev-latest`), `PORT` (default 3001), `CTGOV_MAX_STUDIES`. Without a key the API starts and `/query` answers 502 `upstream_failed` with the missing key named; keys are never logged.

`npm run dev` runs the API (tsx watch) and the web app (Vite, proxying `/query` and `/schema`); `npm run build` builds the web app into the API's static folder; `npm start` serves both from one process; `npm run check` is typecheck, lint and tests.

## Testing and validation

- **Unit (vitest, offline)**: the planner matrix (every intent × chart × dimension cell has an expected applied chart); each aggregator against a fixture of 60 hand-picked studies (multi-valued counting, gap filling, top-N, bins, every edge kind, pruning); citation extraction (field path and excerpt per dimension); Jev answer validation (rejects a missing option, an unnormalized distribution, a wrong type); the URL builder (quoting, `AND`/`OR`, Essie ranges, field list); the extractor's response parsing; every chart type's response validates against the contract; SSE event order.
- **Recorded fixtures**: small ClinicalTrials.gov pages (`pageSize=50`) saved under `packages/ctgov/fixtures/` with the URL that produced them, so the engine's end-to-end tests run without the network.
- **`npm run eval:jev`**: runs the 25 labelled questions in `eval/queries.json` (expected intent, dimension, chart) through the real Jev, prints agreement per question, the confusion cases, and p50/p90 latency, and writes `eval/report.md`. This is the README's "how I validated correctness" and the basis for the thresholds.
- **`npm run examples`**: runs the five example questions against the live APIs and writes `examples/<slug>.json` (request and full response). The five cover `line`, `bar`, `grouped_bar`, `map`, `network_graph`.

## README

Sections, in order: what it is and the one-paragraph approach; how to run (install, `.env`, dev, build, start); API (request table, response contract with every encoding, errors, streaming); how it decides (the eleven questions, the matrix, the thresholds, what Jev cannot do and how code covers it); data handling (fields, identity sets, multi-valued counting, truncation and sorting, caching); citations; the five example runs; testing and validation (with the eval table); key design decisions and trade-offs; limitations and what to improve with more time; AI tools used and which parts were designed deliberately versus generated and adapted.

## Out of scope

Authentication, server-side persistence, languages other than English, deployment (a Dockerfile is included; hosting is a follow-up), parallel page fetching by partitioning `StartDate` ranges (listed under improvements), and any fallback from Jev to a generative classifier.
