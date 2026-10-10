# ChatCTG 

ChatCTG (short for ChatClinicalTrials.gov) answers a natural-language question about clinical trials with a visualization spec built from live ClinicalTrials.gov data. You send `POST /query` with a question such as "How are melanoma trials distributed across phases?". It returns in a typesafe contract (chart type, encoding, data rows) that a frontend can render while being fault tolerant, and metadata that explains each decision and cites the registry records behind each number. A small Vite + React app renders the visualizations for the sake of the demo.

The approach is a judged pipeline. Every closed decision about the question (its intent, the attribute to group by, the chart, the granularity, the metric, the relationship) is answered by a System One model (in this case, TypeSafe's Jev), which returns a probability distribution over fixed options. One generative call extracts the strings the question names, under a strict JSON schema, and another writes a title from the finished plan. Everything else is deterministic code: plan the registry requests, fetch, aggregate, cite, and emit a spec that is validated against a zod contract. Numbers are computed from records, never generated.

## Run it

Prerequisites: Node 22 or later (`.nvmrc` pins 24; the scripts use `node --env-file-if-exists`, which needs 22.9 or later), npm, a TypeSafe key and an OpenAI key.

```bash
cp .env.example .env # then set TYPESAFE_API_KEY and OPENAI_API_KEY
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
docker build -t chatctg .
docker run --rm -p 3001:3001 --env-file .env chatctg
curl localhost:3001/health
```

## API

| Route | Purpose |
|---|---|
| `POST /query` | question in; visualization spec and metadata out |
| `POST /query/stream` | the same body; Server-Sent Events while it works |
| `GET /schema` | the JSON Schema of the request and the response, generated from the zod contract |
| `GET /health` | liveness and the registry's data version |

### Request

`POST /query` 

| Field | Type | Required | Validation and effect |
|---|---|---|---|
| `query` | string | yes | 1–500 characters after trim |
| `drug_name` | string or string[] | no | each 1–200 characters after trim, at most 10; replaces the extracted drugs |
| `condition` | string or string[] | no | same; replaces the extracted conditions |
| `sponsor` | string or string[] | no | same; replaces the extracted sponsors |
| `country` | string or string[] | no | same; replaces the extracted countries |
| `trial_phase` | enum | no | `EARLY_PHASE1`, `PHASE1`, `PHASE2`, `PHASE3`, `PHASE4`, `NA`; becomes `AREA[Phase]` in `filter.advanced` and replaces Jev's `phase_filter` |
| `trial_status` | enum | no | the registry's overall status: `RECRUITING`, `NOT_YET_RECRUITING`, `ENROLLING_BY_INVITATION`, `ACTIVE_NOT_RECRUITING`, `COMPLETED`, `SUSPENDED`, `TERMINATED`, `WITHDRAWN`, `AVAILABLE`, `NO_LONGER_AVAILABLE`, `TEMPORARILY_NOT_AVAILABLE`, `APPROVED_FOR_MARKETING`, `WITHHELD`, `UNKNOWN`; becomes `filter.overallStatus` and replaces Jev's `recruiting_only` |
| `start_year` | integer | no | 1900–2100; replaces the extracted start year |
| `end_year` | integer | no | 1900–2100, and not before `start_year` when both are given |
| `intent` | enum | no | one of the nine intents; replaces Jev's intent and skips the scope check (a "did you mean" chip sends this) |
| `chart` | enum | no | one of the ten chart types; treated as an explicit ask and validated by the compatibility matrix |
| `max_studies` | integer | no | 100–10,000; default 3,000; the most studies read per arm (a count reads 50 and a table only its rows) |
| `citations_per_point` | integer | no | 0–25; default 5; 0 turns citations off |

Example request:

```bash
curl -s localhost:3001/query -H 'content-type: application/json' -d '{
  "query": "How has the number of trials for this drug changed per year since 2015?",
  "drug_name": "Pembrolizumab",
  "start_year": 2015,
  "max_studies": 3000,
  "citations_per_point": 5
}'
```

### Response

```ts
{ visualization: Visualization | null, meta: Meta }
```

`Visualization` is a discriminated union on `type`. Every member has `type`, `title`, `subtitle`, `encoding` and `data`. 

A few conventions:

- In the bucket charts (`bar`, `grouped_bar`, `stacked_bar`, `line`, `histogram`, `map`), the value cell is named after the metric: `trial_count`, `enrollment_total` or `enrollment_median`.
- A category cell holds the label (`"Phase 3"`), and `<field>_key` holds the registry's raw key (`"PHASE3"`).
- Time rows use `period`: `"2019"`, `"2019-Q2"` or `"2019-05"`, by granularity.
- The series cell is always named `series` and holds the series label.
- Country rows carry `iso3`: the ISO 3166 alpha-3 code, or `null` when the registry's spelling cannot be mapped.
- List cells in tables are comma-joined strings.

<details>
<summary>Chart types</summary>
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

Row: `{ period, series?, [y.field], study_count, citations }`. Periods are gap-filled with zeros between the first and the last non-empty period. When a yearly trial count is counted per year (see [Truncation and sort order](#truncation-and-sort-order)), `study_count` is the registry's exact count for the year and the citations are its most recently started trials.

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
| `interpretation.recruiting_only` | boolean | from the 0.7 threshold, or from the request's `trial_status` |
| `interpretation.combination` | boolean or null | null unless two or more drugs were named outside a comparison |
| `interpretation.phase_filter` | enum or null | the phase every arm is restricted to: the request's `trial_phase`, else the phase Jev found named with a probability of 0.5 or more. Null when no phase applied, including a named phase below 0.5 and one skipped because the chart splits by phase |
| `interpretation.provided_fields` | string[] | request fields that replaced extraction or Jev |
| `interpretation.question_set` | `{ id, version }` | `query-interpretation`, version 2 |
| `interpretation.models` | `{ judge, extractor, titler }` | the model ids used |
| `arms` | `{ label, filters }[]` | one per fetch sequence; `filters` are the exact registry parameters |
| `source` | `{ name, api_version, data_timestamp, requests }` | `requests` lists every registry URL sent, with its `total_count` and the number `fetched` |
| `coverage` | `{ total_count, fetched_count, truncated, sorted_by, studies_without_value, omitted_categories }` | how much of the registry the answer covers; `sorted_by` is always `StartDate:desc`. For a comparison, `total_count` is the sum of the arms' totals, which can count a trial matching two arms twice. `truncated` is false for a count, a table and a yearly trend counted per year, which are exact |
| `units` | `{ y }` | `trials` or `participants` |
| `granularity` | enum or null | as in the interpretation |
| `timing` | `{ jev_ms, judged_ms, extract_ms, fetch_ms, title_ms, aggregate_ms, total_ms }` | milliseconds per stage; `judged_ms` is when the judgment was available, from the start of the request |
| `notes` | string[] | counting rules and fallbacks that were applied, a phase that was named but not applied, the trials left out for lack of a value, and the overlap of comparison arms |
| `warnings` | string[] | truncation, periods left out of a trend because the sample holds them only in part, years beyond the 40 a per-year count covers, unplotted points, unmapped countries, network links cut to the limit |
| `version` | string | `chatctg/0.1.0` |
</details>

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
    "version": "chatctg/0.1.0"
  }
}
```

### Streaming: `POST /query/stream`

Same body as `POST /query`, but the response type is `text/event-stream`:

| Event | Data | When |
|---|---|---|
| `judged` | `{ intent, dimension, secondary_dimension, chart: { chosen, provisional }, chart_named, recruiting_only, phase_filter, jev_ms }`: Jev's answers as the planner applies them before the names are read, and the chart they imply | as soon as Jev answers, while the names are being extracted; not sent when no chart will answer |
| `interpretation` | `{ interpretation, chart, arms }`: `meta.interpretation`, the applied chart and `meta.arms` | after interpret and plan, before any fetch |
| `progress` | `{ arm, fetched, total }` | after each registry page |
| `title` | `{ title }` | when the titler returns within its 4 s cap |
| `result` | the full response body | at the end |
| `error` | the error body | on failure; the stream then closes |

The web app draws a skeleton of the provisional chart type as soon as `judged` arrives, so the shape of the answer shows before the data.

```bash
curl -N localhost:3001/query/stream -H 'content-type: application/json' -d '{"query":"Where are CAR-T trials run?"}'
```

### `GET /schema` and `GET /health`

`GET /schema` returns `{ request, response }`, each a JSON Schema (draft 2020-12) generated from the zod contract by `z.toJSONSchema`.

```json
{ "ok": true, "version": "chatctg/0.1.0", "api_version": "2.0.5", "data_timestamp": "2026-10-08T09:00:05" }
```

## How it decides

```
request ──► interpret ──► plan ──► fetch ──► aggregate ──► spec ──► response
             │ Jev (one request, 12 questions)        │
             │ OpenAI extraction (strict JSON)         │ OpenAI title (parallel with fetch)
```

`runQuery(request, deps)` in `packages/engine/src/run.ts` runs the stages. Plan, aggregate and spec are pure functions with their own tests. The three network clients (Jev, OpenAI, ClinicalTrials.gov) are passed in as `deps`, so tests swap in fakes. `runQuery` records timing per stage and never throws: every failure is a typed value that becomes an HTTP status.

1. **Interpret.** Jev and the extractor run in parallel.
2. **Plan.** `plan(answers, entities, request)` returns the arms, dimensions, chart, metric and limit, or `not_answerable`.
3. **Fetch.** One paged request sequence per arm, the arms in parallel. The titler runs meanwhile. A yearly trial count over a truncated fetch then asks the registry for each year's exact count.
4. **Aggregate.** One pure function per data shape: buckets, points, graph, rows, value.
5. **Spec.** Builds the `Visualization`, the subtitle and `meta`, then validates the response against the contract.

### The twelve Jev questions

Jev receives a small state, `{ question, provided }`, where `provided` holds the structured request fields. It answers all twelve questions in one request. A `choice` returns a probability for every option and a confidence. A `noul` returns the probability that a statement is true. The instructions are in English. Each option has a `what`, a `not_for` where confusion is likely, and examples. Every choice has a way out (`none` or `other`). The set is `{ id: "query-interpretation", version: 2 }` and is returned in `meta`. The version goes up whenever wording or options change; version 2 added `phase_filter`. The wording is in [packages/judgment/src/interpretation.ts](packages/judgment/src/interpretation.ts).

Before the chart is chosen, the planner makes the answers consistent with each other. The rules marked (note) add a line to `meta.notes`. Default limits: 10 for rankings and for open-dimension distributions and comparisons, 15 for country bars, 25 rows for tables, 40 edges for networks. A number the question names ("top 5") replaces the default.

### Chart compatibility

Jev's chart (or the request's) is applied when the matrix allows it for the intent and dimensions. Otherwise the allowed chart Jev rates next most likely applies (the default on a tie or when none has any probability), and `meta.interpretation.chart` records `chosen`, `applied`, `explicit` and `reason`.

| Intent | Data shape | Default | Also allowed |
|---|---|---|---|
| `time_trend` | buckets over time, optional series | `line` | `bar` (drawn as `stacked_bar` with a secondary dimension); `stacked_bar` with a secondary dimension; `scatter` when explicit |
| `distribution` | buckets over a dimension, optional series | `bar`; `stacked_bar` with a secondary dimension; `histogram` over enrollment (without a secondary dimension) | `bar` in every case (drawn as `stacked_bar` with a secondary dimension); `stacked_bar` and `grouped_bar` with a secondary dimension; `scatter` when explicit |
| `comparison` | arms × dimension | `grouped_bar`; `line` over start year | `stacked_bar`; `scatter` when explicit |
| `ranking` | top N over an open dimension | `bar`, horizontal and value-sorted | `map` over country |
| `geographic` | buckets over country | `map` | `bar` (top 15) when explicit |
| `network` | nodes and edges | `network_graph` | none |
| `count` | one number | `single_value` | none |
| `lookup` | rows of studies | `table` | `scatter` when explicit |
| `other` | none | none (422) | none |

## Data handling

### Fields

Every registry request asks for exactly these 19 fields, verified against the live API on 2026-10-09:

`NCTId`, `BriefTitle`, `OverallStatus`, `Phase`, `StartDate`, `PrimaryCompletionDate`, `LeadSponsorName`, `LeadSponsorClass`, `CollaboratorName`, `Condition`, `InterventionName`, `InterventionType`, `LocationCountry`, `EnrollmentCount`, `StudyType`, `Sex`, `StdAge`, `ConditionMeshTerm`, `InterventionMeshTerm`.

Each study is normalized into a flat `Study` (`packages/ctgov/src/study.ts`). `countries` is the distinct set across a study's locations. Missing modules become empty arrays or `null`; nothing is invented.

### Caching

An in-memory LRU (TODO: expand LRY) cache (200 entries, one-hour TTL) keyed by the full request URL makes a repeated query skip the registry. The registry's version endpoint is cached for ten minutes. The cache is per process and is lost on restart.

## Citations

A citation is one registry record that supports a data point, with the exact value that put it there:

```json
{ "nct_id": "NCT00000002", "title": "Study NCT00000002",
  "field": "protocolSection.designModule.phases", "excerpt": "PHASE1" }
```

`field` is the JSON path in the ClinicalTrials.gov study record. `excerpt` is the value at that path. Each data point cites up to `citations_per_point` studies (default 5, at most 25, 0 for none): the most recently started of the studies that contributed to it, with undated studies last and the NCT ID as the tie-break. `study_count` always gives the full number, so a reader knows how many studies the citations sample.

A network edge cites the studies where both ends co-occur. Its `field` joins the two paths with ` | `, and its excerpt names both values, such as `leadSponsor.name: "Merck" · meshes[].term: "pembrolizumab"`.

`meta.source.requests` lists every ClinicalTrials.gov URL sent, with its `total_count` and the number of studies `fetched` from it. Any number in a response can be checked by opening those URLs and applying the counting rules above, as long as the registry's `data_timestamp` has not changed.

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

`npm run eval:extract` sends the 24 questions with labelled entities to `gpt-5.4-nano` and `gpt-4.1-nano` and prints, per model, how many it extracted correctly and its p50 and p90 latency. The run on 2026-10-09:

| Model | Correct | Latency p50 | Latency p90 |
|---|---|---|---|
| `gpt-5.4-nano` | 23 of 24 | 770 ms | 935 ms |
| `gpt-4.1-nano` | 22 of 24 | 795 ms | 1582 ms |

Both missed "Show me a table of phase 2 trials for migraine started in 2023": they returned `start_year` 2023 with `end_year` null, so the table covers trials started from 2023 rather than in 2023. `gpt-4.1-nano` also returned no condition for "Which sponsors test the most drugs for rare diseases, as a network?". `gpt-5.4-nano` stays for both roles, the extractor and the titler: it is the more accurate, and the faster at p50 and p90. The Responses API required `reasoning: { effort: "none" }` for it; `minimal` is rejected for this model. Each model id is one constant in `packages/engine/src/openai.ts`.

### Tests

`npm run check` runs the typecheck, eslint and 227 vitest tests in 25 files. Every test runs offline. In the engine and API tests, Jev is a scripted fake that returns well-formed distributions, and ClinicalTrials.gov is a fake client, like the real one stopping when its signal is aborted, over twelve hand-built studies that exercise every counting rule (several phases, no start date, no enrollment, several countries, combinations, a drug with no MeSH terms) or over the two recorded registry pages. The clients' own tests inject `fetch` in place of the network.

| Package | Tests | What they pin |
|---|---|---|
| `contracts` | 13 | defaults, rejection of unknown fields, the year order, the caps, each chart's spec shape, the JSON Schema export, the error shape |
| `judgment` | 20 | answer validation (a missing option, a distribution that does not sum to 1, a wrong type, a noul outside [0, 1], a choice that exists only on the prototype chain), retries on 429 with `retry-after`, no retry on 401 and only the status in an auth failure's detail, never throwing; the question set uses exactly the contract's enums (the phase filter's options are the phases plus `none`), every option has a `what`, every choice has a way out, the state holds only the provided fields |
| `ctgov` | 28 | the URL builder (quoting, `AND`/`OR`, Essie ranges, the 19 fields), paging and truncation, a first page sized to the cap, the sort (descending unless asked otherwise), the cache, no retry on 400, one retry on 503, progress per page, normalization of a registry-shaped record, the country mapping (every spelling in the recorded pages, a trailing parenthetical, names on the prototype chain), the fake client's abort, its `StartDate` ranges and its ascending sort |
| `engine` | 134 | the planner (thresholds, normalization, arms, limits, the compatibility matrix on representative cells, explicit scatter and its reason, a geographic map unless a bar is asked for, a lookup's scatter, a bar over a secondary dimension drawn stacked, a histogram dropping it, the phase filter applied to every arm, overridden by the request, skipped below 0.5 and skipped with its note under a split by phase), the periods of a time series (year ranges and the 40-year cap, exact yearly buckets, the boundary period and the cut), identity sets and citation fields per dimension, bucketing (multi-valued counting, gap filling, quarters, top N, secondary series, sums and medians, enrollment bins, why a study was left out), merged arms, graphs (weights, pairs, pruning that never empties the graph, collaborators), points and rows, the spec for every chart type (value-sorted rankings, per-arm totals, the not-shown line, the phase in the subtitle), the plan summary the titler reads, extraction parsing (a trailing "trials" dropped, names deduplicated) and its auth-failure detail, the output caps that leave room for reasoning tokens, `runQuery` end to end with fakes (every intent, overrides, a named phase reaching the registry call and `meta`, fetch sizes, exact yearly counts over a truncated fetch from the oldest start date or the question's start year, the cut of incomplete quarters and of a trend split by phase, 422, 502 per upstream, 504 before and during the fetch, a thrown error becoming a 500, the title fallback, an exact count), and `runQuery` over the recorded registry pages |
| `apps/api` | 9 | the routes, the snake_case `/health` body, 400 with issues, 422, the SSE event order on success and on failure, and the SSE headers flushed on open |
| `apps/web` | 23 | each chart renders from a spec in jsdom (the scatter on a log axis with decade ticks, the network inside its frame with only its larger nodes labelled), a table row click picks its citations, the palette, the stream parser (including events split across chunks, and a stream that closes without a result), the history cap |

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
- "Trials per year for breast cancer since 2010" answered a `line` with every year from 2010 to 2028 (19 rows, 2027 and 2028 being planned start dates), each the registry's exact count for that year (500 in 2010, 1,046 in 2024), with `coverage.truncated: false` over 13,187 trials. It sent 22 requests (three pages of the first fetch and one per year) and took 3.3 s in all, 2.0 s of it fetching. Before the per-year counts, the same question drew only 2024 to 2028 from the 3,000 most recently started.
- `POST /query/stream` emitted `judged`, then `interpretation`, then `progress` per page with `title` as soon as the titler returned, then `result`.
- An unknown field (`phase` in place of `trial_phase`) got 400 `invalid_request`, naming the key.
- "What is the weather in Boston?" got 422 `not_answerable`, with the interpretation in `details`.

The visual check of the charts against live responses: done 2026-10-09; findings in the Limitations section.

## Design decisions and trade-offs

**A judged pipeline instead of a tool-calling agent or text-to-SQL.** Two alternatives were rejected. A tool-calling agent (an LLM loop with search and aggregate tools) needs three to six round trips and puts the planning step, the one most prone to invention, inside a generative model. A pre-indexed warehouse with text-to-SQL gives fast aggregates, but it needs a mirror of the registry that goes stale, and text-to-SQL is the least constrained AI step possible. The judged pipeline limits generation to two narrow steps: the extraction copies names from the question, and the titler rephrases the plan. Neither chooses the chart, the grouping or any data value. The cost is coverage: ChatCTG answers only the question classes its options describe (nine intents, thirteen dimensions, ten charts), and a question outside them gets a 422 or the nearest class.

**Jev plus extraction instead of one LLM call.** One structured LLM call could return the intent, the chart and the entities together. Jev was chosen for the closed decisions because it returns a probability for every option, which gives the thresholds something to act on and lets the response show its alternatives, and because it cannot answer outside the options. All twelve questions go in one request (p50 181 ms in the latest evaluation). The strings still need a generative model, so the extractor runs in parallel with Jev and is limited to verbatim names under a strict schema. The cost is two vendors and two keys, and the wording of the questions matters: four wording edits moved agreement from 95% to 99%.

**Download and aggregate instead of count queries.** The registry can return `totalCount` for any filter, so a bar chart could be one count query per bucket. ChatCTG fetches the matching studies once (19 fields each) and aggregates locally instead. One fetch then serves any dimension, a secondary split, medians, networks and scatter, and every bucket can cite the studies in it. Count queries cannot cite and need one request per bucket, which open dimensions like sponsor make unbounded. The cost is the cap: a topic with more matching trials than `max_studies` is aggregated over its most recently started trials, and the response says so. Two shapes use counts instead: a single value is the registry's exact `totalCount`, and a yearly trial count over a truncated fetch, where the sample would hold only the last few years, is one count request per year (at most 40), each also reading a few trials of its year for the citations.

**Projected fields and a cap.** Asking for 19 fields instead of whole records keeps pages small. The default cap of 3,000 studies bounds the fetch to three pages (about 2.5 s at the measured 0.8 s per page). `sort=StartDate:desc` makes the truncated sample deterministic and lets the subtitle state exactly which trials were read. A caller who needs more can raise `max_studies` to 10,000 and wait longer.

**An LLM title grounded in the plan.** The titler sees a one-sentence summary of the plan ("A bar chart of the number of trials by phase, for melanoma trials.", or "The total number of recruiting phase 3 psoriasis trials." for a count), not the user's question. It can only rephrase what was built, so a misread question cannot produce a title that describes a different chart. It runs in parallel with the fetch, so it adds wall-clock time only when it outlasts the fetch, and it is capped at 4 s with a template fallback. The subtitle, which carries the counts and caveats, is never generated. The cost is that titles follow the plan's wording rather than the user's.

**zod as the single source of the contract.** The request and the response are zod schemas in `packages/contracts`. They give the request validation, the TypeScript types for the engine and the web app, the JSON Schema at `/schema`, and the runtime check of every response before it leaves. The types, the validation and the served schema cannot drift apart. The tables in this README are written by hand from the same schemas. The cost is that the JSON Schema export loses refinements such as the year order.

**Clients that never throw.** The Jev, OpenAI and ClinicalTrials.gov clients return typed results instead of throwing, and `runQuery` catches anything unexpected. Every failure therefore maps to one status and one `reason`, and the tests can assert each mapping.

## Limitations and next steps

- **Sequential paging.** Pages within an arm are fetched one after another, about 0.8 s per 1,000 studies. Partitioning the query by `StartDate` ranges would let the pages of one arm run in parallel.
- **No synonym expansion.** The extractor keeps brand names as written and ChatCTG does not map them to generic names, so "Keytruda" and "pembrolizumab" are separate queries. A synonym table or a MeSH lookup before the fetch would close this.
- **MeSH fallback inconsistency.** A study with MeSH terms is identified by them; a study without them is identified by its registered names. The same drug can therefore appear as two buckets or two nodes ("pembrolizumab" from MeSH and "pembrolizumab 200mg" from a registered name). Edge citations always name the MeSH path for drugs and conditions and give the lowercased identity, even when the identity came from a registered name.
- **No server-side persistence.** The cache is in memory and the history lives in the browser's `localStorage`.
- **English only.** The Jev instructions, the extraction prompt and the labels are English.
- **Deployment.** The Dockerfile builds one image that serves the API and the web app. Hosting it is not done.
- **Extractor slips.** The extractor read "started in 2023" as a start year with no end year (the benchmark's one miss), and in one live run it read "since 2010" as 2010 to 2026, which leaves out trials planned to start later. It also sometimes kept the word "trials" in a condition: in one example run it returned "melanoma trials", which matched no trial and drew an empty network, and a re-run returned "melanoma". In 10 more calls with that question, one returned "melanoma trials" next to "melanoma". That slip is now normalised away: the extractor is told to return the name alone, and a trailing "trial", "trials", "study" or "studies" is dropped from every extracted name before the names are deduplicated. Checking each name against the registry before the fetch would catch slips of other kinds.
- **Quarterly, monthly and split trends over large sets are trimmed.** A trend by quarter or month, split by a second grouping, or of enrollment, over more trials than `max_studies`, shows only the periods the sample of the most recently started trials covers in full, which can be the last year or two. Counting each period exactly, as yearly trial counts are, would take one request per period and series.
- **Many requests for a long yearly count.** A yearly count over a truncated fetch sends one request per year and arm in parallel, up to 40 per arm, after the first fetch. They are cached for an hour, but a burst of such questions could meet the registry's rate limit; the client retries a 429 once.
- **A small evaluation.** 25 questions show the question set works on the intended classes. They do not measure how Jev handles phrasing far from them. A larger labelled set, and scoring the planner's applied output as well as Jev's raw answers, are the next steps.

<!-- visual-check -->

## AI tools

ChatCTG was built with Claude Code (Claude Fable 5.1) as the implementer, working from a design spec and an implementation plan that the author wrote and reviewed. Each task of the plan went to an implementer agent and then to a separate reviewer agent that checked it against the spec, with fixes before the next task.

Designed deliberately by the author:

- the judged-pipeline shape: Jev for closed decisions, one narrow extraction, deterministic code for everything else;
- the Jev question set: the twelve questions, their options and criteria;
- the thresholds and the chart compatibility matrix;
- the request and response contract;
- the citation rules: what a data point cites, the field path and excerpt per dimension, the two-ended edge citation, `meta.source.requests`;
- the evaluation set: the 25 questions and their labels.

Generated with Claude Code and adapted: the workspace boilerplate, the Recharts and D3 chart components, the CSS, and the test scaffolding. The four wording clarifications after the first evaluation run were made during implementation and checked against the unchanged labels. The twelfth question, `phase_filter`, was specified by the author after the first evaluation and scored on five new labels. The Jev client is adapted from the author's own earlier client (fetch over `POST /v1/systemone`, timeouts, retries with jitter, strict validation of every answer, never throwing).

How correctness was checked:

- the labelled Jev evaluation against the live API (above);
- offline tests with fakes for all three services, over a twelve-study sample built to exercise every counting rule and over two pages recorded from the live registry;
- validation of every response against the contract, in the engine and in the tests for each chart type;
- review of each task against the spec;
- the five example runs against the live APIs, their totals re-queried from the registry and their excerpts checked against their buckets;
- a live end-to-end run of the API, and a visual check of the charts.

The design is in [docs/superpowers/specs/2026-10-09-chatctg-design.md](docs/superpowers/specs/2026-10-09-chatctg-design.md). Where the spec and the shipped code differ, this README describes the code.