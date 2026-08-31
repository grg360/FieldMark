# The percentile convention

**Changed 2026-08-18.** One formula, nine sites, all of them scoring scripts.

## Before

```python
percentile = 100.0 * (1.0 - position / (n - 1))     # positional form, 0-indexed descending
percentile = 100.0 * (ranks[i] - 1) / (n - 1)       # rankdata form, 1 = lowest
```

The two expressions are the same function written twice. Both place the first member at
**exactly 100.0** and the last at **exactly 0.0**.

Neither is a claim the data supports. Being first in a list of 251 is standing above 250
named people we measured, not above every oncologist in lung cancer; being last is the
251st position, not the absence of standing. On the global Established board Yi-Long Wu
read 100.00 and on Rising, Jing Du read 0.0 at rank 251 — both artifacts of a finite list,
rendered as facts.

## After

```python
percentile = 100.0 * (n - position) / (n + 1)       # positional form, 0-indexed descending
percentile = 100.0 * ranks[i] / (n + 1)             # rankdata form, 1 = lowest
```

The **Weibull plotting position**: `100 × (n + 1 − rank) / (n + 1)` for 1-based descending
rank. First member gets `100n/(n+1)`, last gets `100/(n+1)`. Both ends sit inside the range.

| n | first | last |
|---|---|---|
| 251 (Rising) | 99.60 | 0.40 |
| 2,992 (Established US) | 99.967 | 0.033 |
| 16,903 (publication leadership) | 99.994 | 0.006 |

## The affine relationship

New and old are related by a single affine map, which is why the change cannot reorder
anything computed from one column alone:

```
p_new = α · p_old + β        α = (n − 1) / (n + 1)        β = 100 / (n + 1)
```

α < 1 shrinks the range and β lifts it off the floor. Both depend only on n, so **within a
column, order is preserved exactly**. Order can only shift where a composite mixes two
columns scored over different populations and therefore different α — for the Established
composite (0.60 scientific + 0.40 network) that re-weighting is about 0.012%, measured as
15% of rows moving by at most 3 places, with Band A resolving identical members.

## n = 1

The old code special-cased a single-member scope to `100.0`, because `n − 1` is zero. The
new formula has no such division and returns **50.0** — the midpoint. That is deliberate and
it is the same argument as the endpoints: one person in a scope is neither the top nor the
bottom of anything, and 100.0 is exactly the artifact this change removes. Nine NSCLC
country scopes have a single member today (BD, CY, EE, ET, GD, LA, LV, UY, ZA); each moves
from 100.0 to 50.0. The `if n == 1` branch is deleted at every site rather than repointed —
it existed only to dodge the zero denominator.

## The nine sites

| file | line | form |
|---|---|---|
| `scripts/score/publication_leadership_scoring.py` | 166 | positional |
| `scripts/score/network_centrality_scoring.py` | 121 | positional |
| `scripts/score/pharma_engagement_scoring.py` | 78 | positional |
| `scripts/score/rising_composite_scoring.py` | 160 | positional |
| `scripts/score/recompute_established_ranks_v3.py` | 337 | positional |
| `scripts/score/rising_star_scoring.py` | 139 | rankdata |
| `scripts/score/scientific_momentum_scoring.py` | 131 | rankdata |
| `scripts/score/network_momentum_scoring.py` | 122 | rankdata |
| `scripts/score/emergence_scoring.py` | 141 | rankdata |

## The one place it does not reach

`network_centrality_scoring.py` carries the corrected formula, but writes its three percentile
columns through `int(round(...))`, which absorbs the change entirely: at n = 93,906 the new
bottom value 0.001065 rounds to **0** and the new top 99.9989 rounds to **100**. Those three
columns therefore still hold the exact endpoints this convention exists to remove, and the
frontend reads them. Fixing it needs a schema change and a 471,761-row rewrite, not a formula
change — logged separately at `docs/CENTRALITY_PERCENTILES_STORED_AS_INT.md`, and the reason
`network_centrality_scoring` was dropped from the 2026-08-18 rescore chain.

There is no SQL-side equivalent — every function in the database was checked for
`percent_rank` and `cume_dist`; there are none. The convention is entirely Python.

## Why all nine and not the two that showed the artifact

The Established board score is `0.60 × scientific + 0.40 × network`. The scientific half comes
from `publication_leadership_scoring.py`, not from the Established scorer. Fixing only the two
files where the artifact was noticed would have left Yi-Long Wu at exactly 100.0 on the
scientific half and produced a board where the convention held in some columns and not
others — worse than either version applied consistently.
