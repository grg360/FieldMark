# `hcps_v2.total_career_pubs` — incident history and structural diagnosis

**Written:** 2026-08-25, while scoping the CRC first build.
**Status:** unresolved. Four incidents since April 2026, all the same root cause.
**Companions:** [`ORCHESTRATOR_DEBT.md`](ORCHESTRATOR_DEBT.md),
[`GENERATE_CYCLE_DESIGN.md`](GENERATE_CYCLE_DESIGN.md).

---

## The structural diagnosis, in one sentence

**One column holds two different quantities, written by two different scripts, with no marker
saying which one a given row contains or when it was last true.**

This is not a data-quality problem that better inputs would fix. It is a schema problem: the column
has no single definition, so every consumer is reading a value whose meaning depends on which
writer touched that row last, and there is no way to find out which.

> ### Premise correction
> This column is **not** written only by career enrichment. There are **two** writers, and the
> second one derives from the corpus. That is the whole problem — see below.

---

## The two writers

### Writer 1 — `create_hcps_v2.py` (stage 2): an IN-CORPUS count, frozen at mint time

`scripts/classify/create_hcps_v2.py:456`:

```python
# total_career_pubs choice (per spec): use the DISTINCT pub_id count across all of
# the cluster's shards in author_pub_flat, NOT the sum of each shard's
# corpus_pub_count. ... A distinct pub_id union is the correct career footprint.
...
if all_pub_ids:
    total_career_pubs = len(all_pub_ids)
```

This counts **publications we have ingested**, at the moment the HCP is minted. It is never
refreshed for an HCP whose existing shards later accumulate more papers.

### Writer 2 — `career_enrichment_from_clusters.py` (stage 8a): OpenAlex `works_count`, a CAREER total

`scripts/enrich/career_enrichment_from_clusters.py:171`:

```python
def update_hcp_career_fields(supabase, hcp_id, works_count, first_pub_year, target_version="v1"):
    hcps_table = get_table_name("hcps", target_version)
    if target_version == "v2":
        update_payload = {"total_career_pubs": works_count, "career_first_pub_year": first_pub_year}
```

where `works_count` comes from `parse_works_count()` over the OpenAlex author record — the author's
**entire career**, including thousands of papers we have never ingested.

### The repo already diagnosed this and worked around it

`scripts/enrich/recompute_in_corpus_pub_count.py:8` (stage 8f) states it exactly:

> This script was originally scoped to RECOMPUTE `hcps_v2.total_career_pubs`. That was cancelled,
> because `total_career_pubs` holds two different quantities depending on the row:
>
> * On most rows it is OpenAlex's `works_count` — the author's CAREER total, which counts papers we
>   have never ingested. …
> * On others it is a flat union over `author_pub_flat` taken on the day the HCP was minted by
>   `create_hcps_v2.py:454-482` — an IN-CORPUS count, frozen thereafter. The only refresh path
>   (`create_hcps_v2.refresh_existing_hcp_derived_fields`) is called at
>   `create_hcps_v2.py:1299-1308` iterating ONLY `plan.link_inserts`, so an HCP whose EXISTING
>   shards accumulate more papers is never refreshed.
>
> Writing the corpus aggregate over that column would have silently redefined it for the first
> group, and moved the >=10 publication ranking gate in `scoring_pipeline.py` as a side effect.

**8f responded by creating a new column (`in_corpus_pub_count`) rather than fixing this one.** That
was the right call for 8f's scope and it left the defect in place.

---

## What it gates

### The hard gate — ranking eligibility

`scripts/score/scoring_pipeline.py:67`:

```python
# When OpenAlex has enriched hcps.total_career_pubs, require this minimum for rankings / non-zero composite.
MIN_TOTAL_CAREER_PUBS_FOR_RANKINGS = 10
# If total_career_pubs is null, fall back to counting publication rows in our DB.
MIN_STORED_PUBLICATIONS_FALLBACK = 6
MAX_STORED_PUBLICATIONS_FOR_RANKINGS = 200
```

