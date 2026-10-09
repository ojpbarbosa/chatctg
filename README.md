# Cheiron

Cheiron answers a natural-language question about clinical trials with a visualization spec built from live ClinicalTrials.gov data. You send `POST /query` with a question such as "How are melanoma trials distributed across phases?". It returns a typed spec (chart type, encoding, data rows) that a frontend can render without guessing, and metadata that explains each decision and cites the registry records behind each number. A small React app renders the specs.

The approach is a judged pipeline. Every closed decision about the question (its intent, the attribute to group by, the chart, the granularity, the metric, the relationship) is answered by TypeSafe's Jev, a model that returns a probability distribution over fixed options and cannot answer outside them. One generative call extracts the strings the question names, under a strict JSON schema, and another writes a title from the finished plan. Everything else is deterministic code: plan the registry requests, fetch, aggregate, cite, and emit a spec that is validated against a zod contract. Numbers are computed from records, never generated.

The design is in [docs/superpowers/specs/2026-10-09-cheiron-design.md](docs/superpowers/specs/2026-10-09-cheiron-design.md). Where the spec and the shipped code differ, this README describes the code.

Status on 2026-10-10: built, tested offline, and run against the live APIs. The Jev evaluation, the extractor benchmark, the five example runs (generated on 2026-10-10), a live end-to-end run of the API and a visual check of the charts are done. Each is described below.

## Run it

Prerequisites: Node 22 or later (`.nvmrc` pins 24; the scripts use `node --env-file-if-exists`, which needs 22.9 or later), npm, a TypeSafe key and an OpenAI key.

```bash
cp .env.example .env      # then set TYPESAFE_API_KEY and OPENAI_API_KEY
npm install
```

| Variable | Required | Default | Used for |
|---|---|---|---|
| `TYPESAFE_API_KEY` | for `/query` | none | Jev |
| `OPENAI_API_KEY` | for `/query` | none | entity extraction and titles |
| `TYPESAFE_MODEL` | no | `jev-latest` | the Jev model id |
| `PORT` | no | `3001` | the API port |
| `EXTRACTOR_MODEL`, `TITLER_MODEL` | no | `gpt-5.4-nano` | the OpenAI model ids |
| `TYPESAFE_BASE_URL`, `OPENAI_BASE_URL` | no | the vendors' public URLs | proxies |

Without keys the API still starts and logs a warning per missing key. `/query` then answers 502 `upstream_failed` and names the missing key. Keys are never logged.

```bash
npm run dev                  # API on http://localhost:3001 (tsx watch) and web on http://localhost:5173 (Vite, proxies the API)
npm run build && npm start   # builds the web app into apps/api/public; one process on 3001 serves both
npm run check                # typecheck, lint and the vitest suite (214 tests in 24 files, all offline)
npm run eval:jev             # runs eval/queries.json through the live Jev and rewrites eval/report.md
npm run eval:extract         # benchmarks the extractor models (see Validation)
npm run examples             # five live runs into examples/ (see Example runs)
npm run fixtures:record      # re-records the ClinicalTrials.gov fixture pages
```

`npm run eval:jev` regenerates the report's header, table and disagreement list. The hand-written sections at the end of `eval/report.md` are not regenerated, so keep them when you re-run it.

Docker:

```bash
docker build -t cheiron .
docker run --rm -p 3001:3001 --env-file .env cheiron
curl localhost:3001/health
```

The image has two stages on `node:24-alpine`: install and build the web app, then run `npm start`. `.env` is excluded from the image and passed at run time. On 2026-10-09 the image built, `/health` answered 200, `/` served the web app, `/schema` answered, and an unknown request field got a 400.

The web app has a question box with five example chips, a history sidebar (the last 30 responses, kept in `localStorage`), and a result card. The card shows the title and subtitle, interpretation chips ("did you mean" chips when the intent is uncertain), the chart, a coverage and timing footer, a JSON toggle, and a citations drawer that opens on any datum. Each chart component reads only the spec's `encoding` and `data`, which is the check that the contract is enough to render.

## API

| Route | Purpose |
|---|---|
| `POST /query` | question in; visualization spec and metadata out |
| `POST /query/stream` | the same body; Server-Sent Events while it works |
| `GET /schema` | the JSON Schema of the request and the response, generated from the zod contract |
| `GET /health` | liveness and the registry's data version |

### Request

`POST /query` with `content-type: application/json`, at most 64 KB. Unknown fields are rejected with 400, so a typo in a filter never silently widens a query.

| Field | Type | Required | Validation and effect |
|---|---|---|---|
| `query` | string | yes | 1–500 characters after trim |
| `drug_name` | string or string[] | no | each 1–200 characters after trim, at most 10; replaces the extracted drugs |
| `condition` | string or string[] | no | same; replaces the extracted conditions |
| `sponsor` | string or string[] | no | same; replaces the extracted sponsors |
| `country` | string or string[] | no | same; replaces the extracted countries |
| `trial_phase` | enum | no | `EARLY_PHASE1`, `PHASE1`, `PHASE2`, `PHASE3`, `PHASE4`, `NA`; becomes `AREA[Phase]` in `filter.advanced` and replaces Jev's `phase_filter` |
| `status` | enum | no | the registry's overall status: `RECRUITING`, `NOT_YET_RECRUITING`, `ENROLLING_BY_INVITATION`, `ACTIVE_NOT_RECRUITING`, `COMPLETED`, `SUSPENDED`, `TERMINATED`, `WITHDRAWN`, `AVAILABLE`, `NO_LONGER_AVAILABLE`, `TEMPORARILY_NOT_AVAILABLE`, `APPROVED_FOR_MARKETING`, `WITHHELD`, `UNKNOWN`; becomes `filter.overallStatus` and replaces Jev's `recruiting_only` |
| `start_year` | integer | no | 1900–2100; replaces the extracted start year |
| `end_year` | integer | no | 1900–2100, and not before `start_year` when both are given |
| `intent` | enum | no | one of the nine intents; replaces Jev's intent and skips the scope check (a "did you mean" chip sends this) |
| `chart` | enum | no | one of the ten chart types; treated as an explicit ask and validated by the compatibility matrix |
| `max_studies` | integer | no | 100–10,000; default 3,000; the most studies read per arm (a count reads 50 and a table only its rows) |
| `citations_per_datum` | integer | no | 0–25; default 5; 0 turns citations off |

The entity, phase, status, year, `intent` and `chart` fields the caller sets are listed in `meta.interpretation.provided_fields`. The entity, phase, status and year fields are also passed to Jev in its state, so Jev knows a drug was given and does not need to infer one.

Example request:

```bash
curl -s localhost:3001/query -H 'content-type: application/json' -d '{
  "query": "How has the number of trials for this drug changed per year since 2015?",
  "drug_name": "Pembrolizumab",
  "start_year": 2015,
  "max_studies": 3000,
  "citations_per_datum": 5
}'
```

### Response

```ts
{ visualization: Visualization | null, meta: Meta }
```

