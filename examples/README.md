# Example runs

Produced by `npm run examples` against the live APIs. Each file holds the request and the full response.

| File | Question | Type | Total trials | Jev | Total |
|---|---|---|---|---|---|
| [time-trend-pembrolizumab.json](./time-trend-pembrolizumab.json) | How has the number of trials for this drug changed per year since 2015? (drug_name pinned in the request) | line | 2,909 | 472 ms | 4700 ms |
| [distribution-melanoma-phases.json](./distribution-melanoma-phases.json) | How are melanoma trials distributed across phases? | bar | 3,775 | 388 ms | 3152 ms |
| [comparison-pembrolizumab-nivolumab.json](./comparison-pembrolizumab-nivolumab.json) | Compare phases for trials involving pembrolizumab vs nivolumab | grouped_bar | 5,004 | 206 ms | 3561 ms |
| [geographic-lupus-recruiting.json](./geographic-lupus-recruiting.json) | Which countries have the most recruiting trials for lupus? (chart pinned in the request) | map | 324 | 249 ms | 2311 ms |
| [network-sponsors-drugs-melanoma.json](./network-sponsors-drugs-melanoma.json) | Show a network of sponsors and drugs for melanoma trials | network_graph | 3,775 | 249 ms | 1892 ms |
| [bubble-melanoma-phase-sponsor-class.json](./bubble-melanoma-phase-sponsor-class.json) | Show phase by sponsor class for melanoma trials as bubbles | bubble | 3,775 | 209 ms | 1880 ms |
| [heatmap-asthma-status-phase.json](./heatmap-asthma-status-phase.json) | Heatmap of trial status by phase for asthma | heatmap | 5,298 | 207 ms | 3760 ms |
| [timeline-lupus-phase3-recruiting.json](./timeline-lupus-phase3-recruiting.json) | Timeline of recruiting phase 3 lupus trials (trial_status pinned in the request) | timeline | 17 | 258 ms | 1431 ms |
| [sankey-melanoma-sponsor-class-phase.json](./sankey-melanoma-sponsor-class-phase.json) | Show how melanoma trials flow from sponsor class to phase as a sankey | sankey | 3,775 | 195 ms | 1644 ms |
