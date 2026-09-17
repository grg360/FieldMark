# Community board baseline

**Measured 2026-09-17** by `docs/crc_community/62_post_ingest_verify.sql`, after
`part_d_oncology_ingest.py --execute` wrote 251,611 rows against a table holding 79,988.

---

## The rule, before the numbers

> **The oracle is whatever the query returns now, captured before the change — never a
> number quoted from a document.**

That sentence is from `hermes/HERMES_EXCEPTION_TAXONOMY.md` and it exists because the
opposite practice has failed three times on this one number:

| | the document said | the board returned | why it moved |
|---|---|---|---|
| before 2026-09-07 | 4,913 | **4,915** | a view beneath the board moved; no SQL was edited |
| 2026-09-12 | 4,913 | **4,915** | same, restated in `HERMES_EXCEPTION_TAXONOMY` as an instance |
| 2026-09-17 | 4,915 | **4,918** | Part D re-ingest scanned NPIs that did not exist at the last run |

Each time, the document was recently committed and still wrong. **Recency is not
correctness.** This file is dated for the same reason — it is a measurement, not a
guarantee, and it will be wrong too. What it is *for* is being the one place to correct,
instead of nine.

**So do not verify against this file.** Capture the numbers yourself, immediately before
the change you are about to make, with the query below. Compare your after against your
own before. This file tells you what the numbers were on 2026-09-17 and what moved them;
it is not an acceptance test.

### The capture query

```sql
SELECT ta.slug,
       count(*)                            AS cohort_rows,
       count(*) FILTER (WHERE b.qualifies) AS members
FROM community_board_v1 b
JOIN therapeutic_areas ta ON ta.id = b.ta_id
GROUP BY 1 ORDER BY 1;

SELECT ta.slug, b.evidence_tier, count(*) AS on_board
FROM community_board_v1 b
JOIN therapeutic_areas ta ON ta.id = b.ta_id
WHERE b.qualifies
GROUP BY 1, 2 ORDER BY 1, 3 DESC;
```

For a per-HCP diff rather than totals — which is what catches two people swapping tiers
under an unchanged total — see the pattern in `docs/crc_community/60` and `61` section A:
materialise the pre-change output into a temp table and compare with `to_jsonb`.

---

## The numbers, 2026-09-17

### nsclc

| | 2026-09-07 → 09-15 | **2026-09-17** |
|---|---|---|
| board members | 4,915 | **4,918** |
| cohort rows | 13,048 → 13,309 | **13,309** |
| anchored | 980 | **980** |
| candidate | 2,748 | **2,763** |
| heme_dominant | 629 | **628** |
| supported | 94 | **94** |
| unresolved | 464 | **453** |

### colorectal-cancer

| | 2026-09-15 | **2026-09-17** |
|---|---|---|
| board members | 4,794 | **13,864** |
| cohort rows | 14,896 → 33,939 | **33,939** |
| anchored | 121 | **330** |
| supported | 199 | **515** |
| candidate | 4,474 | **13,019** |
| unresolved | 0 | **0** |

### `hcp_part_d_oncology_v1`

251,611 rows · 14,401 distinct HCPs · program years 2022–2024.

`patient_volume` remains **0 for all 78,658** colorectal `hcp_community_scores_v2` rows,
so colorectal membership is still Part D presence alone and the roster's second sort key
still discriminates nothing for that TA. See the `orderClause` note in
`frontend/src/lib/cohortLedger.ts`.

---

## What moved, and why — four causes, not one

Conflating these is how a re-baseline becomes an unexplained number.

### 1. nsclc +3 members — correct data, never scanned

Three physicians who prescribe oncology orals and had **no NPI in `hcps_v2` when this
ingest last ran**. `part_d_oncology_ingest.py` builds its cohort from `hcps_v2` at run
time, so they were not looked for. Nobody looked is not the same claim as does not
prescribe, and the two are indistinguishable in the table once written.

### 2. nsclc tier redistribution — separate from the +3, and not caused by it

11 HCPs left `unresolved`, 15 joined `candidate`, 1 left `heme_dominant`. This is **not**
the three new members redistributing; it is *existing* board members gaining
**lung-group** Part D rows they never had, because the cohort grew to 69,131 NPIs.
`lung_rows`, `heme_fills` and the oral denominator are all `drug_group`-scoped, so they
moved legitimately.

Worth stating explicitly: the tier movement is **inside** 4,918 and would have happened
with or without the +3. A re-baseline that reports only the membership delta leaves this
unexplained.

### 3. colorectal +9,070 members — the workstream-B population, looked at for the first time

Exactly the figure `part_d_oncology_ingest.py --dry-run` predicted on 2026-09-15 under
"HCPs gaining a FIRST Part D row · scored for colorectal-cancer". The 19,043 NPI-native
records added by workstream B on 2026-09-09 had never been scanned for Part D.

### 4. colorectal anchored 121 → 330 and supported 199 → 515

These are the **211 anchored and 315 supported** that `docs/country_normalisation` opened
the country gate for and that could not pass `qualifies` until they had a Part D row.
Both gates had to open, in this order, before they could appear:

* the **country gate** — `community_board_v1` filters `h.country = 'US'` and these rows
  read `'USA'` (`docs/country_normalisation/02`, 2026-09-15). Opening it alone added
  **zero** members, because `qualifies` still failed.
* the **`qualifies` gate** — `patient_volume > 0 OR Part D presence`. With colorectal
  `patient_volume` at 0 throughout, this needed a Part D row, which is what the re-ingest
  supplied.

121 + 211 = 332 against 330 measured, and 199 + 315 = 514 against 515: the arithmetic is
close but not exact, because the two populations overlap slightly and the tier is
recomputed from claims rather than carried over. The causes are right; do not treat the
sums as identities.

---

## Why this was findable at all — an unwired ingest

`part_d_oncology_ingest.py` builds its cohort from `hcps_v2` **at run time** and appears
in **neither `ta_cycle.py` nor `generate_cycle.py`**.

It is the **third consumer of NPI acquisition with no producer relationship in a cycle**,
after stage 12 `hcpcs_topup` — whose docstring records that it was a consumer with no
producer until stage 11.5 `npi_enrich` was added on 2026-09-07. Part D is the same shape
and has not had that fix: stage 11.5 acquires NPIs, stage 12 tops up **Part B** claims for
them, and nothing tops up **Part D**.

The consequence is not that the data is wrong. It is that the data is **silently a
snapshot of whenever the script was last run by hand**, and no coverage query reports the
gap, because the rows that exist are all correct. What is missing is invisible.

**Until `part_d_oncology_ingest.py` sits beside stage 11.5, every future NPI acquisition
recreates this gap silently.** Recorded in `TA_NEW_PLAYBOOK.md` §1b alongside the other
out-of-cycle NPI scripts.

---

## Where the old numbers still legitimately appear

Numbered blocks under `docs/crc_community/` and `docs/country_normalisation/` quote
4,913 / 4,915 / 4,794 / 13,048 as **measurements at their stated dates**, and are the audit
trail for sequences that have already been applied. They were deliberately **not** edited:
rewriting a verification record to match today falsifies the record and destroys the
evidence that a change was inert when it ran.

Consequence to expect: **re-running `docs/crc_community/53_verify.sql`,
`docs/crc_community/60`/`61` section B–D, or `docs/country_normalisation/05` today will
report mismatches against their embedded literals.** That is correct behaviour for a dated
record, not a regression. The per-HCP diffs in 60 and 61 section A are the parts that
proved something, and they were spent on their first run.
