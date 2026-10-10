# Example runs

Produced by `npm run examples` against the live APIs. Each file holds the request and the full response.

| File | Question | Type | Total trials | Jev | Total |
|---|---|---|---|---|---|
| [time-trend-pembrolizumab.json](./time-trend-pembrolizumab.json) | How has the number of trials for this drug changed per year since 2015? | line | 2,909 | 500 ms | 4787 ms |
| [distribution-melanoma-phases.json](./distribution-melanoma-phases.json) | How are melanoma trials distributed across phases? | bar | 3,775 | 366 ms | 3124 ms |
| [comparison-pembrolizumab-nivolumab.json](./comparison-pembrolizumab-nivolumab.json) | Compare phases for trials involving pembrolizumab vs nivolumab | grouped_bar | 5,004 | 231 ms | 4303 ms |
| [geographic-lupus-recruiting.json](./geographic-lupus-recruiting.json) | Which countries have the most recruiting trials for lupus? | map | 324 | 1831 ms | 4119 ms |
| [network-sponsors-drugs-melanoma.json](./network-sponsors-drugs-melanoma.json) | Show a network of sponsors and drugs for melanoma trials | network_graph | 3,775 | 596 ms | 2180 ms |
| [bubble-melanoma-phase-sponsor-class.json](./bubble-melanoma-phase-sponsor-class.json) | Show phase by sponsor class for melanoma trials as bubbles | bubble | 3,775 | 203 ms | 2739 ms |
| [heatmap-asthma-status-phase.json](./heatmap-asthma-status-phase.json) | Heatmap of trial status by phase for asthma | heatmap | 5,298 | 278 ms | 4080 ms |
| [timeline-lupus-phase3-recruiting.json](./timeline-lupus-phase3-recruiting.json) | Timeline of recruiting phase 3 lupus trials | timeline | 17 | 239 ms | 1579 ms |
| [sankey-melanoma-sponsor-class-phase.json](./sankey-melanoma-sponsor-class-phase.json) | Show how melanoma trials flow from sponsor class to phase as a sankey | sankey | 3,775 | 300 ms | 1721 ms |
