# Network momentum: eigenvector delta reads subgraph densification as personal momentum

**Status:** open. Interim mitigation (V3) proposed separately; the real fix is a research task.
**Found:** 2026-08-20, while checking whether the coherence gate's 46% CN board was an artifact.
**Scope:** `net_mom` only. `net_vis` was measured and is NOT affected — see "Why the level is clean".

---

## The defect

Eigenvector centrality rises when your neighbourhood densifies even if your own edges do not
multiply. `network_momentum_scoring.py` weights the **eigenvector percentile delta at 0.50** —
the largest of its three terms, and with no documented rationale at the constants
(`W_EIGENVECTOR = 0.50`, `W_DEGREE = 0.30`, `W_BETWEENNESS = 0.20`) or in the module docstring.

So when a national co-authorship subgraph becomes more internally interconnected between the
early and recent windows, every member's eigenvector percentile rises against the global graph,
and `net_mom` reads that as individual trajectory.

## The measurements

Over the NSCLC rising-eligible pool (n = 1,934), median values by country:

| | degree_delta | **eigenvector_delta** | betweenness_delta | net_mom pctile |
|---|---|---|---|---|
| CN | 1.0 | **+13.0** | 1.0 | **66.9** |
| US | 1.0 | 0.0 | 3.0 | 45.5 |
| JP | 1.0 | 0.0 | 3.0 | 45.0 |
| EU5 | 1.0 | **-3.0** | 3.0 | 36.7 |

Degree delta is identical across every group. Betweenness delta *favours* US/EU5/JP. The entire
national spread in `net_mom` comes from the eigenvector term.

**The dissociation that proves it is structural, not individual** — the group gaining the most
eigenvector centrality is adding collaborators the *slowest*:

| | pubs/yr early→recent | growth | collaborators early→recent | **growth** | % whose collab grew |
|---|---|---|---|---|---|
| CN | 1.8 → 2.2 | 1.22x | 45 → 60 | **1.33x** | **68.7** |
| US | 2.0 → 2.6 | 1.30x | 67 → 114 | **1.70x** | 74.4 |
| JP | 2.0 → 2.4 | 1.20x | 46 → 73 | 1.59x | 75.3 |
| EU5 | 1.8 → 2.2 | 1.22x | 76 → 108 | 1.42x | 71.2 |

Percentile shifts are near zero-sum across a graph. A +13 median for 719 people against -3 for
another group is a redistribution, not 719 individual trajectories.

**Author-list convention was tested and refuted.** Median authors per TA paper since 2021:
CN 9.0, other 10.0, US 12.0, JP 13.0, EU5 14.0. Chinese papers carry the *smallest* author lists
in the corpus, so collaborator inflation via large author blocks is not the mechanism.

## Why the level is clean (and `net_vis` is not affected)

`network_influence_score` = `0.4*degree_pct + 0.4*eigen_pct + 0.2*betw_pct`, so eigenvector is 40%
of `net_vis` — comparable to its 50% share of `net_mom`. It does **not** carry the artifact.
Median over the pool, `recent_roll` window:

| | degree pct | eigen pct | betw pct | influence | net_vis pctile |
|---|---|---|---|---|---|
| CN | 91.0 | 94.0 | 93.0 | 90.3 | 54.2 |
| US | 96.0 | 93.0 | 90.0 | **92.0** | **56.4** |
| EU5 | 96.0 | 93.0 | 84.5 | 91.3 | 52.2 |
| JP | 95.5 | 89.0 | 81.0 | 88.5 | 39.1 |

CN's eigenvector **level** is 94 against US 93 and EU5 93 — indistinguishable. CN's influence
score is the lowest of CN/US/EU5.

**The artifact is specific to the DELTA, not the LEVEL.** Densification is a change phenomenon:
each window's eigenvector is percentiled against its own global distribution, so a uniformly
well-connected pool sits at 88-94 everywhere and national differences wash out. Only the
*between-window change* captures the subgraph getting denser. This is why fixing `net_mom` alone
is sufficient for the artifact as identified, and why V3 is a complete interim rather than half
of one.

