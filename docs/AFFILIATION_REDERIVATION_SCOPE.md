# Affiliation re-derivation — methodology + runtime scope

**Status:** REPORT ONLY. Nothing ingested, nothing written to the DB. All figures below come
from read-only `SELECT` / `EXPLAIN ANALYZE` against the live DB on 2026-08-14, plus one live
OpenAlex API GET.

**Headline:** the re-derivation is **not** a long job. The full-corpus aggregate runs in
**5.8 seconds**. The real prerequisite is a country-mapping gap, not compute. Run it inline.

---

## 1. Current state — where country actually comes from

`hcps_v2.country` is an **all-time plurality**, collapsed twice, and frozen at HCP creation.

**Chain:** `publications_v2.authorships` → `author_pub_flat` → `openalex_author_inventory`
→ `hcps_v2.country`

| Step | Location | What it does |
|---|---|---|
| Flatten | `build_author_flat.sql:41-42` | `auth->'institutions'->0->>'ror'` — **first** institution per authorship, per paper, carrying `pub_year`. Secondary affiliations dropped here. |
| Collapse #1 | `sql/reingest/inventory_upsert_incremental.sql:52-54` | `MODE() WITHIN GROUP (ORDER BY f.institution_ror)` over **all** of an author's rows, **all years**. |
| Collapse #2 | `scripts/classify/create_hcps_v2.py:438-441` | `most_frequent(rors)` across the cluster's shards — a mode of modes. |
| Country | `scripts/classify/create_hcps_v2.py:448-452` | `ror_to_country` lookup on that mode ROR. |

**Confirmed historical/dominant.** There is no recency term anywhere in the chain. A KOL with
30 papers at their training institution and 6 at their current one resolves to the *training*
institution — permanently. Ties break **alphabetically** (the `ORDER BY` inside `MODE()`),
not by recency.

**Confirmed the refresh does not recompute it.** `refresh_existing_hcp_derived_fields`
(`scripts/classify/create_hcps_v2.py:1095-1163`) updates **only** `total_career_pubs` and
`latest_pub_year`. Its own docstring:

> "Recompute total_career_pubs / latest_pub_year for an existing HCP that gained shards"

`country`, `institution_normalized` and `institution_ror` are written once in `build_hcp_row`
at creation and never touched again.

One nuance worth knowing: the *inventory* layer **does** refresh `last_known_institution` on
every cycle (`ON CONFLICT DO UPDATE`). But it recomputes the same all-time mode, so it does
not help — and it never propagates up to `hcps_v2` regardless. The field is stale in two
independent ways.

### Current corpus shape

| Metric | Value |
|---|---|
| `hcps_v2` rows | 290,480 |
| `country` null/empty | 19,393 (6.7%) |
| `author_pub_flat` rows | 3,378,709 |
| shard links (`hcp_openalex_authors_v2`) | 257,661 |
| `ror_to_country` entries | 10,482 |

Top countries: US 79,894 · CN 75,959 · JP 18,024 · IT 11,239 · DE 7,780 · KR 7,499 ·
FR 6,112 · GB 5,720 · ES 5,489

> **Scope correction:** the brief said ~87K HCPs. `hcps_v2` is **290,480**. The union of the
> ranked cohorts (established v3 + rising v3 + community board) is **32,627**. 87K matches
> nothing I found — the closest figure is US-only at 79,894. Flagging so we agree on scope
> before committing the run.

---

## 2. Re-derivation design

### The source is already local — no ingestion needed

`author_pub_flat` **already carries per-paper affiliation with a year**: `(author_id, pub_id,
pub_year, institution, institution_ror)`. The per-year signal is not missing from our data —
it is being *thrown away* by the `MODE()` at collapse #1. Re-derivation is a pure
re-aggregation of data we already hold.

Coverage is good: 3,207,945 of 3,378,709 flat rows (95%) carry a ROR.

### Recency window — recommend **3 years (2023+)**

Distinct HCPs with at least one ROR'd paper in window:

| Window | HCPs | % of the 245,748 with any ROR'd paper |
|---|---|---|
| 2025+ (1yr) | 128,993 | 52% |
| 2024+ (2yr) | 166,344 | 68% |
| **2023+ (3yr)** | **191,578** | **78%** |
| 2022+ (4yr) | 209,223 | 85% |
| 2021+ (5yr) | 223,492 | 91% |

2→3 years buys +25,234 people; 3→4 buys +17,645. The knee is at 3. Two years leaves a third
of the corpus unresolvable for no real currency gain — publication lag alone means a 2-year
window misses people who are simply between papers.

**Recommend: 3-year primary window, 5-year fallback tier** (see stale handling below).

### Threshold — recency-weighted plurality, not most-recent-paper

