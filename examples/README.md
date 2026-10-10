# Example runs

Produced by `npm run examples` against the live APIs. Each file holds the request and the full response.

| File | Question | Type | Total trials | Jev | Total |
|---|---|---|---|---|---|
| [time-trend-pembrolizumab.json](./time-trend-pembrolizumab.json) | How has the number of trials for this drug changed per year since 2015? | line | 2,909 | 533 ms | 4902 ms |
| [distribution-melanoma-phases.json](./distribution-melanoma-phases.json) | How are melanoma trials distributed across phases? | bar | 3,775 | 571 ms | 3348 ms |
| [comparison-pembrolizumab-nivolumab.json](./comparison-pembrolizumab-nivolumab.json) | Compare phases for trials involving pembrolizumab vs nivolumab | grouped_bar | 5,004 | 257 ms | 4020 ms |
| [geographic-lupus-recruiting.json](./geographic-lupus-recruiting.json) | Which countries have the most recruiting trials for lupus? | map | 324 | 251 ms | 1623 ms |
| [network-sponsors-drugs-melanoma.json](./network-sponsors-drugs-melanoma.json) | Show a network of sponsors and drugs for melanoma trials | network_graph | 3,775 | 228 ms | 1560 ms |
| [bubble-melanoma-phase-sponsor-class.json](./bubble-melanoma-phase-sponsor-class.json) | Show phase by sponsor class for melanoma trials as bubbles | bubble | 3,775 | 193 ms | 1497 ms |
| [heatmap-asthma-status-phase.json](./heatmap-asthma-status-phase.json) | Heatmap of trial status by phase for asthma | heatmap | 5,298 | 242 ms | 3039 ms |
| [timeline-lupus-phase3-recruiting.json](./timeline-lupus-phase3-recruiting.json) | Timeline of recruiting phase 3 lupus trials | timeline | 17 | 205 ms | 1457 ms |
| [sankey-melanoma-sponsor-class-phase.json](./sankey-melanoma-sponsor-class-phase.json) | Show how melanoma trials flow from sponsor class to phase as a sankey | sankey | 3,775 | 202 ms | 1598 ms |
