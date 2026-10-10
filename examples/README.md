# Example runs

Produced by `npm run examples` against the live APIs. Each file holds the request and the full response.

| File | Question | Type | Total trials | Jev | Total |
|---|---|---|---|---|---|
| [time-trend-pembrolizumab.json](./time-trend-pembrolizumab.json) | How has the number of trials for this drug changed per year since 2015? | line | 2,909 | 618 ms | 4850 ms |
| [distribution-melanoma-phases.json](./distribution-melanoma-phases.json) | How are melanoma trials distributed across phases? | bar | 3,775 | 423 ms | 3484 ms |
| [comparison-pembrolizumab-nivolumab.json](./comparison-pembrolizumab-nivolumab.json) | Compare phases for trials involving pembrolizumab vs nivolumab | grouped_bar | 5,004 | 218 ms | 3853 ms |
| [geographic-lupus-recruiting.json](./geographic-lupus-recruiting.json) | Which countries have the most recruiting trials for lupus? | map | 324 | 210 ms | 1481 ms |
| [network-sponsors-drugs-melanoma.json](./network-sponsors-drugs-melanoma.json) | Show a network of sponsors and drugs for melanoma trials | network_graph | 3,775 | 463 ms | 2039 ms |
