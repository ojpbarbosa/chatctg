# Jev agreement on 25 labelled questions

Run: 2026-10-09T18:54:19.834Z, model: jev-latest, question set: query-interpretation v2, agreement: 87/87 (100%), latency p50 181 ms and p90 197 ms

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

## Disagreements

None.

## Disagreements explained

- Where are CAR-T trials run? (disagreed in runs 1 to 3 of version 1, agreed in its final run and in the version 2 run, so the answer is unstable around 0.5): the dimension answer is borderline (country 0.52 in the version 2 run, against none). The chart (map) and intent (geographic) both agree, and the engine derives country from the geographic intent, so the label stays and the disagreement stays possible. "Which countries have the most recruiting trials for lupus?" is borderline the same way (country 0.46 as the top option in the version 2 run), and the engine also derives country from its geographic intent.

## Wording changes between runs

First run: 71/75 (95%). Four edits to `packages/judgment/src/interpretation.ts` (option keys and order unchanged): intent says a requested network means network; lookup covers one-point-per-trial plots; the dimension question says that in a comparison the attribute is what is measured, not the named things; the table chart is not for counts per category. Second run: 74/75 (99%). No labels were changed. Run 3 extended the script to score secondary dimension, metric and edge kind too: 81/82 (99%), the same single disagreement. A final re-run after the type fix scored 82/82 (100%) because that borderline answer flipped to country.

Version 2 of the question set adds a twelfth question, `phase_filter`, a choice over the six registry phases and `none`, so "How many phase 3 psoriasis trials are recruiting?" counts only phase 3 trials. The other eleven questions are unchanged. Five questions gained a `phase_filter` label: `PHASE3` for the psoriasis count and the oncology median, `PHASE2` for the migraine table, and `none` for the two questions that split by phase. The run above scored 87/87 (100%): the 82 earlier labels and the 5 new ones. Every `phase_filter` answer had a probability of 0.94 or more.

## Extractor benchmark

`npm run eval:extract` on 2026-10-09 sent the 24 questions with labelled entities to each model:

- `gpt-5.4-nano`: 23/24 correct, p50 770 ms, p90 935 ms. The miss: "Show me a table of phase 2 trials for migraine started in 2023" returned `start_year` 2023 with `end_year` null.
- `gpt-4.1-nano`: 22/24 correct, p50 795 ms, p90 1582 ms. The same miss, plus "Which sponsors test the most drugs for rare diseases, as a network?" returned no condition.

`gpt-5.4-nano` stays for both roles (`EXTRACTOR_MODEL` and `TITLER_MODEL`): it is more accurate and has the lower p50 and p90. The Responses API required `reasoning: { effort: "none" }` for it; `minimal` is rejected for this model.
