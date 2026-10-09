# Jev agreement on 25 labelled questions

Run: 2026-10-09T08:27:06.544Z · model: jev-latest · agreement: 74/75 (99%) · latency p50 163 ms, p90 201 ms

| Question | Intent | Dimension | Chart | Flags | ms |
|---|---|---|---|---|---|
| How has the number of pembrolizumab trials changed per year since 2015? | ✓ time_trend (1.00) | ✓ start_year (1.00) | ✓ line (0.98) |  | 287 |
| How many melanoma trials started each year? | ✓ time_trend (1.00) | ✓ start_year (0.99) | ✓ line (0.90) |  | 163 |
| How are melanoma trials distributed across phases? | ✓ distribution (1.00) | ✓ phase (0.99) | ✓ bar (0.81) |  | 195 |
| What are the most common intervention types for diabetes trials? | ✓ distribution (0.81) | ✓ intervention_type (0.85) | ✓ bar (0.90) |  | 151 |
| Compare phases for trials involving pembrolizumab vs nivolumab | ✓ comparison (1.00) | ✓ phase (0.81) | ✓ grouped_bar (0.90) | ✓ combination=0.04 | 168 |
| Compare sponsor classes across asthma and COPD trials | ✓ comparison (1.00) | ✓ sponsor_class (0.73) | ✓ grouped_bar (0.74) |  | 173 |
| Which countries have the most recruiting trials for lupus? | ✓ geographic (0.90) | ✓ country (0.50) | ✓ bar (0.72) | ✓ recruiting_only=0.88 | 179 |
| Show a network of sponsors and drugs for melanoma trials | ✓ network (1.00) | none (0.59) | ✓ network_graph (1.00) | ✓ chart_named=0.97 | 151 |
| Which drugs frequently co-occur in combination studies with pembrolizumab? | ✓ network (0.99) | drug (0.63) | ✓ network_graph (0.76) |  | 191 |
| How many phase 3 psoriasis trials are recruiting? | ✓ count (1.00) | none (0.88) | ✓ single_value (0.99) | ✓ recruiting_only=0.95 | 145 |
| List recruiting trials for pediatric asthma in Canada | ✓ lookup (1.00) | none (0.95) | ✓ table (1.00) | ✓ recruiting_only=0.94 | 163 |
| Top 10 sponsors running Alzheimer's disease trials | ✓ ranking (1.00) | ✓ sponsor (0.93) | ✓ bar (0.86) |  | 215 |
| Which conditions are most studied with semaglutide? | ✓ ranking (1.00) | ✓ condition (0.77) | ✓ bar (0.72) |  | 168 |
| Show a scatter plot of enrollment against start date for lupus trials | ✓ lookup (0.63) | start_year (0.65) | ✓ scatter (1.00) | ✓ chart_named=0.99 | 201 |
| How are CAR-T trials distributed by enrollment size? | ✓ distribution (1.00) | ✓ enrollment (0.96) | ✓ histogram (1.00) |  | 156 |
| Trials per year by phase for breast cancer since 2010 | ✓ time_trend (0.99) | ✓ start_year (0.88) | ✓ line (0.39) |  | 164 |
| Where are CAR-T trials run? | ✓ geographic (1.00) | ✗ none (0.53) | ✓ map (0.76) |  | 200 |
| Which sponsors collaborate most with the National Cancer Institute? | ✓ ranking (0.57) | sponsor (0.85) | ✓ bar (0.69) |  | 158 |
| How many participants have been enrolled in Alzheimer's trials per year? | ✓ time_trend (1.00) | ✓ start_year (0.98) | ✓ line (0.97) |  | 146 |
| Trials for pembrolizumab plus chemotherapy by phase | ✓ distribution (0.97) | ✓ phase (1.00) | ✓ bar (0.44) | ✓ combination=0.96 | 137 |
| What's the weather in Boston? | other (0.96) | none (1.00) | single_value (0.89) | ✓ in_scope=0.01 | 144 |
| Compare phases of recruiting trials in Germany vs France | ✓ comparison (1.00) | ✓ phase (0.86) | ✓ grouped_bar (0.89) | ✓ recruiting_only=0.76 | 141 |
| Show me a table of phase 2 trials for migraine started in 2023 | ✓ lookup (1.00) | none (0.72) | ✓ table (1.00) | ✓ chart_named=0.98 | 151 |
| Which sponsors test the most drugs for rare diseases, as a network? | ✓ network (0.61) | sponsor (0.57) | ✓ network_graph (0.92) | ✓ chart_named=0.56 | 174 |
| Median enrollment of phase 3 oncology trials by sponsor class | ✓ distribution (0.58) | ✓ sponsor_class (0.74) | ✓ bar (0.97) |  | 153 |

## Disagreements

- Where are CAR-T trials run?: dimension expected country, got none (0.53)
## Disagreements explained

- Where are CAR-T trials run?: the dimension answer is borderline (none 0.53 against country). The chart (map) and intent (geographic) both agree, and the engine derives country from the geographic intent, so the label stays and the disagreement stays.

## Wording changes between runs

First run: 71/75 (95%). Four edits to `packages/judgment/src/interpretation.ts` (option keys and order unchanged): intent says a requested network means network; lookup covers one-point-per-trial plots; the dimension question says that in a comparison the attribute is what is measured, not the named things; the table chart is not for counts per category. Second run: 74/75 (99%). No labels were changed. The report checks only intent, dimension, chart and flags; secondary dimension, edge kind and metric labels are not scored by this script.

## Extractor benchmark

Pending: OPENAI_API_KEY was invalid at run time; re-run `npm run eval:extract` after replacing it. (Both models failed 24/24 calls with openai_network, because the key contains a non-ASCII character and cannot be sent as a header.) EXTRACTOR_MODEL and TITLER_MODEL are unchanged.