Three candidates, and why the middle one wins:

- **Most-recent paper's affiliation** — too brittle. One visiting-collaboration paper, or a
  courtesy authorship listing a partner site, flips a KOL's country. No corroboration at all.
- **Flat plurality of last-N-years** — better, but inside a 3-year window a prolific person
  mid-move still resolves to the institution they left, because volume beats recency.
- **Recency-weighted plurality** ✅ — gets corroboration *and* directionality.

```
w(paper)  = 0.65 ^ (current_year - LEAST(pub_year, current_year))
winner    = argmax over institution_ror of SUM(w)
dominance = w(winner) / SUM(all w)
```

A decay of 0.65/yr means this year's paper is worth ~1.5 of last year's and ~2.4 of the
year-before's — a genuine move surfaces within one publication cycle, but a single stray
paper cannot outvote two corroborating ones.

**The `LEAST(pub_year, current_year)` clamp is load-bearing.** `author_pub_flat` holds
337,068 rows dated 2026, 217 dated 2027 and 6 dated 2028 (online-first / ahead-of-print).
Without the clamp those get a negative decay exponent and are weighted *above* 1.0 —
future-dated ahead-of-print papers would dominate every ranking.

### Ties and moves-in-progress — do not force a single answer

Measured, on the 191,578 with recent evidence (3-yr window):

| Shape | Count | % |
|---|---|---|
| Single institution | 113,817 | 59% |
| Multiple, dominant (≥0.6) | 45,772 | 24% |
| Multiple, contested (<0.6) | 31,989 | 17% |

Mean distinct institutions per person in-window: 1.67.

That 17% contested bucket is mostly *real* dual affiliation and genuine in-flight moves —
not error. Forcing a winner there manufactures false precision. Recommend: still pick a
primary (deterministically — weight desc, then `max(pub_year)` desc, then ROR string as final
tie-break), but **record the runner-up and mark the record contested**, so the UI can say
"Institution A (also B)" instead of silently picking one.

### No recent papers — the stale bucket

**98,902 HCPs (34% of corpus) have no ROR'd paper in the 3-year window.** In the ranked
cohorts specifically: **10,221 of 32,627 (31%) are stale.** This is not an edge case — it is
a third of the book, and it is exactly where the confidence signal earns its keep.

Recommended ladder — never guess, never null:

1. 3-year window → confidence per §3
2. else widen to 5 years → `stale`, `affiliation_as_of` = last year seen
3. else all-time mode (current behaviour) → `stale`
4. else no ROR'd affiliation on any paper → `unknown`

The value is always *populated*; what changes is what we claim about it.

---

## 3. Confidence gradient

| Level | Rule | Approx. n |
|---|---|---|
| `high` | ≥3 papers in window **and** dominance ≥0.6 | 93,575 have n≥3; intersected with dominance, ~85–90K |
| `medium` | recent evidence but thin (n<3) **or** contested (dominance <0.6) | remainder of the 191,578 |
| `stale` | nothing in window; value from 5-yr or all-time fallback | 98,902 |
| `unknown` | no ROR'd affiliation ever | 44,732 (290,480 − 245,748) |

### Stored signal

| Column | Type | Purpose |
|---|---|---|
| `affiliation_confidence` | text enum | `high` / `medium` / `stale` / `unknown` |
| `affiliation_as_of` | int | max `pub_year` backing the winner — **the year the UI prints** |
| `affiliation_evidence_n` | int | papers supporting the winner |
| `affiliation_dominance` | numeric | winner weight / total weight |
| `affiliation_derived_at` | timestamptz | when this run computed it |

**UI rule:** show "current-confirmed" when `affiliation_confidence = high` **and**
`affiliation_as_of >= current_year - 1`; otherwise show "as of {affiliation_as_of}". That
single rule covers every bucket without the frontend re-deriving anything.

---

## 4. What it writes — additive only, nothing overwritten

**Preserve. Confirmed as the design.** `hcps_v2.country`, `institution_normalized`,
`institution_raw`, `institution_ror` and `institution_canonical` are **not touched**. The
historical value stays queryable and directly comparable.

New columns on `hcps_v2`:

```
current_country                text
current_institution_ror        text
current_institution_normalized text
affiliation_confidence         text
affiliation_as_of              int
affiliation_evidence_n         int
affiliation_dominance          numeric
affiliation_derived_at         timestamptz
```

Two columns already exist and are **completely unpopulated (0 rows each)** — free to use:

- `institution_secondary` (text) → the contested runner-up
- `institution_history` (jsonb) → the full per-year affiliation trail

### Measured delta (what would actually change)

Of the 191,578 with recent evidence:

