# Example runs

Produced by `npm run examples` against the live APIs. Each file holds the request and the full response.

| File | Question | Type | Total trials | Jev | Total |
|---|---|---|---|---|---|
| [time-trend-pembrolizumab.json](./time-trend-pembrolizumab.json) | How has the number of trials for this drug changed per year since 2015? | line | 2,909 | 311 ms | 4361 ms |
| [distribution-melanoma-phases.json](./distribution-melanoma-phases.json) | How are melanoma trials distributed across phases? | bar | 3,775 | 322 ms | 3304 ms |
| [comparison-pembrolizumab-nivolumab.json](./comparison-pembrolizumab-nivolumab.json) | Compare phases for trials involving pembrolizumab vs nivolumab | grouped_bar | 5,004 | 162 ms | 3551 ms |
| [geographic-lupus-recruiting.json](./geographic-lupus-recruiting.json) | Which countries have the most recruiting trials for lupus? | map | 324 | 280 ms | 1858 ms |
| [network-sponsors-drugs-melanoma.json](./network-sponsors-drugs-melanoma.json) | Show a network of sponsors and drugs for melanoma trials | network_graph | 3,775 | 184 ms | 1374 ms |
