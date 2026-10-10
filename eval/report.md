# Jev agreement on 33 labelled questions

Run: 2026-10-10T04:30:25.720Z, model: jev-latest, question set: query-interpretation v3, agreement: 122/123 (99%), latency p50 211 ms and p90 237 ms

| Question | Intent | Dimension | Chart | Flags | Other | ms |
|---|---|---|---|---|---|---|
| How has the number of pembrolizumab trials changed per year since 2015? | ✓ time_trend (1.00) | ✓ start_year (1.00) | ✓ line (0.99) |  |  | 449 |
| How many melanoma trials started each year? | ✓ time_trend (1.00) | ✓ start_year (1.00) | ✓ line (0.89) |  |  | 194 |
| How are melanoma trials distributed across phases? | ✓ distribution (1.00) | ✓ phase (0.99) | ✓ bar (0.86) |  | ✓ phase_filter=none (1.00) | 232 |
| What are the most common intervention types for diabetes trials? | ✓ distribution (0.88) | ✓ intervention_type (0.87) | ✓ bar (0.89) |  |  | 220 |
| Compare phases for trials involving pembrolizumab vs nivolumab | ✓ comparison (1.00) | ✓ phase (0.79) | ✓ grouped_bar (0.76) | ✓ combination=0.05 | ✓ phase_filter=none (1.00) | 198 |
| Compare sponsor classes across asthma and COPD trials | ✓ comparison (1.00) | ✓ sponsor_class (0.63) | ✓ grouped_bar (0.51) |  |  | 208 |
| Which countries have the most recruiting trials for lupus? | ✓ geographic (0.84) | ✓ country (0.54) | ✓ bar (0.81) | ✓ recruiting_only=0.91 |  | 197 |
| Show a network of sponsors and drugs for melanoma trials | ✓ network (1.00) | none (0.53) | ✓ network_graph (1.00) | ✓ chart_named=0.97 | ✓ edge_kind=sponsor_drug (1.00) | 193 |
| Which drugs frequently co-occur in combination studies with pembrolizumab? | ✓ network (0.99) | drug (0.61) | ✓ network_graph (0.74) |  | ✓ edge_kind=drug_drug (1.00) | 237 |
| How many phase 3 psoriasis trials are recruiting? | ✓ count (1.00) | none (0.83) | ✓ single_value (0.99) | ✓ recruiting_only=0.96 | ✓ phase_filter=PHASE3 (1.00) | 219 |
| List recruiting trials for pediatric asthma in Canada | ✓ lookup (1.00) | none (0.96) | ✓ table (1.00) | ✓ recruiting_only=0.94 |  | 189 |
| Top 10 sponsors running Alzheimer's disease trials | ✓ ranking (1.00) | ✓ sponsor (0.95) | ✓ bar (0.84) |  |  | 227 |
| Which conditions are most studied with semaglutide? | ✓ ranking (1.00) | ✓ condition (0.86) | ✓ bar (0.80) |  |  | 203 |
| Show a scatter plot of enrollment against start date for lupus trials | ✓ lookup (0.90) | start_year (0.51) | ✓ scatter (1.00) | ✓ chart_named=0.99 |  | 192 |
| How are CAR-T trials distributed by enrollment size? | ✓ distribution (1.00) | ✓ enrollment (0.98) | ✓ histogram (0.99) |  |  | 215 |
| Trials per year by phase for breast cancer since 2010 | ✓ time_trend (0.95) | ✓ start_year (0.84) | ✓ line (0.40) |  | ✓ secondary_dimension=phase (0.95) | 211 |
| Where are CAR-T trials run? | ✓ geographic (1.00) | ✓ country (0.52) | ✓ map (0.73) |  |  | 228 |
| Which sponsors collaborate most with the National Cancer Institute? | ✓ ranking (0.56) | sponsor (0.89) | ✓ bar (0.53) |  | ✓ edge_kind=sponsor_collaborator (1.00) | 228 |
| How many participants have been enrolled in Alzheimer's trials per year? | ✓ time_trend (1.00) | ✓ start_year (0.99) | ✓ line (0.98) |  | ✓ metric=enrollment_total (1.00) | 253 |
| Trials for pembrolizumab plus chemotherapy by phase | ✓ distribution (0.99) | ✓ phase (1.00) | ✓ bar (0.71) | ✓ combination=0.95 |  | 248 |
| What's the weather in Boston? | other (0.92) | none (0.99) | single_value (0.91) | ✓ in_scope=0.01 |  | 206 |
| Compare phases of recruiting trials in Germany vs France | ✓ comparison (1.00) | ✓ phase (0.81) | ✓ grouped_bar (0.81) | ✓ recruiting_only=0.75 |  | 229 |
| Show me a table of phase 2 trials for migraine started in 2023 | ✓ lookup (1.00) | none (0.55) | ✓ table (1.00) | ✓ chart_named=0.99 | ✓ phase_filter=PHASE2 (1.00) | 199 |
| Which sponsors test the most drugs for rare diseases, as a network? | ✓ network (0.67) | sponsor (0.59) | ✓ network_graph (0.97) | ✓ chart_named=0.51 | ✓ edge_kind=sponsor_drug (0.71) | 220 |
| Median enrollment of phase 3 oncology trials by sponsor class | ✓ distribution (0.66) | ✓ sponsor_class (0.85) | ✓ bar (0.96) |  | ✓ metric=enrollment_median (1.00) ✓ phase_filter=PHASE3 (0.96) | 212 |
| Show phase by sponsor class for melanoma trials as bubbles | ✓ distribution (0.99) | ✓ sponsor_class (0.78) | ✓ bubble (1.00) | ✓ chart_named=0.95 | ✓ secondary_dimension=phase (0.48) | 202 |
| Bubble chart of breast cancer trials by status and phase | ✓ distribution (0.95) | ✓ status (0.65) | ✓ bubble (1.00) | ✓ chart_named=0.98 | ✓ secondary_dimension=phase (0.87) | 208 |
| Heatmap of trial status by phase for asthma | ✓ distribution (1.00) | ✓ phase (0.80) | ✓ heatmap (1.00) | ✓ chart_named=0.98 | ✗ secondary_dimension=phase (0.93) | 209 |
| Show a heatmap of phases for pembrolizumab vs nivolumab trials | ✓ comparison (0.88) | ✓ phase (0.63) | ✓ heatmap (1.00) | ✓ chart_named=0.98 ✓ combination=0.04 |  | 210 |
| Timeline of recruiting phase 3 lupus trials | ✓ lookup (0.92) | start_year (0.93) | ✓ timeline (1.00) | ✓ chart_named=0.94 ✓ recruiting_only=0.52 | ✓ phase_filter=PHASE3 (1.00) | 228 |
| When did the most recent CAR-T trials start, and when do they end? | ✓ lookup (0.99) | start_year (0.71) | ✓ timeline (0.99) |  |  | 199 |
| Show how melanoma trials flow from sponsor class to phase as a sankey | ✓ distribution (0.98) | ✓ sponsor_class (0.92) | ✓ sankey (1.00) | ✓ chart_named=0.96 | ✓ secondary_dimension=phase (0.88) | 214 |
| How do Alzheimer's trials flow from sponsor class into recruitment status? | ✓ distribution (1.00) | ✓ sponsor_class (0.93) | ✓ sankey (1.00) |  | ✓ secondary_dimension=status (0.87) | 197 |

