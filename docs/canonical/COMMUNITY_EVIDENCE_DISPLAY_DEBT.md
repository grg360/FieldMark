# Community evidence surface — recorded, not fixed

Opened 2026-09-17, alongside the two defects fixed the same day (the lung-worded anchored
label, and the Part B cell reading a table with no colorectal rows). Both items below were
found while tracing those two. **Neither is fixed. Both change data rather than display, and
both move the board.**

Current board sizes and tier distributions: `docs/canonical/COMMUNITY_BOARD_BASELINE.md`.

---

## 1. `patient_volume` cannot distinguish "never computed" from "measured zero"

> **STATUS 2026-09-18 — the colorectal instance is gone; the MECHANISM is not.**
> `medicare_aggregator.py` gained `--ta` and was run for colorectal, writing 1,741
> `hcp_medicare_by_ta_v2` rows; `community_scoring.py --ta colorectal-cancer --execute` then
> took `patient_volume > 0` from **0 to 1,717**. So the specific zero described below is no
> longer in the table. See `COMMUNITY_BOARD_BASELINE.md`, re-baseline 2026-09-18.
>
> **The defect itself is untouched.** `parse_float(..., 0.0)` still turns a missing row into an
> explicit zero, `coalesce(...,0)` and `> 0` still erase it twice more, and the next TA
> onboarded without a code set will reproduce it exactly. What has changed is that the
> aggregator now **refuses to run** against an empty `ta_hcpcs_codes` slice, which closes the
> upstream route to it — but not the mechanism.

### The mechanism, in three erasures

`scripts/score/community_scoring.py` reads its volume from `hcp_medicare_by_ta_v2`:

```python
patient_volume = parse_float(
    med_ta.get("ta_beneficiaries_3yr_total"),
    parse_float(med_ta.get("ta_beneficiaries_3yr_high_confidence"), 0.0),
)
```

A **missing row** and a **row reading zero** both come out `0.0`, and that is what is written to
`hcp_community_scores_v2.patient_volume`. Then:

1. `community_scoring.py` — `parse_float(..., 0.0)` turns an absent row into an explicit zero.
2. `community_board_v1` — `coalesce(b.patient_volume, 0)` in `community_ledger` turns a NULL
   into the same zero.
3. the ledger's Part B cell — `patient_volume > 0` turns that zero into a rendered dash.

Three independent layers, each of which would have been the last chance to keep the
distinction. **"Absence is never zero" is a platform principle this violates three times over.**

### Why it is not academic

`hcp_medicare_by_ta_v2` holds rows for `hepatology` (15,106), `nsclc` (4,413) and
`rare-disease` (1). It holds **none** for `colorectal-cancer`. So every colorectal HCP carries
a confident, explicit `patient_volume = 0.0` that was never measured — including the 330
anchored ones, who hold 34–561 Part B beneficiaries each in `hcp_hcpcs_detail`.

That is what produced the visible defect: 330 physicians whose tier is *defined* by Part B
claims, each rendering a Part B dash. The display half is fixed (see
`docs/crc_community/63_ledger_part_b_present.sql`); **the zero is still in the table.**

### Why it was not fixed here

The honest repair is a NULL, not a zero — `patient_volume` should be nullable and
`community_scoring.py` should write NULL when there is no source row. But `patient_volume`
feeds `community_board_v1.qualifies`:

```sql
c.patient_volume > 0 OR EXISTS (SELECT 1 FROM hcp_part_d_oncology_v1 pd WHERE pd.hcp_id = c.hcp_id)
```

`NULL > 0` is NULL, not false — so the change is inert for `qualifies` only as long as the
`OR` arm holds every row up. That needs verifying per TA before it ships, not assuming.

**Do not "fix" this by populating `hcp_medicare_by_ta_v2` for colorectal.** Those 330 carry
34–561 beneficiaries; giving them a real `patient_volume` admits people to the board on volume
alone and is a **membership change, not a display fix**. Separate measurement, separate
decision.

---

## 2. `community_board_v1.part_d_present` has no TA predicate

### What it actually says

```sql
(EXISTS (SELECT 1 FROM hcp_part_d_oncology_v1 pd WHERE pd.hcp_id = c.hcp_id)) AS part_d_present
```

No therapeutic area anywhere in it. `PART D ✓` on a colorectal row means *"this HCP has some
oncology Part D claim"* — heme, breast, prostate, anything — not a colorectal one. It reads
true for 330 of 330 anchored colorectal and 980 of 980 anchored lung.

This is an **over-broad** claim rather than a false one, which is why it ranks below the two
defects fixed today. But it is the reason the two Medicare cells read exactly backwards from
the truth on those 330 rows: the TA-agnostic fact showed a check, the TA-specific one showed
a dash.

### It *can* be scoped — and that is the problem

`hcp_part_d_oncology_v1` carries `drug_group`, so the predicate is writable:

| drug_group | rows | HCPs |
|---|---:|---:|
| heme | 110,134 | 11,090 |
| breast | 87,900 | 10,203 |
| prostate | 32,244 | 7,371 |
| gi_renal | 10,015 | 4,235 |
| lung | 9,656 | 3,886 |
| colorectal | 1,662 | 1,157 |

Scoping it to `drug_group IN ('colorectal','gi_renal')`, measured twice:

| | 2026-09-17 | **2026-09-18** |
|---|---:|---:|
| colorectal board | 13,864 | **13,914** |
| board if scoped | **4,507** | **5,360** |
| **anchored lost** | **133 of 330** | **0 of 337** |
| **supported lost** | not measured | **0 of 530** |