The engine validates every 200 response against the contract before it is sent. A response that fails its own contract becomes a 500, never a malformed 200. The contract allows `visualization: null`, but the engine answers an unanswerable question with a 422 error body instead (see [Errors](#errors)).

`Visualization` is a discriminated union on `type`. Every member has `type`, `title`, `subtitle`, `encoding` and `data`. Every data row, and every network edge, carries `study_count` (how many studies it stands for) and `citations` (which ones; see [Citations](#citations)).

Row conventions:

- In the bucket charts (`bar`, `grouped_bar`, `stacked_bar`, `line`, `histogram`, `map`), the value cell is named after the metric: `trial_count`, `enrollment_total` or `enrollment_median`.
- A category cell holds the label (`"Phase 3"`), and `<field>_key` holds the registry's raw key (`"PHASE3"`).
- Time rows use `period`: `"2019"`, `"2019-Q2"` or `"2019-05"`, by granularity.
- The series cell is always named `series` and holds the series label.
- Country rows carry `iso3`: the ISO 3166 alpha-3 code, or `null` when the registry's spelling cannot be mapped.
- List cells in tables are comma-joined strings.

#### `bar`

| `encoding` field | Value |
|---|---|
| `x` | `{ field, type: "nominal" \| "ordinal", label, order? }`. `field` is the dimension (`phase`, `sponsor`, ...), or `period` for start dates. `ordinal` for closed sets and time, `nominal` for open sets. `order` is optional and lists the labels in display order. |
| `y` | `{ field, type: "quantitative", label, unit: "trials" \| "participants" }` |
| `orientation` | `horizontal` for rankings and for open dimensions (sponsor, drug, condition, country) outside a comparison; else `vertical` |
| `sort` | `value_desc` when horizontal; else `x_order` |

Row: `{ [x.field]: label, [x.field]_key: key, [y.field]: number, iso3?, study_count, citations }`. `iso3` is present when the dimension is `country`. With `value_desc`, the rows and `x.order` come sorted by value, highest first; a ranking over a closed dimension such as phase is re-sorted, and ties keep the dimension's order.

#### `grouped_bar` and `stacked_bar`

As `bar`, plus `series: { field: "series", label, values }`. `label` names the secondary dimension ("Sponsor class") or, in a comparison, what the arms are ("Drug", "Condition", "Sponsor", "Country"). `values` lists the series labels in order. There is one row per category and series, zero-filled: `{ [x.field], [x.field]_key, series, [y.field], study_count, citations }`. An open secondary dimension (sponsor, drug, condition, country) keeps its top 8 series. A `bar` is never sent with series rows: a `bar` asked for over a secondary dimension is drawn as `stacked_bar` (see [Chart compatibility](#chart-compatibility)).

#### `line`

| `encoding` field | Value |
|---|---|
| `x` | `{ field: "period", type: "temporal", granularity: "year" \| "quarter" \| "month", label: "Start date" }` |
| `y` | as in `bar` |
| `series` | optional; as in `grouped_bar` |

Row: `{ period, series?, [y.field], study_count, citations }`. Periods are gap-filled with zeros between the first and the last non-empty period.

#### `histogram`

`x: { field, type: "ordinal", label, bins: [{ label, min, max }] }` and `y`. Over enrollment the bins are `1–50`, `51–100`, `101–200`, `201–500`, `501–1000` and `1001+` (the last with `max: null`). Only bins with data are listed. Row: `{ [x.field]: bin label, [x.field]_key, [y.field], study_count, citations }`. A histogram has no series, so a secondary dimension is dropped with a note.

#### `scatter`

| `encoding` field | Value |
|---|---|
| `x` | `{ field: "start_date", type: "temporal", label }` |
| `y` | `{ field: "enrollment", type: "quantitative", label, unit: "participants" }` |
| `color` | optional. `{ field: "phase", label: "Phase", values }`: the phases present, in phase order |
| `series` | present when there are several arms |
| `point_id` | `"nct_id"` |

Row: one per trial, `{ nct_id, title, start_date, enrollment, phase, series?, study_count: 1, citations }`; `phase` holds the trial's first phase. At most 500 points are kept, the most recently started.

#### `network_graph`

| `encoding` field | Value |
|---|---|
| `nodes` | `{ id_field: "id", label_field: "label", kind_field: "kind", size_field: "size", kinds: [{ kind, label }] }` |
| `edges` | `{ source_field: "source", target_field: "target", weight_field: "weight" }` |
| `layout` | `"force"` |

`data` is an object here, not an array: `{ nodes: [{ id, label, kind, size, study_count }], edges: [{ source, target, weight, study_count, citations }] }`. A node id is `<kind>:<lowercased value>`, such as `sponsor:merck` or `drug:pembrolizumab`. A node's `size` and `study_count` are the number of studies it appears in. An edge's `weight` and `study_count` are the number of studies where both ends co-occur. Edges carry the citations. Only the `limit` heaviest edges are kept (40 by default, or the N the question names), and then the nodes they touch; sorting by weight makes the weight-1 edges the first to go, and a graph made only of weight-1 edges still shows `limit` of them. When edges are cut, the subtitle says "N strongest links shown" and `meta.warnings` says "Only the N strongest links of M are shown."

#### `map`

`geo: { field: "country", code_field: "iso3", level: "country" }` and `value: { field, label, unit }`. Row: `{ country, iso3, [value.field], study_count, citations }`. A country that cannot be mapped keeps `iso3: null`, stays in `data`, and is counted in `meta.warnings`. A geographic map keeps every country; a ranking drawn as a map keeps the top 15.

#### `table`

`columns` is a list of `{ field, label, type }`: `nct_id` (string), `title` (string), `status` (string), `phases` (list), `start_date` (date), `sponsor` (string), `conditions` (list), `enrollment` (number). `sort` is `{ field: "start_date", direction: "desc" }`. There is one row per study, the 25 most recently started by default (or the N the question names), and each row cites itself. Only those rows are fetched: the registry returns the most recently started first, so the first page, sized to the row count, holds them. A table is not a sample, so `coverage.truncated` is false; when the registry holds more trials, the subtitle says "25 most recently started shown" and `meta.notes` gives the total.

#### `single_value`

`value: { field: "value", label, unit }`. There is exactly one row: `{ value, label: "trials", study_count, citations }`. `value` is the registry's `totalCount`, which is exact. Only the 50 most recently started studies are read (one page with `pageSize=50`), for the citations.

### `meta`

| Field | Type | Meaning |
|---|---|---|
| `query` | string | the question as sent |
| `interpretation.intent` | `{ value, p, confidence, alternatives }` | the intent used, Jev's probability for it, Jev's confidence, and the top three intents with probabilities when the confidence is below 0.4 |
| `interpretation.dimension`, `interpretation.secondary_dimension` | `{ value, p }` or null | the attributes used after normalization, with Jev's probability for each |
| `interpretation.chart` | `{ chosen, applied, explicit, reason }` | the chart Jev or the request chose, the chart drawn, whether it was asked for explicitly, and why the two differ (null when they agree) |
| `interpretation.metric` | enum | `trial_count`, `enrollment_total` or `enrollment_median` |
| `interpretation.granularity` | enum or null | `year`, `quarter` or `month`, for time |
| `interpretation.edge_kind` | enum or null | the relationship, for networks |
| `interpretation.entities` | `{ drugs, conditions, sponsors, countries }` | after request overrides |
| `interpretation.time_window` | `{ start_year, end_year }` | each a year or null |
| `interpretation.limit` | number or null | the N the question named; null when a default applied |
| `interpretation.recruiting_only` | boolean | from the 0.7 threshold, or from the request's `status` |
| `interpretation.combination` | boolean or null | null unless two or more drugs were named outside a comparison |
| `interpretation.phase_filter` | enum or null | the phase every arm is restricted to: the request's `trial_phase`, else the phase Jev found named. Null when no phase applied, including a named phase skipped because the chart splits by phase |
| `interpretation.provided_fields` | string[] | request fields that replaced extraction or Jev |
| `interpretation.question_set` | `{ id, version }` | `query-interpretation`, version 2 |
| `interpretation.models` | `{ judge, extractor, titler }` | the model ids used |
| `arms` | `{ label, filters }[]` | one per fetch sequence; `filters` are the exact registry parameters |
| `source` | `{ name, api_version, data_timestamp, requests }` | `requests` lists every registry URL sent, with its `total_count` and the number `fetched` |
| `coverage` | `{ total_count, fetched_count, truncated, sorted_by, studies_without_value, omitted_categories }` | how much of the registry the answer covers; `sorted_by` is always `StartDate:desc`. For a comparison, `total_count` is the sum of the arms' totals, which can count a trial matching two arms twice. `truncated` is false for a count and a table, which are exact |
| `units` | `{ y }` | `trials` or `participants` |
| `granularity` | enum or null | as in the interpretation |
| `timing` | `{ jev_ms, extract_ms, fetch_ms, title_ms, aggregate_ms, total_ms }` | milliseconds per stage |
| `notes` | string[] | counting rules and fallbacks that were applied, a phase that was named but not applied, the trials left out for lack of a value, and the overlap of comparison arms |
| `warnings` | string[] | truncation, unplotted points, unmapped countries, network links cut to the limit |
| `version` | string | `cheiron/0.1.0` |

Example response, trimmed from [examples/distribution-melanoma-phases.json](examples/distribution-melanoma-phases.json), a live run. Of the six rows, one is shown, with two of its five citations. Of the three registry URLs, the first is shown.

```jsonc
{
  "visualization": {
    "type": "bar",
    "title": "Melanoma trials by phase",
    "subtitle": "3,775 trials on ClinicalTrials.gov · based on the 3,000 most recently started · counted once per phase · 531 trials without a phase not shown · data as of 2026-10-09",
    "encoding": {
      "x": { "field": "phase", "type": "ordinal", "label": "Phase",
             "order": ["Early Phase 1", "Phase 1", "Phase 2", "Phase 3", "Phase 4", "Not applicable"] },
      "y": { "field": "trial_count", "type": "quantitative", "label": "Trials", "unit": "trials" },
      "orientation": "vertical",
      "sort": "x_order"
    },
    "data": [
      // ... Early Phase 1 (60), Phase 1 (1,086), Phase 2 (1,157)
      { "phase": "Phase 3", "phase_key": "PHASE3", "trial_count": 162, "study_count": 162,
        "citations": [
          { "nct_id": "NCT07815574",
            "title": "iSCIB1+ in Combination With Ipilimumab and Nivolumab as First-Line Treatment for Advanced Unresectable Melanoma",
            "field": "protocolSection.designModule.phases", "excerpt": "PHASE3" },
          { "nct_id": "NCT07552597",
            "title": "Superparamagnetic Iron Oxide for Sentinel Lymph Node Localization in Patients With Cutaneous Melanoma: MagMen-II",
            "field": "protocolSection.designModule.phases", "excerpt": "PHASE3" }
          // ... three more
        ] }
      // ... Phase 4 (31), Not applicable (379)
    ]
  },
  "meta": {
    "query": "How are melanoma trials distributed across phases?",
    "interpretation": {
      "intent": { "value": "distribution", "p": 1, "confidence": 1, "alternatives": [] },
      "dimension": { "value": "phase", "p": 0.99 },
      "secondary_dimension": null,
      "chart": { "chosen": "bar", "applied": "bar", "explicit": false, "reason": null },
      "metric": "trial_count", "granularity": null, "edge_kind": null,
      "entities": { "drugs": [], "conditions": ["melanoma"], "sponsors": [], "countries": [] },
      "time_window": { "start_year": null, "end_year": null },
      "limit": null, "recruiting_only": false, "combination": null, "phase_filter": null, "provided_fields": [],
      "question_set": { "id": "query-interpretation", "version": 2 },
      "models": { "judge": "jev-1.13.0", "extractor": "gpt-5.4-nano", "titler": "gpt-5.4-nano" }
    },
    "arms": [{ "label": "Melanoma", "filters": { "query.cond": "\"melanoma\"" } }],
    "source": {
      "name": "clinicaltrials.gov", "api_version": "2.0.5", "data_timestamp": "2026-10-09T09:00:05",
      "requests": [{
        "url": "https://clinicaltrials.gov/api/v2/studies?format=json&query.cond=%22melanoma%22&fields=NCTId%2CBriefTitle%2COverallStatus%2CPhase%2CStartDate%2CPrimaryCompletionDate%2CLeadSponsorName%2CLeadSponsorClass%2CCollaboratorName%2CCondition%2CInterventionName%2CInterventionType%2CLocationCountry%2CEnrollmentCount%2CStudyType%2CSex%2CStdAge%2CConditionMeshTerm%2CInterventionMeshTerm&pageSize=1000&countTotal=true&sort=StartDate%3Adesc",
        "total_count": 3775, "fetched": 1000
      }]  // ... two more pages, each with its pageToken
    },
    "coverage": { "total_count": 3775, "fetched_count": 3000, "truncated": true, "sorted_by": "StartDate:desc",
                  "studies_without_value": 531, "omitted_categories": 0 },
    "units": { "y": "trials" },
    "granularity": null,
    "timing": { "jev_ms": 233, "extract_ms": 758, "fetch_ms": 1917, "title_ms": 576, "aggregate_ms": 11, "total_ms": 2689 },
    "notes": ["A trial with several phases is counted once per value (once per phase for a Phase 1/2 trial).",
              "531 trials without a phase are not shown."],
    "warnings": ["Only the 3,000 most recently started of 3,775 trials were read; counts are over that sample, the total is exact."],
    "version": "cheiron/0.1.0"
  }
}
```

### Errors

Every error has the shape `{ "error": { "code", "message", "details"? } }`.

| Status | `code` | When | `details` |
|---|---|---|---|
| 400 | `invalid_request` | the body fails the schema | the zod issues |
| 422 | `not_answerable` | Jev's `in_scope` is below 0.5, or the intent is `other` | `interpretation`: the full interpretation, so the caller sees what was understood |
| 502 | `upstream_failed` | Jev, OpenAI or ClinicalTrials.gov failed after its retries | `upstream` (`jev`, `openai` or `ctgov`), `reason` and `detail`; after a 401 or 403 from Jev or OpenAI, `detail` is the status alone, because the body can echo the key |
| 504 | `timeout` | the 40 s overall budget ran out | none |
| 500 | `internal` | anything else, including a response that fails its own contract | `issues` or `detail` |

`internal` also carries 404, 413 (body over 64 KB) and 415, which come from Fastify's own handlers.

The `reason` is the client's typed failure:

- Jev: `disabled` (no key), `state_too_large`, `timeout`, `network`, `rate_limited`, `overloaded`, `unauthorized`, `invalid_request`, `server_error`, `bad_response`.
- OpenAI: `missing_api_key`, `openai_timeout`, `openai_network`, `openai_http`, `openai_incomplete`, `openai_invalid_json`, `openai_invalid_shape`.
- ClinicalTrials.gov: `ctgov_invalid_request`, `ctgov_timeout`, `ctgov_network`, `ctgov_server_error`, `ctgov_bad_response`.

Timeouts and retries: Jev has 5 s per attempt and up to two retries with jittered exponential backoff on 429, 529, 5xx, network errors and timeouts, honouring `retry-after`. The extractor has 8 s and the titler 4 s, each with one retry on 429, 5xx, network errors and timeouts. Each registry page has 15 s and one retry on network errors, 429 and 5xx. A registry 400 is not retried, because it means a malformed request.

### Streaming: `POST /query/stream`

The body is the same as for `/query`. A body that fails validation gets the plain 400 JSON. Otherwise the response is `text/event-stream`:

| Event | Data | When |
|---|---|---|
| `interpretation` | `{ interpretation, chart, arms }`: `meta.interpretation`, the applied chart and `meta.arms` | after interpret and plan, before any fetch |
| `progress` | `{ arm, fetched, total }` | after each registry page |
| `title` | `{ title }` | when the titler returns within its 4 s cap |
| `result` | the full response body | at the end |
| `error` | the error body | on failure; the stream then closes |

The web app draws a skeleton of the applied chart type as soon as `interpretation` arrives, so the shape of the answer shows before the data.

```bash
curl -N localhost:3001/query/stream -H 'content-type: application/json' -d '{"query":"Where are CAR-T trials run?"}'
```

### `GET /schema` and `GET /health`

`GET /schema` returns `{ request, response }`, each a JSON Schema (draft 2020-12) generated from the zod contract by `z.toJSONSchema`. zod 4 drops refinements from the export, so the rule that `end_year` is not before `start_year` is enforced by the API but does not appear in the schema.

`GET /health` returns the version and the registry's data version, cached for ten minutes, in snake_case like the rest of the API. The values below are from the Docker smoke test on 2026-10-09; the fields were renamed from `apiVersion` and `dataTimestamp` after it:

```json
{ "ok": true, "version": "cheiron/0.1.0", "api_version": "2.0.5", "data_timestamp": "2026-10-08T09:00:05" }
```

When the registry cannot be reached and no version is cached, both registry fields read `"unknown"`.

## How it decides

```
request ──► interpret ──► plan ──► fetch ──► aggregate ──► spec ──► response
             │ Jev (one request, 12 questions)        │
             │ OpenAI extraction (strict JSON)         │ OpenAI title (parallel with fetch)
```

`runQuery(request, deps)` in `packages/engine/src/run.ts` runs the stages. Plan, aggregate and spec are pure functions with their own tests. The three network clients (Jev, OpenAI, ClinicalTrials.gov) are passed in as `deps`, so tests swap in fakes. `runQuery` records timing per stage and never throws: every failure is a typed value that becomes an HTTP status.

1. **Interpret.** Jev and the extractor run in parallel.
2. **Plan.** `plan(answers, entities, request)` returns the arms, dimensions, chart, metric and limit, or `not_answerable`.
3. **Fetch.** One paged request sequence per arm, the arms in parallel. The titler runs meanwhile.
4. **Aggregate.** One pure function per data shape: buckets, points, graph, rows, value.
5. **Spec.** Builds the `Visualization`, the subtitle and `meta`, then validates the response against the contract.

### The twelve Jev questions

Jev receives a small state, `{ question, provided }`, where `provided` holds the structured request fields. It answers all twelve questions in one request. A `choice` returns a probability for every option and a confidence. A `noul` returns the probability that a statement is true. The instructions are in English. Each option has a `what`, a `not_for` where confusion is likely, and examples. Every choice has a way out (`none` or `other`). The set is `{ id: "query-interpretation", version: 2 }` and is returned in `meta`. The version goes up whenever wording or options change; version 2 added `phase_filter`. The wording is in [packages/judgment/src/interpretation.ts](packages/judgment/src/interpretation.ts).

| Key | Type | Options or criterion | Used when |
|---|---|---|---|
| `in_scope` | noul | Can a registry of trials (conditions, interventions, phases, status, sponsors, sites, dates, enrollment, study type, eligibility) answer it? | always, unless the request sets `intent` |
| `intent` | choice | `time_trend`, `distribution`, `comparison`, `ranking`, `geographic`, `network`, `count`, `lookup`, `other` | unless the request sets `intent` |
| `dimension` | choice | `phase`, `status`, `sponsor_class`, `sponsor`, `intervention_type`, `drug`, `condition`, `country`, `start_year`, `enrollment`, `study_type`, `sex`, `age_group`, `none` | all intents but `network`, `count`, `lookup` |
| `secondary_dimension` | choice | the same list | as `dimension`, unless it equals the primary or is `start_year` outside a time trend. Used only for `time_trend` and `distribution`; dropped with a note for `comparison`, `ranking` and `geographic`, and under a `histogram` |
| `chart` | choice | `bar`, `grouped_bar`, `stacked_bar`, `line`, `histogram`, `scatter`, `network_graph`, `map`, `table`, `single_value` | unless the request sets `chart` |
| `chart_named` | noul | Does the user name a visual form (chart, graph, plot, map, network, table, list, timeline, histogram, scatter, pie)? | always |
| `granularity` | choice | `year`, `quarter`, `month` | when the dimension is `start_year` |
| `metric` | choice | `trial_count`, `enrollment_total`, `enrollment_median` | all intents but `network`, `count`, `lookup` |
| `edge_kind` | choice | `sponsor_drug`, `drug_drug`, `condition_drug`, `sponsor_condition`, `sponsor_collaborator` | `network` |
| `recruiting_only` | noul | Does the user restrict to trials that are recruiting, open, enrolling or ongoing? | unless the request sets `status` |
| `combination` | noul | When several drugs are named, are they used together in the same trials? | two or more drugs, outside a comparison |
| `phase_filter` | choice | `EARLY_PHASE1`, `PHASE1`, `PHASE2`, `PHASE3`, `PHASE4`, `NA`, `none`: does the user restrict the answer to trials of one phase? `none` when no phase is named, or when phases are what the answer is split by | unless the request sets `trial_phase`; not applied when the chart splits by phase |

### Thresholds

A choice's confidence is `(p_max − 1/n) / (1 − 1/n)`, from the confidence page of the Jev docs. A noul near 0.5 means "cannot tell". The thresholds are one constant, `THRESHOLDS`, in [packages/engine/src/plan.ts](packages/engine/src/plan.ts).

| Signal | Rule |
|---|---|
| Jev answer shape | every option present, each a probability, summing to 1 within 0.02, and the choice is one of the options; otherwise the whole answer set is rejected as `bad_response` (502), never read as zeros |
| `in_scope < 0.5` | 422 `not_answerable`, with the interpretation (skipped when the request sets `intent`) |
| intent `other` | 422 `not_answerable` |
| intent confidence `< 0.4` | the top three intents with probabilities go to `meta.interpretation.intent.alternatives`; the UI shows them as "did you mean" chips |
| `chart_named ≥ 0.6` | the chart is explicit: an explicit chart only unlocks `scatter` and sets `chart.explicit` in `meta`. Any allowed chart is applied whether or not it is explicit |
| `recruiting_only ≥ 0.7` | `filter.overallStatus=RECRUITING`; a `status` in the request takes precedence |
| `combination ≥ 0.6` | the drugs are joined with `AND` in `query.intr`; otherwise `OR` |
| `phase_filter` not `none` | `AREA[Phase]<phase>` in `filter.advanced` on every arm, and "phase 3 only" in the subtitle. Jev's top option is used, without a confidence threshold. A `trial_phase` in the request takes precedence, and the filter is skipped when the chart splits by phase (see [Normalization](#normalization)) |

### Normalization

Before the chart is chosen, the planner makes the answers consistent with each other. The rules marked (note) add a line to `meta.notes`.

- A distribution over `start_year` becomes a time trend (note).
- A time trend always runs over `start_year`. A different dimension that Jev named becomes the secondary dimension, if there is none.
- A geographic question always runs over `country`.
- A secondary dimension is used only for a time trend or a distribution. For a comparison, ranking or geographic question it is dropped (note), and the note is added only when one was dropped. This is checked after the comparison fallback, so a one-entity comparison shown as a distribution keeps its secondary dimension. It is also dropped when the chart applied is a `histogram` (note), which has no series.
- A network, count or lookup has no dimension, and its metric is `trial_count`.
- A distribution, ranking or comparison with no dimension falls back to `phase` (note).
- A comparison needs two or more arms. The arms come from the first entity list with two or more members, in the order drugs, conditions, sponsors, countries; the other lists apply to every arm as common filters. With fewer than two, it becomes a distribution (note).
- A phase Jev found named is not applied when the dimension or the secondary dimension is `phase`, because a split by phase filtered to one phase is a single bar (note: "Phase 3 was named, but phases are what the chart splits by, so no phase filter was applied."). This is checked last, on the dimensions the chart is drawn with, so a histogram that drops a split by phase keeps the filter. A `trial_phase` in the request always applies.

Default limits: 10 for rankings and for open-dimension distributions and comparisons, 15 for country bars, 25 rows for tables, 40 edges for networks. A number the question names ("top 5") replaces the default.

### Chart compatibility

Jev's chart (or the request's) is applied when the matrix allows it for the intent and dimensions. Otherwise the default applies, and `meta.interpretation.chart` records `chosen`, `applied`, `explicit` and `reason`.

| Intent | Data shape | Default | Also allowed |
|---|---|---|---|
| `time_trend` | buckets over time, optional series | `line` | `bar` (drawn as `stacked_bar` with a secondary dimension); `stacked_bar` with a secondary dimension; `scatter` when explicit |
| `distribution` | buckets over a dimension, optional series | `bar`; `stacked_bar` with a secondary dimension; `histogram` over enrollment (without a secondary dimension) | `bar` in every case (drawn as `stacked_bar` with a secondary dimension); `stacked_bar` and `grouped_bar` with a secondary dimension; `scatter` when explicit |
| `comparison` | arms × dimension | `grouped_bar`; `line` over start year | `stacked_bar`; `scatter` when explicit |
| `ranking` | top N over an open dimension | `bar`, horizontal and value-sorted | `map` over country |
| `geographic` | buckets over country | `map` | `bar` (top 15) |
| `network` | nodes and edges | `network_graph` | none |
| `count` | one number | `single_value` | none |
| `lookup` | rows of studies | `table` | `scatter` when explicit |
| `other` | none | none (422) | none |

`scatter` plots one point per trial, which no aggregate intent asks for by itself, so it is applied only on an explicit ask (`chart_named ≥ 0.6`, or `chart` in the request). A scatter Jev picks without an explicit ask falls back to the default chart with the reason "scatter plots one point per trial and is only used when asked for; using" and the default's name. A lookup can draw one, because the question set describes a plot of individual trials as a `lookup`: in the evaluation, "Show a scatter plot of enrollment against start date for lupus trials" answered `lookup` with chart `scatter` (`chart_named` 0.99). Such a scatter reads the whole fetch (up to `max_studies`), while a table reads only its rows.

With a secondary dimension, two allowed charts are adjusted rather than refused, so the chart the question named is kept as closely as the shape permits. A `bar` holds one value per category, so it is drawn as `stacked_bar`, and `meta.interpretation.chart` records `chosen: "bar"`, `applied: "stacked_bar"` and the reason. A `histogram` has no series, so the secondary dimension is dropped with a note and the histogram is drawn.

### What Jev cannot do, and what does it instead

Jev chooses among options it is given. It cannot write free text, count records or do arithmetic. Those jobs go elsewhere, each with a check.

| Job | Why not Jev | What does it |
|---|---|---|
| Name the drugs, conditions, sponsors and countries | they are open text | The extractor: one OpenAI Responses call with `text.format` set to a `json_schema` with `strict: true`, `store: false`, and the lowest reasoning effort (`none`) for gpt-5 models. It is told to copy names as written, keep brand names, and never infer a condition from a drug. The question is passed as data, not instructions. The output is checked again (string lists, deduplicated, at most 10 each; years 1900–2100; limit 1–100), and request fields replace it field by field. |
| Resolve "since 2015" and "last five years" | arithmetic on today's date | The extractor, given today's date. The result must be an integer year, and `start_year` and `end_year` in the request replace it. |
| Count, sum, take medians, bin, gap-fill | Jev returns probabilities, not data | Code over the fetched records. A count is the registry's own `totalCount`. |
| Reconcile the answers | Jev answers each question on its own, so the answers can disagree (a `map` for a comparison) | The planner: thresholds, normalization and the matrix, with every override recorded in `meta`. |
| Write a title | free text | The titler writes six to twelve words from a one-sentence summary of the plan, not from the question, so it cannot describe a chart that was not built. It is told to title the subject, not the chart, never to name the chart type or repeat a phrase, and to prefer a few shapes ("Melanoma trials by phase", "Recruiting phase 3 psoriasis trials"), each shown by one worked example with other entities. It is capped at 4 s; on failure the template title stands. The subtitle is always the template. |

### No fallback from Jev to a generative classifier

When Jev fails, `/query` answers 502 and names Jev and the failure reason. There is no fallback to a generative classifier, by decision. Every decision in a response traces to a probability from Jev, a threshold or a matrix rule. A fallback would make the same decisions with a different error profile and without calibrated probabilities to threshold, and the response would look the same, so a caller could not tell which procedure drew the chart. The cost is availability: `/query` depends on two model vendors, and either one failing stops it. The Jev client retries twice with backoff before giving up.

## Data handling

### Fields

Every registry request asks for exactly these 19 fields, verified against the live API on 2026-10-09:

`NCTId`, `BriefTitle`, `OverallStatus`, `Phase`, `StartDate`, `PrimaryCompletionDate`, `LeadSponsorName`, `LeadSponsorClass`, `CollaboratorName`, `Condition`, `InterventionName`, `InterventionType`, `LocationCountry`, `EnrollmentCount`, `StudyType`, `Sex`, `StdAge`, `ConditionMeshTerm`, `InterventionMeshTerm`.

Each study is normalized into a flat `Study` (`packages/ctgov/src/study.ts`). `countries` is the distinct set across a study's locations. Missing modules become empty arrays or `null`; nothing is invented.

### Identity sets

A study's drug identity is its set of intervention MeSH terms when the registry mapped any. Otherwise it is the lowercased names of its interventions of type `DRUG` or `BIOLOGICAL`. Its condition identity is its condition MeSH terms when present, else its registered conditions. Both are deduplicated case-insensitively. MeSH terms collapse "Pembrolizumab 200 mg" and "MK-3475" into one bucket and one node; the fallback keeps the trials that have no MeSH mapping. `meta.notes` states the rule whenever a drug or condition dimension or a network uses it.

### Multi-valued counting

Phases, intervention types, drugs, conditions, countries and age groups can hold several values per study. A study counts once per distinct value, so a Phase 1/2 trial counts in Phase 1 and in Phase 2, and the bucket totals can exceed the number of trials. Whenever that happens, `meta.notes` and the subtitle say so ("counted once per phase"). A study without a value for the dimension (or without an enrollment, when the metric needs one, or without a value for the secondary dimension) is counted in `coverage.studies_without_value` and left out of the buckets. `meta.notes` and the subtitle say how many and why: "1 trial without a phase is not shown" in the notes and "1 trial without a phase not shown" in the subtitle, or "without an enrollment count" when the metric needs one. A scatter states the trials without a start date or an enrollment count the same way. Open dimensions keep the top N by value, and the number dropped goes to `coverage.omitted_categories`.

### Truncation and sort order

Every request uses `sort=StartDate:desc`, `format=json`, `countTotal=true` on the first page, and `pageSize=1000`, except that the first page asks for no more than the cap: a count reads one page of 50 (`pageSize=50`) and a table one page of its row count (25 by default). Pages follow `nextPageToken` until the cap (`max_studies`, default 3,000, for every other chart) or the end. The registry's `totalCount` is always reported. When the fetch stops early, `coverage.truncated` is true, `meta.warnings` says so, and the subtitle reads "N trials on ClinicalTrials.gov · based on the 3,000 most recently started". Sorting by start date descending makes the truncated sample deterministic and explainable. A single value never depends on the sample: it is the registry's `totalCount`. A table is not a sample either: it is the N most recently started trials.

A comparison's subtitle states each arm's total ("Pembrolizumab 2,973 · Nivolumab 1,734 trials on ClinicalTrials.gov") rather than their sum, because a trial that involves both drugs matches both arms. `coverage.total_count` is still the sum, and `meta.notes` says it can count such a trial twice.

A page of 1,000 studies took about 0.8 s when measured on 2026-10-09, so the default cap costs about 2.5 s in the worst case. Pages within an arm are fetched one after another, because each needs the previous page's token. Arms are fetched in parallel.

### Caching

An in-memory LRU cache (200 entries, one-hour TTL) keyed by the full request URL makes a repeated query skip the registry. The registry's version endpoint is cached for ten minutes. The cache is per process and is lost on restart.

### Essie expressions

The planner builds these registry parameters. Each term is quoted, and quotes inside a term are removed.

| Plan field | Parameter | Example |
|---|---|---|
| drugs | `query.intr` | `"pembrolizumab" OR "nivolumab"`; `AND` for a combination |
| conditions | `query.cond` | `"melanoma"` |
| sponsors | `query.spons` | `"National Cancer Institute"` |
| countries | `query.locn` | `"Germany" OR "France"` |
| recruiting only, or `status` | `filter.overallStatus` | `RECRUITING` |
| `trial_phase`, or the phase Jev found named | `filter.advanced` | `AREA[Phase]PHASE3` |
| start and end year | `filter.advanced` | `AREA[StartDate]RANGE[2015-01-01,MAX]`, or `RANGE[MIN,2019-12-31]` |
| phase and years together | `filter.advanced` | `AREA[Phase]PHASE3 AND AREA[StartDate]RANGE[2015-01-01,2020-12-31]` |

A question that names nothing sends no `query.*` parameter and aggregates over the whole registry, truncated to `max_studies` and stated in the subtitle. Each arm's exact parameters are in `meta.arms[].filters`, and each URL is in `meta.source.requests`.

## Citations

A citation is one registry record that supports a datum, with the exact value that put it there:

```json
{ "nct_id": "NCT00000002", "title": "Study NCT00000002",
  "field": "protocolSection.designModule.phases", "excerpt": "PHASE1" }
```

`field` is the JSON path in the ClinicalTrials.gov study record. `excerpt` is the value at that path. Each datum cites up to `citations_per_datum` studies (default 5, at most 25, 0 for none): the most recently started of the studies that contributed to it, with undated studies last and the NCT ID as the tie-break. `study_count` always gives the full number, so a reader knows how many studies the citations sample.

| Datum | `field` | `excerpt` |
|---|---|---|
| a phase bucket | `protocolSection.designModule.phases` | the phase, such as `PHASE3` |
| a time bucket | `protocolSection.statusModule.startDateStruct.date` | the start date as registered |
| a country bucket | `protocolSection.contactsLocationsModule.locations[].country` | the country |
| a sponsor bucket | `protocolSection.sponsorCollaboratorsModule.leadSponsor.name` | the sponsor name |
| a sponsor class bucket | `protocolSection.sponsorCollaboratorsModule.leadSponsor.class` | the class, such as `INDUSTRY` |
| a drug bucket | `derivedSection.interventionBrowseModule.meshes[].term \| protocolSection.armsInterventionsModule.interventions[].name` | the MeSH term or registered name that matched, in its registered case |
| a condition bucket | `derivedSection.conditionBrowseModule.meshes[].term \| protocolSection.conditionsModule.conditions` | the MeSH term or registered condition that matched |
| an enrollment bin | `protocolSection.designModule.enrollmentInfo.count` | the enrollment count |
| status, intervention type, study type, sex, age group | the matching module path | the registry's value |
| a scatter point, a table row, a single value | `protocolSection.identificationModule.nctId` | the NCT ID (the study cites itself) |

A network edge cites the studies where both ends co-occur. Its `field` joins the two paths with ` | `, and its excerpt names both values, such as `leadSponsor.name: "Merck" · meshes[].term: "pembrolizumab"`.

`meta.source.requests` lists every ClinicalTrials.gov URL sent, with its `total_count` and the number of studies `fetched` from it. Any number in a response can be checked by opening those URLs and applying the counting rules above, as long as the registry's `data_timestamp` has not changed.

## Example runs

`npm run examples` (`examples/run.ts`) sends five requests through the same engine against the live APIs. It writes `examples/<slug>.json` (the request, the status and the full response) and the table in [examples/README.md](examples/README.md), and it exits non-zero when any run fails. The runs below were generated on 2026-10-10, with question set version 2.

| File | Question | Type | Total trials | Jev | Total |
|---|---|---|---|---|---|
| [time-trend-pembrolizumab.json](examples/time-trend-pembrolizumab.json) | How has the number of trials for this drug changed per year since 2015? | line | 2,909 | 321 ms | 2901 ms |
| [distribution-melanoma-phases.json](examples/distribution-melanoma-phases.json) | How are melanoma trials distributed across phases? | bar | 3,775 | 233 ms | 2689 ms |
| [comparison-pembrolizumab-nivolumab.json](examples/comparison-pembrolizumab-nivolumab.json) | Compare phases for trials involving pembrolizumab vs nivolumab | grouped_bar | 5,004 | 188 ms | 3693 ms |
| [geographic-lupus-recruiting.json](examples/geographic-lupus-recruiting.json) | Which countries have the most recruiting trials for lupus? | map | 324 | 156 ms | 1484 ms |
| [network-sponsors-drugs-melanoma.json](examples/network-sponsors-drugs-melanoma.json) | Show a network of sponsors and drugs for melanoma trials | network_graph | 3,775 | 223 ms | 1361 ms |

- **Time trend** ([file](examples/time-trend-pembrolizumab.json)). The question says "this drug" and `drug_name` supplies it, so the request field replaces extraction, and "since 2015" becomes `AREA[StartDate]RANGE[2015-01-01,MAX]`.
- **Distribution** ([file](examples/distribution-melanoma-phases.json)). Of 3,775 melanoma trials, the 3,000 most recently started were read, each counted once per phase, and the 531 without a phase are stated in the notes and the subtitle.
- **Comparison** ([file](examples/comparison-pembrolizumab-nivolumab.json)). Two arms (2,974 pembrolizumab and 2,030 nivolumab trials) are fetched in parallel and merged into one series per drug, and the subtitle states each arm's total.
- **Geographic** ([file](examples/geographic-lupus-recruiting.json)). The 324 recruiting lupus trials are drawn on a world map, because the request sets `chart: "map"`; Jev's own chart answer for this question is `bar` (0.74 in the evaluation), which the matrix also allows.
- **Network** ([file](examples/network-sponsors-drugs-melanoma.json)). Sponsor–drug edges over MeSH identities from the 3,000 most recent melanoma trials are cut from 3,580 links to the 40 strongest, and each edge cites up to three trials where both ends co-occur.

Each run was checked: the chart type matches the question, every excerpt matches its bucket (the phase key, the start date's period or the country, across 401 citations in the bucket charts), and each first-page URL in `meta.source.requests` returns the stated `totalCount` from the live registry.

## Validation

### Jev agreement

`npm run eval:jev` runs the 25 labelled questions in [eval/queries.json](eval/queries.json) through the live Jev and scores every label a question carries: intent, dimension, chart, the noul flags, secondary dimension, metric, edge kind and phase filter. The latest run, with question set version 2 and `jev-latest`:

| Checks | Agreement | Latency p50 | Latency p90 |
|---|---|---|---|
| 87 | 87 of 87 (100%) | 181 ms | 197 ms |

How the number got there (runs 1 to 4 used version 1):

| Run | Agreement | What changed |
|---|---|---|
| 1 | 71 of 75 (95%) | first run |
| 2 | 74 of 75 (99%) | four wording edits in `interpretation.ts`, option keys and order unchanged: intent says a requested network means network; lookup covers one-point-per-trial plots; in a comparison the dimension is what is measured, not the named things; the table chart is not for counts per category. No labels changed. |
| 3 | 81 of 82 (99%) | the script also scored secondary dimension, metric and edge kind |
| 4 | 82 of 82 (100%) | a re-run; the one borderline answer flipped |
| 5 | 87 of 87 (100%) | question set version 2: the twelfth question, `phase_filter`, and five labels for it (`PHASE3` for the psoriasis count and the oncology median, `PHASE2` for the migraine table, `none` for the two questions that split by phase). The other eleven questions and their labels are unchanged. Every `phase_filter` answer had a probability of 0.94 or more. |

Read the 100% with care. The set is small. Some labels accept more than one answer where both are defensible (`line` or `bar` for trials per year). Agreement counts Jev's top option only, and several top options sit near 0.5: the dimension for "Where are CAR-T trials run?" disagreed in runs 1 to 3 and agreed in runs 4 and 5 (country 0.52 in run 5), so that answer is unstable, and the lupus question's country (0.46 in run 5) is as close. The eval scores Jev's raw answers, before the planner normalizes them. The full table, with Jev's probability for each top option, is in [eval/report.md](eval/report.md).

<details>
<summary>The 25 questions (copied from eval/report.md)</summary>

| Question | Intent | Dimension | Chart | Flags | Other | ms |
|---|---|---|---|---|---|---|
| How has the number of pembrolizumab trials changed per year since 2015? | ✓ time_trend (1.00) | ✓ start_year (1.00) | ✓ line (0.97) |  |  | 233 |
| How many melanoma trials started each year? | ✓ time_trend (1.00) | ✓ start_year (0.99) | ✓ line (0.88) |  |  | 232 |
| How are melanoma trials distributed across phases? | ✓ distribution (1.00) | ✓ phase (0.99) | ✓ bar (0.84) |  | ✓ phase_filter=none (1.00) | 197 |
| What are the most common intervention types for diabetes trials? | ✓ distribution (0.82) | ✓ intervention_type (0.86) | ✓ bar (0.90) |  |  | 142 |
| Compare phases for trials involving pembrolizumab vs nivolumab | ✓ comparison (1.00) | ✓ phase (0.84) | ✓ grouped_bar (0.89) | ✓ combination=0.05 | ✓ phase_filter=none (1.00) | 191 |
| Compare sponsor classes across asthma and COPD trials | ✓ comparison (1.00) | ✓ sponsor_class (0.76) | ✓ grouped_bar (0.79) |  |  | 170 |
| Which countries have the most recruiting trials for lupus? | ✓ geographic (0.89) | ✓ country (0.46) | ✓ bar (0.74) | ✓ recruiting_only=0.92 |  | 158 |
| Show a network of sponsors and drugs for melanoma trials | ✓ network (1.00) | none (0.59) | ✓ network_graph (1.00) | ✓ chart_named=0.97 | ✓ edge_kind=sponsor_drug (1.00) | 187 |
| Which drugs frequently co-occur in combination studies with pembrolizumab? | ✓ network (0.99) | drug (0.63) | ✓ network_graph (0.77) |  | ✓ edge_kind=drug_drug (1.00) | 181 |
| How many phase 3 psoriasis trials are recruiting? | ✓ count (1.00) | none (0.89) | ✓ single_value (0.99) | ✓ recruiting_only=0.95 | ✓ phase_filter=PHASE3 (1.00) | 154 |
| List recruiting trials for pediatric asthma in Canada | ✓ lookup (1.00) | none (0.96) | ✓ table (1.00) | ✓ recruiting_only=0.94 |  | 192 |
| Top 10 sponsors running Alzheimer's disease trials | ✓ ranking (1.00) | ✓ sponsor (0.93) | ✓ bar (0.80) |  |  | 185 |
| Which conditions are most studied with semaglutide? | ✓ ranking (1.00) | ✓ condition (0.79) | ✓ bar (0.72) |  |  | 186 |
| Show a scatter plot of enrollment against start date for lupus trials | ✓ lookup (0.59) | start_year (0.66) | ✓ scatter (1.00) | ✓ chart_named=0.99 |  | 193 |
| How are CAR-T trials distributed by enrollment size? | ✓ distribution (1.00) | ✓ enrollment (0.96) | ✓ histogram (1.00) |  |  | 161 |
| Trials per year by phase for breast cancer since 2010 | ✓ time_trend (0.98) | ✓ start_year (0.90) | ✓ line (0.38) |  | ✓ secondary_dimension=phase (0.98) | 181 |
| Where are CAR-T trials run? | ✓ geographic (1.00) | ✓ country (0.52) | ✓ map (0.74) |  |  | 164 |
| Which sponsors collaborate most with the National Cancer Institute? | ✓ ranking (0.52) | sponsor (0.84) | ✓ bar (0.64) |  | ✓ edge_kind=sponsor_collaborator (1.00) | 151 |
| How many participants have been enrolled in Alzheimer's trials per year? | ✓ time_trend (1.00) | ✓ start_year (0.99) | ✓ line (0.98) |  | ✓ metric=enrollment_total (1.00) | 156 |
| Trials for pembrolizumab plus chemotherapy by phase | ✓ distribution (0.97) | ✓ phase (1.00) | ✓ bar (0.44) | ✓ combination=0.96 |  | 195 |
| What's the weather in Boston? | other (0.94) | none (0.99) | single_value (0.87) | ✓ in_scope=0.01 |  | 160 |
| Compare phases of recruiting trials in Germany vs France | ✓ comparison (1.00) | ✓ phase (0.87) | ✓ grouped_bar (0.89) | ✓ recruiting_only=0.76 |  | 175 |
| Show me a table of phase 2 trials for migraine started in 2023 | ✓ lookup (1.00) | none (0.73) | ✓ table (1.00) | ✓ chart_named=0.98 | ✓ phase_filter=PHASE2 (1.00) | 191 |
| Which sponsors test the most drugs for rare diseases, as a network? | ✓ network (0.58) | sponsor (0.58) | ✓ network_graph (0.92) | ✓ chart_named=0.54 | ✓ edge_kind=sponsor_drug (0.64) | 160 |
| Median enrollment of phase 3 oncology trials by sponsor class | ✓ distribution (0.54) | ✓ sponsor_class (0.70) | ✓ bar (0.96) |  | ✓ metric=enrollment_median (1.00) ✓ phase_filter=PHASE3 (0.94) | 194 |

A cell without a mark has no label and is not scored.

</details>

### Extractor benchmark

`npm run eval:extract` sends the 24 questions with labelled entities to `gpt-5.4-nano` and `gpt-4.1-nano` and prints, per model, how many it extracted correctly and its p50 and p90 latency. The run on 2026-10-10:

| Model | Correct | Latency p50 | Latency p90 |
|---|---|---|---|
| `gpt-5.4-nano` | 23 of 24 | 770 ms | 935 ms |
| `gpt-4.1-nano` | 22 of 24 | 795 ms | 1582 ms |

Both missed "Show me a table of phase 2 trials for migraine started in 2023": they returned `start_year` 2023 with `end_year` null, so the table covers trials started from 2023 rather than in 2023. `gpt-4.1-nano` also returned no condition for "Which sponsors test the most drugs for rare diseases, as a network?". `gpt-5.4-nano` stays for both roles, the extractor and the titler: it is the more accurate, and the faster at p50 and p90. The Responses API required `reasoning: { effort: "none" }` for it; `minimal` is rejected for this model. Each model id is one constant in `packages/engine/src/openai.ts`.

### Tests

`npm run check` runs the typecheck, eslint and 214 vitest tests in 24 files. Every test runs offline. In the engine and API tests, Jev is a scripted fake that returns well-formed distributions, and ClinicalTrials.gov is a fake client, like the real one stopping when its signal is aborted, over twelve hand-built studies that exercise every counting rule (several phases, no start date, no enrollment, several countries, combinations, a drug with no MeSH terms) or over the two recorded registry pages. The clients' own tests inject `fetch` in place of the network.

| Package | Tests | What they pin |
|---|---|---|
| `contracts` | 13 | defaults, rejection of unknown fields, the year order, the caps, each chart's spec shape, the JSON Schema export, the error shape |
| `judgment` | 20 | answer validation (a missing option, a distribution that does not sum to 1, a wrong type, a noul outside [0, 1], a choice that exists only on the prototype chain), retries on 429 with `retry-after`, no retry on 401 and only the status in an auth failure's detail, never throwing; the question set uses exactly the contract's enums (the phase filter's options are the phases plus `none`), every option has a `what`, every choice has a way out, the state holds only the provided fields |
| `ctgov` | 26 | the URL builder (quoting, `AND`/`OR`, Essie ranges, the 19 fields), paging and truncation, a first page sized to the cap, the cache, no retry on 400, one retry on 503, progress per page, normalization of a registry-shaped record, the country mapping (every spelling in the recorded pages, a trailing parenthetical, names on the prototype chain), the fake client's abort |
| `engine` | 124 | the planner (thresholds, normalization, arms, limits, the compatibility matrix on representative cells, explicit scatter and its reason, a lookup's scatter, a bar over a secondary dimension drawn stacked, a histogram dropping it, the phase filter applied to every arm, overridden by the request, and skipped with its note under a split by phase), identity sets and citation fields per dimension, bucketing (multi-valued counting, gap filling, quarters, top N, secondary series, sums and medians, enrollment bins, why a study was left out), merged arms, graphs (weights, pairs, pruning that never empties the graph, collaborators), points and rows, the spec for every chart type (value-sorted rankings, per-arm totals, the not-shown line, the phase in the subtitle), the plan summary the titler reads, extraction parsing and its auth-failure detail, the output caps that leave room for reasoning tokens, `runQuery` end to end with fakes (every intent, overrides, a named phase reaching the registry call and `meta`, fetch sizes, 422, 502 per upstream, 504 before and during the fetch, a thrown error becoming a 500, the title fallback, an exact count), and `runQuery` over the recorded registry pages |
| `apps/api` | 9 | the routes, the snake_case `/health` body, 400 with issues, 422, the SSE event order on success and on failure, and the SSE headers flushed on open |
| `apps/web` | 22 | each chart renders from a spec in jsdom, a table row click picks its citations, the palette, the stream parser (including events split across chunks, and a stream that closes without a result), the history cap |

Two first pages (50 studies each) recorded from the live registry on 2026-10-09 are kept in `packages/ctgov/fixtures/`, each with the URL that produced it (`npm run fixtures:record`). `packages/engine/src/fixtures.test.ts` normalizes both and runs `runQuery` over them with the fake clients: a phase distribution, a sponsor–drug network and a country map, each validated against the contract with non-empty, cited data, plus a drug distribution that exercises the fallback to registered names for the trials the registry mapped to no MeSH term. `packages/ctgov/src/countries.test.ts` checks that every country spelling in the two pages maps to an ISO code (they include "Turkey (Türkiye)" and "Moldova").

Cases pinned by tests:

1. A question that names nothing still runs: the plan has one arm with no `query.*` parameter (`plan.test.ts`, "builds one arm with no query parameters when nothing is named").
2. A drug registered twice in one study in different case ("Pembrolizumab" and "pembrolizumab") counts once in a drug bucket and once as a node (`dimensions.test.ts`, "dedupes case-insensitively"). A dose variant ("Pembrolizumab 200mg") collapses only through MeSH terms.
3. A study with no start date does not break time bucketing or the scatter and is counted in `studies_without_value` (`buckets.test.ts`, "gap-fills years and trims the ends"; `points.test.ts`).
4. When `max_studies` is reached while the registry still offers a `nextPageToken`, fetching stops, `truncated` is true and the registry's `totalCount` is kept (`client.test.ts`, "follows page tokens, reports totals, and stops at maxStudies").
5. A Jev answer whose probabilities omit an option or do not sum to 1 is rejected as `bad_response`, never read as a zero (`judgment/src/client.test.ts`).

### End to end

The API was run on a local port against the live services (registry data of 2026-10-09T09:00:05), and each route behaved as designed:

- `GET /health` answered 200 with the version and the registry's data version.
- "How many phase 3 psoriasis trials are recruiting?" answered a `single_value` of 24, the registry's total for `query.cond="psoriasis"`, `filter.overallStatus=RECRUITING` and `filter.advanced=AREA[Phase]PHASE3`, titled "Recruiting phase 3 psoriasis trials". Before the `phase_filter` question, the same question counted all 220 recruiting psoriasis trials.
- `POST /query/stream` emitted `interpretation`, then `progress` per page with `title` as soon as the titler returned, then `result`.
- An unknown field (`phase` in place of `trial_phase`) got 400 `invalid_request`, naming the key.
- "What is the weather in Boston?" got 422 `not_answerable`, with the interpretation in `details`.

The visual check of the charts against live responses: done 2026-10-10; findings in the Limitations section.

## Design decisions and trade-offs

**A judged pipeline instead of a tool-calling agent or text-to-SQL.** Two alternatives were rejected. A tool-calling agent (an LLM loop with search and aggregate tools) needs three to six round trips and puts the planning step, the one most prone to invention, inside a generative model. A pre-indexed warehouse with text-to-SQL gives fast aggregates, but it needs a mirror of the registry that goes stale, and text-to-SQL is the least constrained AI step possible. The judged pipeline limits generation to two narrow steps: the extraction copies names from the question, and the titler rephrases the plan. Neither chooses the chart, the grouping or any data value. The cost is coverage: Cheiron answers only the question classes its options describe (nine intents, thirteen dimensions, ten charts), and a question outside them gets a 422 or the nearest class.

**Jev plus extraction instead of one LLM call.** One structured LLM call could return the intent, the chart and the entities together. Jev was chosen for the closed decisions because it returns a probability for every option, which gives the thresholds something to act on and lets the response show its alternatives, and because it cannot answer outside the options. All twelve questions go in one request (p50 181 ms in the latest evaluation). The strings still need a generative model, so the extractor runs in parallel with Jev and is limited to verbatim names under a strict schema. The cost is two vendors and two keys, and the wording of the questions matters: four wording edits moved agreement from 95% to 99%.

**Download and aggregate instead of count queries.** The registry can return `totalCount` for any filter, so a bar chart could be one count query per bucket. Cheiron fetches the matching studies once (19 fields each) and aggregates locally instead. One fetch then serves any dimension, a secondary split, medians, networks and scatter, and every bucket can cite the studies in it. Count queries cannot cite and need one request per bucket, which open dimensions like sponsor make unbounded. The cost is the cap: a topic with more matching trials than `max_studies` is aggregated over its most recently started trials, and the response says so. A single value uses the registry's exact `totalCount`.

**Projected fields and a cap.** Asking for 19 fields instead of whole records keeps pages small. The default cap of 3,000 studies bounds the fetch to three pages (about 2.5 s at the measured 0.8 s per page). `sort=StartDate:desc` makes the truncated sample deterministic and lets the subtitle state exactly which trials were read. A caller who needs more can raise `max_studies` to 10,000 and wait longer.

**An LLM title grounded in the plan.** The titler sees a one-sentence summary of the plan ("A bar chart of the number of trials by phase, for melanoma trials.", or "The total number of recruiting phase 3 psoriasis trials." for a count), not the user's question. It can only rephrase what was built, so a misread question cannot produce a title that describes a different chart. It runs in parallel with the fetch, so it adds wall-clock time only when it outlasts the fetch, and it is capped at 4 s with a template fallback. The subtitle, which carries the counts and caveats, is never generated. The cost is that titles follow the plan's wording rather than the user's.

**zod as the single source of the contract.** The request and the response are zod schemas in `packages/contracts`. They give the request validation, the TypeScript types for the engine and the web app, the JSON Schema at `/schema`, and the runtime check of every response before it leaves. The types, the validation and the served schema cannot drift apart. The tables in this README are written by hand from the same schemas. The cost is that the JSON Schema export loses refinements such as the year order.

**Clients that never throw.** The Jev, OpenAI and ClinicalTrials.gov clients return typed results instead of throwing, and `runQuery` catches anything unexpected. Every failure therefore maps to one status and one `reason`, and the tests can assert each mapping.

## Limitations and next steps

- **Sequential paging.** Pages within an arm are fetched one after another, about 0.8 s per 1,000 studies. Partitioning the query by `StartDate` ranges would let the pages of one arm run in parallel.
- **No synonym expansion.** The extractor keeps brand names as written and Cheiron does not map them to generic names, so "Keytruda" and "pembrolizumab" are separate queries. A synonym table or a MeSH lookup before the fetch would close this.
- **MeSH fallback inconsistency.** A study with MeSH terms is identified by them; a study without them is identified by its registered names. The same drug can therefore appear as two buckets or two nodes ("pembrolizumab" from MeSH and "pembrolizumab 200mg" from a registered name). Edge citations always name the MeSH path for drugs and conditions and give the lowercased identity, even when the identity came from a registered name.
- **No server-side persistence.** The cache is in memory and the history lives in the browser's `localStorage`.
- **English only.** The Jev instructions, the extraction prompt and the labels are English.
- **Deployment.** The Dockerfile builds one image that serves the API and the web app. Hosting it is not done.
- **Extractor slips.** The extractor read "started in 2023" as a start year with no end year (the benchmark's one miss). It also sometimes keeps the word "trials" in a condition: in one example run it returned "melanoma trials", which matched no trial and drew an empty network, and a re-run returned "melanoma". In 10 more calls with that question, one returned "melanoma trials" next to "melanoma", which still matched. Dropping a trailing "trials" or "studies" from extracted names, or checking each name against the registry before the fetch, would close the second slip.
- **No threshold on the phase filter.** Jev's top `phase_filter` option is applied as it is. Every labelled answer was 0.94 or more, but a phase picked at low confidence would still narrow the query. A threshold like the other filters' would cost little.
- **A small evaluation.** 25 questions show the question set works on the intended classes. They do not measure how Jev handles phrasing far from them. A larger labelled set, and scoring the planner's applied output as well as Jev's raw answers, are the next steps.

<!-- visual-check -->

## AI tools

Cheiron was built with Claude Code (Claude Fable 5.1) as the implementer, working from a design spec and an implementation plan that the author wrote and reviewed. Each task of the plan went to an implementer agent and then to a separate reviewer agent that checked it against the spec, with fixes before the next task.

Designed deliberately by the author:

- the judged-pipeline shape: Jev for closed decisions, one narrow extraction, deterministic code for everything else;
- the Jev question set: the twelve questions, their options and criteria;
- the thresholds and the chart compatibility matrix;
- the request and response contract;
- the citation rules: what a datum cites, the field path and excerpt per dimension, the two-ended edge citation, `meta.source.requests`;
- the evaluation set: the 25 questions and their labels.

Generated with Claude Code and adapted: the workspace boilerplate, the Recharts and D3 chart components, the CSS, and the test scaffolding. The four wording clarifications after the first evaluation run were made during implementation and checked against the unchanged labels. The twelfth question, `phase_filter`, was specified by the author after the first evaluation and scored on five new labels. The Jev client is adapted from the author's own earlier client (fetch over `POST /v1/systemone`, timeouts, retries with jitter, strict validation of every answer, never throwing).

How correctness was checked:

- the labelled Jev evaluation against the live API (above);
- offline tests with fakes for all three services, over a twelve-study sample built to exercise every counting rule and over two pages recorded from the live registry;
- validation of every response against the contract, in the engine and in the tests for each chart type;
- review of each task against the spec;
- the five example runs against the live APIs, their totals re-queried from the registry and their excerpts checked against their buckets;
- a live end-to-end run of the API, and a visual check of the charts.