## Disagreements

- Heatmap of trial status by phase for asthma: secondary_dimension expected phase|status other than the dimension, got phase (0.93)

## Disagreements explained

- Where are CAR-T trials run? (disagreed in runs 1 to 3 of version 1, agreed in its final run and in the version 2 run, so the answer is unstable around 0.5): the dimension answer is borderline (country 0.52 in the version 2 run, against none). The chart (map) and intent (geographic) both agree, and the engine derives country from the geographic intent, so the label stays and the disagreement stays possible. "Which countries have the most recruiting trials for lupus?" is borderline the same way (country 0.46 as the top option in the version 2 run), and the engine also derives country from its geographic intent.

- Heatmap of trial status by phase for asthma (version 3): Jev answers phase for both the dimension (0.80) and the second grouping (0.93); status is the dimension's next answer (0.13 in a direct check). The two are separate questions, so nothing stops the same answer twice, and the script now counts a second grouping equal to the dimension as a miss whatever the labels allow. The planner covers it: when the chosen chart needs two attributes (bubble, heatmap, sankey) and Jev names one twice, the second is the next most likely attribute of either answer, so this question draws a heatmap of phase by status, with a note.
- Timeline of recruiting phase 3 lupus trials (version 3): the recruiting_only answer sits at 0.48 to 0.54 across the version 3 runs (0.52 above), so the eval passes or misses it by run. The planner applies the recruiting filter only from 0.7, so the live timeline is not restricted to recruiting trials; the phase 3 filter (1.00) and the timeline (1.00) do apply. The label stays, since the question names recruiting trials.