## Why cross-component filtering was rejected

Scoped 2026-08-20. `hcp_network_centrality_v2` stores **scalars only** — the edge list is not
persisted, so any variant must rebuild the graph from `publication_authors_v2`.

Labelling coverage is not the obstacle: institution 99.7% of nodes / 99.3% of edges,
country 98.5% / 98.3%, leaving 18,164 unlabellable edges (1.7%).

Per-country edge composition (edge-ends) is what kills it:

| | % cross-country | % cross-institution |
|---|---|---|
| CN | **9.7** | 77.1 |
| JP | **10.6** | 76.1 |
| US | 28.8 | **71.0** |
| EU5 | 32.5 | 85.6 |
| other | 47.6 | 79.6 |

- **Cross-institution does not fix it.** CN sits at 77.1%, near the 78% global average, and US is
  the *lowest* group. A densifying Chinese subgraph is overwhelmingly composed of different
  Chinese institutions, so the filter leaves national densification intact and mildly penalises US.
- **Cross-country overcorrects.** It removes ~90% of CN and JP edge-ends against ~70% for US/EU5.
  Eigenvector is superlinear in neighbourhood connectivity, so this does not neutralise the +13 —
  it very likely inverts it into an anti-CN/JP bias. It also encodes "collaborates
  internationally" as "has network momentum", a different substantive claim.
- **It breaks the measure.** At 25.1% global edge retention the filtered graph will fragment.
  Eigenvector centrality is degenerate on a disconnected graph — power iteration converges to the
  dominant component and assigns ~0 elsewhere, and `eigenvector_centrality_numpy` (the existing
  fallback) has the same property. A large share of the pool would score ~0 for structural reasons.

Runtime was never the constraint: one extra `nx.eigenvector_centrality` run per window on ~589K
edges is seconds to minutes, and betweenness (the k=1000-sampled step) need not re-run.

## The real fix — research task

**Cross-community edges, with a disconnection-tolerant centrality.**

1. Run community detection (Louvain/Leiden) on the **early** window graph.
2. Count only edges crossing detected communities — bridging into new communities registers,
   densification within one does not.
3. Replace eigenvector with **PageRank (damped) or Katz**, both of which are defined on
   disconnected graphs, removing the fragmentation hazard above.

This needs no nationality in the scoring path, and adapts to real structure rather than to
political boundaries. Known risks to resolve during the work:

- Community assignments shift between windows — a moving denominator, the same class of problem
  as the one being fixed. Anchoring communities to the early window (step 1) is a partial answer;
  it needs testing.
- PageRank/Katz change the meaning of the axis, not just its inputs. The 0.50 weight should be
  re-derived rather than inherited, since it was never justified in the first place.
- Verify against the two named separations that motivated the gate: Singh/Velez must stay
  separated, and Passaro/Lamberti status must be a deliberate outcome rather than a side effect.

## Blast radius when this is taken on

`hcp_network_centrality_v2` feeds more than the rising board. Re-run order, serial:

1. `network_centrality_scoring.py` x 4 windows (`early_roll`, `recent_roll`, + 2 fixed labels if still read)
2. `network_momentum_scoring.py` (4,077 rows)
3. `rising_star_scoring.py` — **both** `net_mom` and `net_vis` derive from centrality, so two of
   four gate components move at once
4. `recompute_established_ranks_v3.py` and `rising_composite_scoring.py` — both read
   `hcp_network_centrality_v2` directly (`:300` and `:140`), so the **Established board and the AD
   composite move too**
5. Snapshot after, not before
6. Narrative regeneration + stranded manifest, on **both** boards

Also re-verify: connected-component structure of each graph (new failure mode), and the two
frontend paths reading centrality live (`api.ts:2355`, `api.ts:4252`).

## Related

- `docs/RISING_COHERENCE_GATE_BEFORE_AFTER.md` — the board this artifact partly produced
- `scripts/score/network_momentum_scoring.py:45-47` — the undocumented weights
- `scripts/score/network_centrality_scoring.py:35-37` — influence-score weights (0.4/0.4/0.2)