`:85`:

```python
def passes_ranking_publication_threshold(total_career_pubs: Optional[int], stored_pub_count: int) -> bool:
    if stored_pub_count > MAX_STORED_PUBLICATIONS_FOR_RANKINGS:
        return False
    if total_career_pubs is not None:
        return total_career_pubs >= MIN_TOTAL_CAREER_PUBS_FOR_RANKINGS
    return stored_pub_count >= MIN_STORED_PUBLICATIONS_FALLBACK
```

Note the null-handling: a NULL falls back to a **different and lower** threshold (6 stored rows).
So a stale-low value is *worse than no value at all* — it silently fails a gate that a NULL would
have passed by another route.

### The second gate — cohort override

`scoring_pipeline.py:560`:

```
- total_career_pubs >= 500: established by volume alone, regardless of first_pub_year
- total_career_pubs >= 200 AND first_pub_year < 2020: established by combined
```

**528 HCPs** currently clear the ≥500 override — including every conflation artifact below.

### Every other consumer

| Consumer | Where | Use |
|---|---|---|
| `scoring_pipeline.py` | `:1051`, `:1018`, `:868` | ranking gate + career multiplier |
| `cohort_classification_v2.py` | `:116`, `:309`, `:578`, `:604` | **copied into `hcp_cohort_classification_v2`** |
| `established_scoring.py` | `:334`, `:682` | selected into the scoring row; debug output |
| `dedup_detect.py` | `:236`, `:501`, `:664`, `:670` | merge candidate ranking (primary vs stub) |
| `create_hcps_v2.py` | `:609` | conflation detection vs `CONFLATION_PUB_CEILING = 2000` |
| `reingest_diff.py` | `:24`, `:294` | `pub_count` in the weekly diff |
| **Frontend** | `App.tsx:189`, `api.ts:192`/`:362`, `CommunityHcpProfile.tsx:227` | displayed on profiles |
| **RPCs** | `community_roster_v1.sql`, `community_qualification_gate.sql`, `community_practice_profile.sql:46` | community surfaces |
| **DB views** | `hcp_established_ranks_v2`, `hcp_rising_star_ranks_v2`, `hcp_rising_star_ranks_deduped_v2` | board reads |

`cohort_classification_v2` is the worst of these: it **copies** the value into another table, so a
bad value propagates and outlives a fix to the source.

One consumer already routed around it. `frontend/src/components/Cohorts/CohortLedger.tsx:1640`:

```js
// in_corpus_pub_count, NOT total_career_pubs: what WE hold, not a career
```

Someone hit this, understood it, and fixed their own surface without fixing the column.

---

## No freshness signal

`hcps_v2` has `updated_at`, `nppes_enriched_at`, `affiliation_derived_at`, `npi_verified_at` —
**none specific to `total_career_pubs`**. `updated_at` is row-level and moves for any reason.

So there is no query that answers "is this HCP's career total current?", and no way to
distinguish a value written by writer 1 from one written by writer 2.

The precedent for the fix already exists in this schema: `npi_number` is accompanied by
`npi_source` ('script' | 'llm' | 'human') and `npi_verified_at`, stamped by every writer. That
pattern applied here would resolve the ambiguity outright.

---

## Today's measurement (2026-08-25, measured for this document)

```sql
SELECT COUNT(*) FILTER (WHERE total_career_pubs < in_corpus_pub_count) ...
```

| | HCPs | share of comparable |
|---|---:|---:|
| Total `hcps_v2` rows | 381,329 | |
| `total_career_pubs` NULL | 2,403 | |
| `in_corpus_pub_count` NULL | 42,562 | |
| **Comparable (both non-null)** | **338,767** | 100% |
| **LOWER than in-corpus — impossible for a career total** | **98,881** | **29.2%** |
| Equal to in-corpus | 226,244 | 66.8% |
| Higher than in-corpus — the only plausible shape | 13,642 | **4.0%** |