## Wording changes between runs

First run: 71/75 (95%). Four edits to `packages/judgment/src/interpretation.ts` (option keys and order unchanged): intent says a requested network means network; lookup covers one-point-per-trial plots; the dimension question says that in a comparison the attribute is what is measured, not the named things; the table chart is not for counts per category. Second run: 74/75 (99%). No labels were changed. Run 3 extended the script to score secondary dimension, metric and edge kind too: 81/82 (99%), the same single disagreement. A final re-run after the type fix scored 82/82 (100%) because that borderline answer flipped to country.

Version 2 of the question set adds a twelfth question, `phase_filter`, a choice over the six registry phases and `none`, so "How many phase 3 psoriasis trials are recruiting?" counts only phase 3 trials. The other eleven questions are unchanged. Five questions gained a `phase_filter` label: `PHASE3` for the psoriasis count and the oncology median, `PHASE2` for the migraine table, and `none` for the two questions that split by phase. The run above scored 87/87 (100%): the 82 earlier labels and the 5 new ones. Every `phase_filter` answer had a probability of 0.94 or more.

Version 3 of the question set adds four chart options, `bubble`, `heatmap`, `timeline` and `sankey`, after the ten existing ones, and eight labelled questions, two per new chart. The first version 3 run scored 117/123 (95%). Every new chart was itself chosen with a probability of 0.99 or more, but both sankey questions were judged `network` intents (0.99 and 0.75), the Alzheimer's flow put status first, and "Compare sponsor classes across asthma and COPD trials" drew a heatmap (0.34). One round of wording edits followed, option keys and order unchanged: `distribution` covers a flow from one attribute into another and `network` is not for such flows; the dimension question picks the attribute a flow comes from and the secondary question the one it flows into; `bubble` and `heatmap` no longer describe named things side by side and are not for a comparison unless asked for; `time_trend` is not for a timeline of individual trials. That run scored 122/123 (99%) with no label changed.

A live query then showed that "Heatmap of trial status by phase for asthma" passed the eval but drew a bar: Jev named phase for both groupings, which the labels (either order) accepted. Three wordings telling the two dimension questions to take the first and the second attribute named fixed it, but each moved a borderline question elsewhere ("Compare sponsor classes across asthma and COPD trials" to condition at 0.51 to 0.61, "Median enrollment of phase 3 oncology trials by sponsor class" to enrollment at 0.50 to 0.56, the CAR-T enrollment size from 0.96 to 0.72), so they were reverted and the planner rule above was added instead. The script now also counts a second grouping equal to the dimension as a miss. The run above, on the first round's wording, scored 122/123 (99%); its one miss is that doubled answer, which the planner repairs. "Where are CAR-T trials run?" (country 0.52 here, none in three of the five version 3 runs) and "Trials per year by phase for breast cancer since 2010" (line 0.40 here, grouped_bar 0.34 in the first version 3 run) stay borderline; when Jev's chart cannot draw a trend, the planner falls back to the allowed chart it rates most likely.

## Extractor benchmark

`npm run eval:extract` on 2026-10-09 sent the 24 questions with labelled entities to each model:

- `gpt-5.4-nano`: 23/24 correct, p50 770 ms, p90 935 ms. The miss: "Show me a table of phase 2 trials for migraine started in 2023" returned `start_year` 2023 with `end_year` null.
- `gpt-4.1-nano`: 22/24 correct, p50 795 ms, p90 1582 ms. The same miss, plus "Which sponsors test the most drugs for rare diseases, as a network?" returned no condition.

`gpt-5.4-nano` stays for both roles (`EXTRACTOR_MODEL` and `TITLER_MODEL`): it is more accurate and has the lower p50 and p90. The Responses API required `reasoning: { effort: "none" }` for it; `minimal` is rejected for this model.
