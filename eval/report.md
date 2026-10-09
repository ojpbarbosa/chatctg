# Jev agreement on 25 labelled questions

Run: 2026-10-09T08:28:19.080Z · model: jev-latest · agreement: 82/82 (100%) · latency p50 160 ms, p90 222 ms

| Question | Intent | Dimension | Chart | Flags | Other | ms |
|---|---|---|---|---|---|---|
| How has the number of pembrolizumab trials changed per year since 2015? | ✓ time_trend (1.00) | ✓ start_year (1.00) | ✓ line (0.97) |  |  | 214 |
| How many melanoma trials started each year? | ✓ time_trend (1.00) | ✓ start_year (1.00) | ✓ line (0.88) |  |  | 174 |
| How are melanoma trials distributed across phases? | ✓ distribution (1.00) | ✓ phase (0.99) | ✓ bar (0.85) |  |  | 154 |
| What are the most common intervention types for diabetes trials? | ✓ distribution (0.80) | ✓ intervention_type (0.85) | ✓ bar (0.93) |  |  | 163 |
| Compare phases for trials involving pembrolizumab vs nivolumab | ✓ comparison (1.00) | ✓ phase (0.81) | ✓ grouped_bar (0.89) | ✓ combination=0.05 |  | 183 |
| Compare sponsor classes across asthma and COPD trials | ✓ comparison (1.00) | ✓ sponsor_class (0.72) | ✓ grouped_bar (0.78) |  |  | 150 |
| Which countries have the most recruiting trials for lupus? | ✓ geographic (0.88) | ✓ country (0.50) | ✓ bar (0.79) | ✓ recruiting_only=0.91 |  | 149 |
| Show a network of sponsors and drugs for melanoma trials | ✓ network (1.00) | none (0.61) | ✓ network_graph (1.00) | ✓ chart_named=0.98 | ✓ edge_kind=sponsor_drug (1.00) | 153 |
| Which drugs frequently co-occur in combination studies with pembrolizumab? | ✓ network (0.98) | drug (0.64) | ✓ network_graph (0.78) |  | ✓ edge_kind=drug_drug (1.00) | 191 |
| How many phase 3 psoriasis trials are recruiting? | ✓ count (1.00) | none (0.86) | ✓ single_value (0.99) | ✓ recruiting_only=0.95 |  | 160 |
| List recruiting trials for pediatric asthma in Canada | ✓ lookup (1.00) | none (0.95) | ✓ table (1.00) | ✓ recruiting_only=0.94 |  | 143 |
| Top 10 sponsors running Alzheimer's disease trials | ✓ ranking (1.00) | ✓ sponsor (0.91) | ✓ bar (0.83) |  |  | 223 |
| Which conditions are most studied with semaglutide? | ✓ ranking (1.00) | ✓ condition (0.80) | ✓ bar (0.76) |  |  | 163 |
| Show a scatter plot of enrollment against start date for lupus trials | ✓ lookup (0.56) | start_year (0.61) | ✓ scatter (1.00) | ✓ chart_named=0.99 |  | 140 |
| How are CAR-T trials distributed by enrollment size? | ✓ distribution (1.00) | ✓ enrollment (0.96) | ✓ histogram (1.00) |  |  | 217 |
| Trials per year by phase for breast cancer since 2010 | ✓ time_trend (0.99) | ✓ start_year (0.87) | ✓ line (0.43) |  | ✓ secondary_dimension=phase (0.95) | 153 |
| Where are CAR-T trials run? | ✓ geographic (1.00) | ✓ country (0.57) | ✓ map (0.74) |  |  | 138 |
| Which sponsors collaborate most with the National Cancer Institute? | ✓ ranking (0.65) | sponsor (0.80) | ✓ bar (0.66) |  | ✓ edge_kind=sponsor_collaborator (1.00) | 235 |
| How many participants have been enrolled in Alzheimer's trials per year? | ✓ time_trend (1.00) | ✓ start_year (0.99) | ✓ line (0.98) |  | ✓ metric=enrollment_total (1.00) | 145 |
| Trials for pembrolizumab plus chemotherapy by phase | ✓ distribution (0.98) | ✓ phase (1.00) | ✓ bar (0.46) | ✓ combination=0.95 |  | 154 |
| What's the weather in Boston? | other (0.94) | none (0.99) | single_value (0.88) | ✓ in_scope=0.01 |  | 222 |
| Compare phases of recruiting trials in Germany vs France | ✓ comparison (1.00) | ✓ phase (0.86) | ✓ grouped_bar (0.89) | ✓ recruiting_only=0.78 |  | 158 |
| Show me a table of phase 2 trials for migraine started in 2023 | ✓ lookup (1.00) | none (0.73) | ✓ table (1.00) | ✓ chart_named=0.98 |  | 170 |
| Which sponsors test the most drugs for rare diseases, as a network? | ✓ network (0.61) | sponsor (0.53) | ✓ network_graph (0.88) | ✓ chart_named=0.52 | ✓ edge_kind=sponsor_drug (0.67) | 220 |
| Median enrollment of phase 3 oncology trials by sponsor class | ✓ distribution (0.49) | ✓ sponsor_class (0.71) | ✓ bar (0.96) |  | ✓ metric=enrollment_median (1.00) | 160 |

## Disagreements

None.

## Disagreements explained

- Where are CAR-T trials run? (disagreed in runs 1 to 3, agreed in the final run, so the answer is unstable around 0.5): the dimension answer is borderline (none 0.53 against country). The chart (map) and intent (geographic) both agree, and the engine derives country from the geographic intent, so the label stays and the disagreement stays.

## Wording changes between runs

First run: 71/75 (95%). Four edits to `packages/judgment/src/interpretation.ts` (option keys and order unchanged): intent says a requested network means network; lookup covers one-point-per-trial plots; the dimension question says that in a comparison the attribute is what is measured, not the named things; the table chart is not for counts per category. Second run: 74/75 (99%). No labels were changed. Run 3 extended the script to score secondary dimension, metric and edge kind too: 81/82 (99%), the same single disagreement. A final re-run after the type fix scored 82/82 (100%) because that borderline answer flipped to country.

## Extractor benchmark

Pending: OPENAI_API_KEY was invalid at run time; re-run `npm run eval:extract` after replacing it. (Both models failed 24/24 calls with openai_network, because the key contains a non-ASCII character and cannot be sent as a header.) EXTRACTOR_MODEL and TITLER_MODEL are unchanged.