**Only 4% of rows plausibly hold an OpenAlex career total.** The other 96% hold a frozen in-corpus
count — 66.8% where the corpus has not grown since minting (so it still matches), and 29.2% where
it has (so the value is now arithmetically impossible).

The 98,881 are not corrupt data. They are writer 1's output, working exactly as written, being read
as if it were writer 2's.

### Delta distribution (`total_career_pubs − in_corpus_pub_count`)

| Range | HCPs |
|---|---:|
| −379 … −201 | 17 |
| −193 … −101 | 106 |
| −100 … −1 | 98,758 |
| 0 … 99 | 235,351 |
| 100 … 199 | 2,304 |
| 200 … 499 | 1,716 |
| 500 … 65,353 | 515 |

### Live conflation — all 8 rows above `CONFLATION_PUB_CEILING = 2000`

| Name | `total_career_pubs` | in corpus | country |
|---|---:|---:|---|
| Tao Liu | **65,359** | 6 | CN |
| Nicholas Wood | 11,013 | 5 | AU |
| Jörge Cortes | 3,568 | 9 | US |
| Dorret Boomsma | 2,334 | 8 | NL |
| M. Bruze | 2,267 | 25 | SE |
| Christos Zouboulis | 2,149 | 12 | DE |
| Stefan Bräse | 2,019 | 5 | DE |
| Christian Torp-Pedersen | 2,017 | 9 | DK |

Every one clears the ≥500 "established by volume alone" override on a value that cannot be real.
`create_hcps_v2.py:609` detects this class **at mint time** and only warns; nothing re-checks after
8a overwrites the value.

---

## The four incidents

Patterns 1–3 as reported; pattern 4 measured above. Where an incident's named example has since been
remediated, that is noted — the *class* remains live in every case.

**1. Ingestion-date year artifacts.** Career years derived alongside the count picked up ingestion
dates rather than publication dates, producing impossible career spans.

**2. Name-conflation inflation — Kai Wang, 7,206 pubs.** OpenAlex merges distinct researchers
sharing a common name into one author record; `works_count` then describes a composite person.
*Today:* the highest `Kai Wang` is 301 (6 in corpus), so that specific record was remediated. **The
class is live** — see Tao Liu at 65,359 above.

**3. Fuzzy-match inflation with no institution gating — Sohal, 192 pubs from 2023.** Cluster
assembly matched on name similarity without requiring institutional agreement, attaching another
person's shards. *Today:* `Aalam Sohal` reads 35 / 42 in corpus, so remediated. The gating question
is unchanged.

**4. Stale-low after a TA build.** A newly minted HCP is stamped with writer 1's in-corpus count.
The corpus then grows — the CRC build alone added 147,218 publications — and the value is never
refreshed. *This is the 98,881 rows measured above, and it is the pattern the CRC build just
reproduced at scale.*

Patterns 2 and 3 push the value **too high** and are caught (loudly, at mint time) by
`CONFLATION_PUB_CEILING`. Pattern 4 pushes it **too low**, has no ceiling, no floor, and no alarm —
and it is the one affecting 29% of the table.

---

## Options — not implemented, costs and breakage stated

### (a) Add a freshness timestamp so staleness is detectable

Add `total_career_pubs_source` ('corpus' | 'openalex') and `total_career_pubs_at`, stamped by both
writers inside the same statement that writes the value — exactly the `npi_source` /
`npi_verified_at` pattern already in this schema.

**Cost:** one migration, two writer edits (`create_hcps_v2.py:479`, `career_enrichment_from_clusters.py:180`),
and a backfill decision for the 338,767 existing rows — which cannot be inferred reliably; the
honest backfill stamps them `NULL`/'unknown' and lets them age out.

**Breaks:** nothing. Purely additive.