**The blocker is gone.** On 2026-09-17 `qualifies` was `patient_volume > 0 OR part_d_present`
with `patient_volume` identically zero across colorectal, so the unscoped Part D flag was the
only thing holding that board up and narrowing it would have evicted 133 anchored physicians
whose tier is defined by a Part B pattern they demonstrably have. Now that the Part B arm has
data, every anchored and supported member stands on their own claims and **scoping costs zero
of them.**

**It is still not scoped, and that is still a decision.** It removes roughly 8,554
candidate-tier members — a real membership change that needs its own measurement, its own
block, and its own re-baseline. What changed is only the price of doing it.

Same class as blocks 60 and 61: a correct-looking narrowing whose blast radius is a membership
change. **Measure before anyone touches it.**

### The shape of the real fix, for whoever picks it up

> **Superseded in part, 2026-09-18.** The paragraph below said `qualifies` has no Part B arm.
> That was wrong in an instructive way: it **has** one — `patient_volume > 0` — it had simply
> never had data for colorectal. No schema change was needed, only a run. The remaining gap is
> narrower than stated: `patient_volume` is a beneficiary COUNT from `hcp_medicare_by_ta_v2`,
> not a presence fact, so it still answers "how many" where `part_b_present` answers "any at
> all", and a TA whose aggregator has not been run still reads as a confident zero.

The defect underneath both items is that `qualifies` has no Part B arm at all. It asks "do they
have beneficiaries, or any oncology Part D row" and never "do they have claims against this
area's own code set" — which is the one question that is answerable for every TA with a code
set, and is now computed in `community_ledger` as `part_b_present`. A `qualifies` that read

```sql
patient_volume > 0 OR part_b_present OR part_d_present(scoped)
```

would let the Part D arm be scoped without dropping the 133, because their Part B pattern would
hold them up on its own evidence. **That is a board-membership change and needs its own
measurement, its own block, and a baseline re-capture. It is not started.**

---

## 3. `hcp_medicare_by_ta_v2` is upsert-only, so withdrawn rows never die

Recorded 2026-09-17 while adding `--ta` to `medicare_aggregator.py`.

On the **v1** path the aggregator truncates before it writes. On the **v2** path it does not —
both truncate blocks are gated `if target_version == "v1"` (`medicare_aggregator.py:845, :881`),
and v2 upserts on `hcp_id` and on `(hcp_id, therapeutic_area_id)`.

Upsert-only is the right choice for a TA-scoped run — it is exactly what lets a colorectal job
leave nsclc alone. But it has a consequence nobody has had to think about while the table was
written by a single unscoped run:

**A row is never removed.** If an HCP's membership in a TA is later withdrawn, or their NPI
changes, or the code set stops matching them, their row keeps the values from whatever run last
touched it — indefinitely, with an `aggregated_at` that looks current-ish and a value that is
not.

Measured today, rows whose HCP is **no longer a member** of the TA the row is for:

| TA | stale rows | of |
|---|---:|---:|
| hepatology | 312 | 15,106 |
| nsclc | 140 | 4,413 |
| rare-disease | 1 | 1 |
| **total** | **452** | |

Every one was written on 2026-08-03, the only run this table has ever had. `rare-disease` is
the whole "cohort": its single row is for an HCP who is no longer in the TA.

**Not fixed here, and not a blocker for the colorectal work** — these rows are read per
`(hcp_id, therapeutic_area_id)`, so a stale row is only reachable by a consumer that has already
decided the HCP is in that TA, which by definition it is not. The exposure is to consumers that
scan the table rather than join through membership.

The fix is a reconciling delete after each scoped run: remove rows for `(hcp, TA)` pairs that
the run considered and did not produce. That needs the aggregator to distinguish "considered and
matched nothing" from "not considered", which it does not currently track — the same
absence-versus-zero distinction as item 1, one table over.

---

## 4. The aggregator's only built-in correctness assertion is dead

Found 2026-09-17 in the first scoped dry-run log.

`medicare_aggregator.py` carries a `CANONICALS` fixture (`:33`) — four named HCPs whose
summary and per-TA rows are printed at the end of every run so a human can eyeball that the
numbers are sane. Every one of them reported:

```
"summary_exists": false,
"expected_ta_row_exists": false,
```

Not a scoping artefact. All four `hcp_id` values return **zero rows** from `hcps_v2`:

| label | expected TA | hcp_id | in hcps_v2 |
|---|---|---|---|
| Loomba | Hepatology | `9339ead6-…` | no |
| Sanyal | Hepatology | `32495742-…` | no |
| Chalasani | Hepatology | `6f9dd309-…` | no |
| Garassino | NSCLC | `dc645bf0-…` | no |

These are **v1 UUIDs**, and the problem is already written down — see
`archive/stale_root_docs_20260701/HANDOFF.md:184`, "v1 canonical UUIDs still referenced in
open_payments_aggregator.py and medicare_aggregator.py canonical_check blocks". It has simply
never been actioned.

So the check has been printing four blocks of `null` on every run since the v2 migration, and
a reader skimming the log sees structure where there is no assertion. This is part of why an
entire TA aggregating to nothing was survivable: the script's self-verification cannot fail,
because it no longer resolves anyone.

**Not fixed here.** The repair is to re-point the fixture at four v2 HCPs with known non-zero
Medicare rows — one per active board TA, ideally including a colorectal one now that the code
set exists — and to make a canonical that resolves to nothing a non-zero exit rather than a
`null` in a log. `open_payments_aggregator.py:70` carries the same dead fixture and should be
done in the same pass.
