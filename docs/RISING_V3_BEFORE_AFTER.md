# Rising board: V3 eigenvector country-normalisation

Captured 2026-08-20 before the rescore. Gate unchanged (all four components >= P50);
only net_mom's eigenvector term changes, normalised within country (MIN_NORM_GROUP=30).

## Board size

| | board | US | keeps of 251 |
|---|---|---|---|
| delta >= 3 (pre-gate) | 251 | 58 | - |
| coherence gate, net_mom as-is | 338 | 59 | 120 |
| coherence gate + V3 | **336** | **76** | 124 |

## Country mix

| country | delta>=3 | coherence | coherence + V3 |
|---|---|---|---|
| CN | 109 | 157 | 97 |
| US | 58 | 59 | 76 |
| JP | 8 | 31 | 35 |
| IT | 16 | 8 | 30 |
| FR | 11 | 11 | 17 |
| ES | 7 | 11 | 12 |
| DE | 4 | 7 | 7 |
| GB | 1 | 5 | 5 |
| KR | 9 | 8 | 9 |
| CA | 2 | 3 | 3 |

## National median net_mom (the artifact, and its removal)

| | before | after V3 |
|---|---|---|
| CN | 66.9 | 45.2 |
| US | 45.5 | 56.8 |
| JP | 45.0 | 51.2 |
| EU5 | 36.7 | 57.4 |
| other | 48.1 | 55.0 |

## Named cases

| name | net_mom before | net_mom after | before | after |
|---|---|---|---|---|
| Aditi P. Singh | 80.7 | 89.4 | ON | **ON** |
| Moises J. Velez | 6.1 | 5.6 | off | off |
| Antonio Passaro | 42.5 | 81.0 | off | **ON** |
| Giuseppe Lamberti | 43.2 | 52.4 | off | **ON** |

Passaro and Lamberti return: their exclusion was substantially the artifact, not a static network.
Singh/Velez separation is unaffected (89.4 vs 5.6).

---

## The 2026-08-20 snapshot row is NOT complete — read this before using it

Two board states existed on 2026-08-20:

| source_computed_at | board | gate |
|---|---|---|
| 2026-08-19 14:14 | 251 | `min_velocity_delta_applied = 3` |
| 2026-08-20 15:56 | 336 | `min_component_percentile_applied = 50` (coherence gate + V3) |

The morning capture recorded the first. The evening capture collided on all 2,232
rows under the then-narrow primary key `(snapshot_date, hcp_id, therapeutic_area_id)`
with `ON CONFLICT DO NOTHING`, and was discarded silently while reporting
"inserted 0 rows". Fixed by `migrations/2026_08_20_rising_snapshot_key_widen.sql`.

**Permanently lost: pre-V3 `network_momentum_percentile` for the 1,981 off-board
pool members.** `hcp_network_momentum_v1` is overwritten in place, one row per
(hcp, TA), and the V3 run at 15:56:10 rewrote it. The 08-20 capture stores the four
component percentiles for **251 of its 2,232 rows** — board members only, because
that is all `hcp_rising_star_ranks_v3` holds. Nothing recovers the rest.

Consequences for anyone reading that row:

- It answers "what did the delta >= 3 board look like" — completely, for its 251.
- It does **not** answer "who was close to entry under the coherence gate", because
  the components that decide that are absent for everyone off the board.
- The un-normalised `net_mom` distribution that motivated V3 exists now only in this
  document and in `docs/NETWORK_MOMENTUM_EIGENVECTOR_ARTIFACT.md`.

This is the exact loss the snapshot table was built to prevent, and it happened
between two captures on the same day.

**Standing fix, not done:** persist the four component percentiles for the whole
eligible pool rather than the board. That is also what would re-arm the snapshot's
gate-drift reconstruction, disarmed on 2026-08-20 for the same reason.

### Correction (same day): the first key fix was also wrong

The paragraph above says the collision was "fixed by
`migrations/2026_08_20_rising_snapshot_key_widen.sql`". It was not. That migration
keyed on `source_computed_at`, which is **per row** — board members take it from
`hcp_rising_star_ranks_v3`, off-board pool members from
`hcp_scientific_momentum_v1`. When only the rising scorer re-runs, off-board rows
keep the old momentum timestamp and still collide. The re-capture inserted 463 rows
and `DO UPDATE`-overwrote 1,769 rows of the morning capture with the evening
capture's provenance.

Superseded by `migrations/2026_08_20_rising_snapshot_capture_id.sql`: `capture_id`
uuid as the key, minted once per run; idempotence moved out of the key into a
pre-insert fingerprint lookup on the board's `computed_at`. The 1,769 rows are
repaired there (null `min_component_percentile_applied`, keep
`min_velocity_delta_applied = 3` — the morning capture genuinely ran under the delta
gate, and `mcp` was the contamination).

### What re-capture can and cannot recover

**The evening state (336-member board) reproduces in full.** Its three inputs are
all intact: `hcp_scientific_momentum_v1` (computed 08-19 14:14),
`hcp_network_momentum_v1` (08-20 15:56, post-V3) and `hcp_rising_star_ranks_v3`
(08-20 15:56, holding the 336). A clean capture under a fresh `capture_id` writes
the whole pool plus the board.

**The morning state (251-member board) is repairable in place but NOT re-runnable.**
Its pool membership was computed against the *pre-V3* `hcp_network_momentum_v1`,
which the V3 run overwrote. That table is one row per (hcp, TA), rewritten every
run, so the pre-V3 `network_momentum_percentile` and the `MIN_COLLABORATORS_PER_WINDOW`
eligibility it implied no longer exist. Re-running the capture today would produce
the *evening* pool wearing a morning date.

**The 212-row divergence is the visible edge of that.** Of the morning capture's
2,232 rows, 1,769 collided with the evening capture and 212 did not — those 212 were
in the morning pool and absent from the evening one, because V3 moved them across
the collaborator floor. That gap is the measurable difference between the two pools,
and it is the reason the morning capture can only be corrected where it stands.

So after the repair and re-capture, 2026-08-20 holds two captures that are not
symmetrical: the evening one is complete and reproducible, the morning one is
correct but frozen. Read the morning capture as authoritative for the delta >= 3
board's 251 members and for gate inputs sourced from scientific momentum; do not
read it as a complete account of who was near entry.