**What it does *not* do:** it makes staleness *detectable*, not *fixed*. The 98,881 impossible rows
remain wrong; they merely become identifiable. This is a prerequisite for the other two options, not
an alternative to them.

### (b) Batch 8a the way 8b was batched, so refresh is cheap enough to run every cycle

8a is still one `GET /authors/{id}` per author id plus a 50 ms sleep — 4.2 HCP/s, ~5h51m for 92,638
clusters. The same 50:1 OpenAlex list batching that took 8b from ~16 h to ~17 min applies unchanged.

**Cost:** the 8b implementation is done and can be transplanted — batching, split-and-retry, the
write contract, `Retry-After`. Estimated ~2,000 requests for a full refresh, ≈$0.20 in OpenAlex
credits, ~30 min. Cheap enough to run every cycle, which is the point.

**Breaks:** 8a's work-set is **date-scoped, not TA-scoped** (`linked_at >= today`), so on the CRC run
20.9% of its 92,638 clusters were other TAs' HCPs. Batching makes it cheap but does not make it
correctly scoped; that wants fixing at the same time. Also, refreshing every cycle means writer 2
overwrites writer 1 everywhere — which is *desirable* only if you have decided writer 2's definition
is the right one. **Doing (b) without deciding that is how you get a fifth incident.**

### (c) Change the eligibility gate to read `in_corpus_pub_count`

`in_corpus_pub_count` is corpus-derived, recomputed **every cycle** by 8f, and has a single
unambiguous definition. Switching `passes_ranking_publication_threshold` to read it removes the
dependency on the ambiguous column entirely.

**Cost:** small code change. But it is a **board-moving** change, not a refactor:

| | HCPs |
|---|---:|
| Pass the ≥10 gate on `total_career_pubs` today | 63,256 |
| Would pass on `in_corpus_pub_count` | 68,890 |
| **Would LOSE eligibility** | **10,516** |
| **Would GAIN eligibility** | **16,150** |

Net +5,634, but **26,666 HCPs change eligibility state** — every board would move.

**Breaks:**

- **The threshold changes meaning.** "10 career publications" and "10 publications in our corpus"
  are different bars; 10 is calibrated for the former. The number needs re-deriving, not porting.
- **`in_corpus_pub_count` is NULL on 42,562 rows** — a larger null population than
  `total_career_pubs`'s 2,403. The fallback branch would fire far more often.
- **The ≥500 / ≥200 cohort overrides (`:560`) have no in-corpus analogue at that scale.** In-corpus
  counts rarely reach 500. Those two rules would need separate treatment or removal.
- **`MAX_STORED_PUBLICATIONS_FOR_RANKINGS = 200`** already filters on a stored-row count; reading
  in-corpus for the lower bound too makes both bounds the same quantity, which may be right but
  changes the shape of the filter.
- Consumers that *display* the value (frontend, community RPCs) are unaffected by a gate change and
  would continue showing the ambiguous column.

### Recommendation shape (not a decision)

These are not alternatives. **(a) is a prerequisite** — without it, nobody can tell whether (b)
worked or whether a given row is trustworthy. **(c) is the only one that removes the dependency**,
but it must be A/B'd against the current boards before shipping, and its threshold re-derived rather
than ported. **(b) is worth doing regardless** because 8a is pathologically slow on every first
build, but it should follow an explicit decision about which definition the column is supposed to
hold.

The question underneath all three, which no option answers by itself: **should
`total_career_pubs` mean a career total or an in-corpus total?** Until that is decided, any fix
just relocates the ambiguity.

---

*Measured 2026-08-25 against the live database: writer quotes from `create_hcps_v2.py` and
`career_enrichment_from_clusters.py`; consumer sweep across `scripts/`, `frontend/src`, `sql/`, and
`pg_get_viewdef` over all public views; distribution and gate-migration counts from `hcps_v2`.
Incident patterns 1–3 as reported by Garrett; pattern 4 and all counts measured here.*