| Outcome | Count |
|---|---|
| Country unchanged | 168,019 (94% of mapped) |
| **Country changed** | **7,295** |
| Country filled in (was null) | 2,933 |
| Winner ROR not in `ror_to_country` | 13,331 |

So ~**10,228 people get a corrected or newly-populated country**, and 7,295 of those are
currently *wrong* — labelled with a country they have left. That is the case for the run.

---

## 5. Runtime

**Measured, not estimated.** `EXPLAIN (ANALYZE, BUFFERS)` on the full-corpus re-derivation
aggregate (join → recency-weight → rank → pick winner), unscoped, all 290,480 HCPs:

```
Execution Time: 5765.765 ms
```

**5.8 seconds.** It parallelises (1 worker launched), stays on `idx_author_pub_flat_author`,
and is almost entirely buffer hits (2,861,376 shared hit vs 4,167 read) — the working set is
already in cache.

End-to-end estimate:

| Phase | Time |
|---|---|
| Aggregate (measured) | ~6s |
| Materialise to staging table | ~10–30s |
| `UPDATE ... FROM` staging, ~191K rows + index maintenance | ~2–10 min |
| Verification queries | ~1 min |
| **Total** | **~5–15 minutes** |

**Verdict: run it inline.** This does not justify kicking off a long job and working in
parallel. Use the staging-table + atomic-swap pattern already proven in `build_author_flat.sql`
so live readers never block.

**The actual long pole is the country map, not the compute** — see §6.

---

## 6. Option 2 — OpenAlex per-year affiliations

**Does OpenAlex carry affiliation-over-time we are not ingesting? Yes — confirmed live.**

The author object has an `affiliations[]` array, each entry an institution (with `ror` *and*
`country_code`) plus a `years[]` array. We ingest **none of it**:
`scripts/enrich/openalex_author_enrichment.py` takes only `cited_by_count`, `h_index`,
`i10_index`, `works_count`, `counts_by_year` and `2yr_mean_citedness`. `counts_by_year` is
works/citations per year — it carries no institutions.

**Is re-deriving from it better than re-deriving from our stored papers? No.** Four reasons:

1. **Not independent.** OpenAlex builds `affiliations[]` by rolling up the same works'
   authorships we already flattened into `author_pub_flat`. Same evidence, pre-chewed.
2. **Strictly lossier.** It is year-granular with no per-paper weight — you cannot tell one
   paper in 2024 from thirty. That is precisely the signal the recency-weighted plurality
   needs, and we would be discarding it to fetch a coarser version of data we already hold.
3. **Noisy.** The live probe (author `A5023888391`) returned **"OpenAlex" itself**
   (`ror 02nr0ka47`, `country_code CA`) as an affiliation for 2017–2023, and
   `last_known_institutions` came back **empty**. Deriving from that array would assign a
   Canadian affiliation to a US author. Our per-paper data has no such synthetic entries.
4. **Costs an API pass** over ~257,661 author IDs — hours — versus 5.8s of local SQL.

### But there is one thing worth taking from OpenAlex

**Institution `country_code`.** `ror_to_country` has only 10,482 entries and is the binding
constraint on this whole exercise:

> Of the **15,838** distinct RORs appearing in recent (2023+) publications, **8,052 (51%) are
> unmapped.**

Because the gap is long-tail (small institutions), it only costs us 13,331 of 191,578
HCP-rows (7%) — but that is still ~7% of the corpus that re-derivation **cannot resolve to a
country** no matter how good the methodology is. OpenAlex's `/institutions` endpoint returns
`country_code` directly.

**~8,052 RORs at 50/page ≈ 161 requests ≈ a few minutes.** This is the one API job worth
running, and it should run **before** the re-derivation — not the `affiliations[]` ingest.

---

## Recommended order

1. **Close the `ror_to_country` gap** — 8,052 RORs from OpenAlex `/institutions`. Minutes.
   Prerequisite; without it 7% of the corpus stays unresolvable.
2. **Full-corpus re-derivation** — additive columns only, staging + atomic swap. ~5–15 min, inline.
3. **Compare `country` vs `current_country`** across the ~10,228 deltas before any UI reads the
   new field. Both values persist, so this is a query, not a re-run.

Full corpus rather than ranked-cohorts-only: at 5.8s of compute the scoping saves nothing, and
the 98,902 stale records are themselves a finding worth having on record.

## Open questions for Garrett

- **Scope** — confirm full corpus (290,480) vs ranked cohorts (32,627). The brief's ~87K
  matches neither.
- **Decay constant** — 0.65/yr is my recommendation, tuned so a move surfaces within one
  publication cycle. Worth a spot-check against ~10 known movers before committing.
- **Dominance threshold** — 0.6 splits multi-institution people 45,772 dominant / 31,989
  contested. Movable if that contested bucket reads too large.
