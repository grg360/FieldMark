# Rising board: before / after the coherence gate

Captured 2026-08-20, before the rescore. Source: hcp_rising_star_ranks_v3 (old board)
vs rising_star_scoring.py --dry-run under MIN_COMPONENT_PERCENTILE = 50 (new board).

## Size

| | board | US |
|---|---|---|
| before (delta >= 3) | 251 | 58 |
| after (all four >= P50) | 338 | 59 |

kept 120 · dropped 131 · added 218

## Named cases

| name | sci_mom | net_mom | sci_vis | net_vis | before | after |
|---|---|---|---|---|---|---|
| Aditi P. Singh | 93.4 | 80.7 | 92.3 | 82.5 | off | ON |
| Moises J. Velez | 66.7 | 6.1 | 27.7 | 9.8 | off | OFF |
| Antonio Passaro | 97.3 | 42.5 | 99.0 | 97.7 | on | OFF |
| Giuseppe Lamberti | 99.3 | 43.2 | 97.0 | 96.1 | on | OFF |

## Country mix

| country | before | after |
|---|---|---|
| CN | 109 | 157 |
| US | 58 | 59 |
| JP | 8 | 31 |
| ES | 7 | 11 |
| FR | 11 | 11 |
| IT | 16 | 8 |
| KR | 9 | 8 |
| DE | 4 | 7 |
| NL | 7 | 6 |
| TW | 2 | 6 |

## Dropped members, highest current rank first

| rank | name | country | binding axis (lowest component) |
|---|---|---|---|
| 30 | Zongyang Yu | CN | sci_vis 43.1 |
| 41 | Tao Xin | CN | sci_vis 44.9 |
| 43 | Wenxiong Zhang | CN | net_vis 46.2 |
| 52 | Antonio Passaro | IT | net_mom 42.5 |
| 54 | Giuseppe Lamberti | US | net_mom 43.2 |
| 56 | Xing‐Xing Fan | MO | net_vis 46.7 |
| 59 | Jung Seop Eom | KR | net_vis 24.3 |
| 63 | Zebo Jiang | CN | net_vis 41.0 |
| 65 | Yan Hu | CN | net_vis 46.5 |
| 75 | Jianhui Tian | CN | net_vis 15.9 |
| 80 | Xiao Li | CN | sci_vis 43.5 |
| 85 | Lishuang Qi | CN | sci_vis 38.8 |
| 97 | Yunpeng Yang | CN | net_mom 49.6 |
| 101 | Lizza Hendriks | NL | net_mom 41.6 |
| 102 | Chunxia Su | CN | net_mom 42.6 |
