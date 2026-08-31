# `pharma_engagement` is a lifetime, all-TA figure for 99% of the community roster

**Found:** 2026-08-28, while deciding whether `community_scoring` should read the new
primary-signal payment columns. It should not — but looking closely enough to answer that
question surfaced a larger defect one branch away.
**Status:** open. Nothing changed. `community_scoring.py` is untouched.
**Companion:** [`COMMUNITY_ROSTER_BUILD.md`](COMMUNITY_ROSTER_BUILD.md) (the roster spec).

---

## The defect

`hcp_community_scores_v2.pharma_engagement` is displayed on a **therapeutic-area** community
profile. For the overwhelming majority of the roster it holds a **lifetime, all-TA,
all-indication** dollar figure that has no connection to the therapeutic area being viewed.

`scripts/score/community_scoring.py:396-407`:

```python
op_ta      = op_ta_by_pair.get(key, {})
speaker    = parse_float(op_ta.get("ta_speaker_bureau_3yr"), 0.0)
consulting = parse_float(op_ta.get("ta_consulting_3yr"), 0.0)
if speaker > 0 or consulting > 0:
    pharma = speaker + 0.5 * consulting                                   # branch 1
else:
    pharma = parse_float(op_ta.get("ta_payments_3yr"), 0.0)               # branch 2
    if pharma <= 0:                                                       # branch 3
        pharma = parse_float(
            op_summary_by_hcp.get(hid, {}).get("total_payments_lifetime"), 0.0
        )
raw_pharma[key] = pharma
```

Branches 1 and 2 read `hcp_open_payments_by_ta_v2`, which is TA-scoped by construction.
**Branch 3 reads `hcp_open_payments_summary_v2.total_payments_lifetime`, which is not scoped
to a therapeutic area at any level** — not by drug, not by indication, not by time window. It
is every Open Payments dollar that HCP has ever received, from any manufacturer, for any
product.

## How many HCPs take each branch

Measured 2026-08-28 against the CRC community cohort and the live payments tables:

| branch | source | community HCPs |
|---|---|---:|
| 1 — speaker/consulting | `ta_speaker_bureau_3yr`, `ta_consulting_3yr` (TA-scoped) | **56** |
| 2 — TA payment total | `ta_payments_3yr` (TA-scoped) | **45** |
| 3 — lifetime fallback | `total_payments_lifetime` (**NOT TA-scoped**) | **52,066** |

**99.8% of the community roster is on branch 3.** The two branches that are actually
TA-correct serve 101 HCPs between them.

The cause is mechanical: branch 3 fires whenever an HCP has no `hcp_open_payments_by_ta_v2`
row for the TA — which is the normal state, because that table only holds HCPs whose payments
matched a `ta_drug_keywords` entry. Most community practitioners never do. The fallback was
presumably written so the field would not render empty; the effect is that it renders
something worse than empty, because a number with no provenance is indistinguishable from a
number with the right one.

## Why this matters more than the primary/secondary question it was found next to

The `is_primary_signal` semantic (recorded 2026-08-28) says:

> *primary — a payment for this drug may independently establish TA engagement;
> secondary — contributes only after TA relevance is established elsewhere*

That distinction is about **which drugs** evidence a therapeutic area. Branch 3 does not
restrict to the therapeutic area **at all**, so it violates the semantic more completely than
any choice between primary and secondary drugs could. A dermatologist's psoriasis payments
render as "pharma engagement" on a colorectal-cancer profile.

Concretely, for CRC: switching branch 2 to primary-only would have tightened a branch serving
45 HCPs, while leaving 52,066 reading an untargeted lifetime total. That is why the
primary-only change was **rejected** — not because it was wrong in principle, but because it
was aimed at the wrong branch.

## What it does NOT affect

**No score and no rank.** `community_scoring.py:60-62`:

> *The 40/30/15/10/5 WEIGHTS vector and the composite it fed were removed in Phase 2
> (2026-08-11): community is not ranked. The five raw component FACTS are still measured and
> written below; they are displayed, never summed.*

So `pharma_engagement` is a **displayed fact**, not a scored input. Nothing about this defect
moves a board position, because the roster is tier-grouped and has no positions. That bounds
the blast radius to what a reader sees — which is the whole problem, but it is not a scoring
corruption.

## Where it surfaces

`get_community_hcp_profile` (`migrations/2026_07_30_community_profile_entities_recency.sql:66`)
selects `pharma_engagement` from `hcp_community_scores_v2` alongside `patient_volume`,
`career_years` and `publication_signal`.

Note the same RPC's `engagement` block **independently** exposes `lifetime_total` from
`hcp_open_payments_summary_v2` — so for a branch-3 HCP the profile currently shows the same
untargeted lifetime figure twice, once labelled as lifetime (correct) and once as
`pharma_engagement` (implying TA scope). That duplication is the clearest symptom, and the
cheapest way to see the defect on a live profile.

## Options, not yet decided

1. **Remove the fallback.** `pharma_engagement` becomes NULL when no TA-scoped payment record
   exists — an honest absence, and the roster spec's own working convention is that *"the
   empty/sparse state is the common state — design for it, don't treat it as an edge case."*
   99.8% of the roster would show no value, which is an accurate statement about what CMS data
   can tell us about a community practitioner's TA-specific pharma relationships.
2. **Keep it but label it.** Carry a provenance flag (`pharma_engagement_scope` = `'ta'` |
   `'lifetime'`) so the surface can render "lifetime, all indications" rather than implying TA
   scope. Preserves the field for the 99.8% while making it non-misleading.
3. **Leave it and fix the surface only.** Stop displaying `pharma_engagement` on a TA profile
   and show the RPC's existing `engagement.lifetime_total` instead, correctly labelled. The
   column keeps its current behaviour for any other consumer.

**Lean: option 2.** Option 1 discards a real fact to avoid a labelling problem; option 3
leaves a mislabelled column live for whatever reads it next. Option 2 is the only one that
keeps the information and makes it honest, and it costs one column plus one branch in the
writer.

Whichever is chosen, the Methodology page needs the same treatment the ranking change got —
the community section should say what this number is scoped to, in the same commit.

## Verification queries

```sql
-- branch distribution for a given TA's community cohort (substitute the ta uuid)
WITH comm AS (SELECT hcp_id FROM hcp_cohort_classification_v2
              WHERE therapeutic_area_id = :ta AND cohort = 'community'),
     b AS (SELECT * FROM hcp_open_payments_by_ta_v2 WHERE therapeutic_area_id = :ta)
SELECT count(*) FILTER (WHERE coalesce(b.ta_speaker_bureau_3yr,0) > 0
                           OR coalesce(b.ta_consulting_3yr,0) > 0)        AS branch_1,
       count(*) FILTER (WHERE NOT (coalesce(b.ta_speaker_bureau_3yr,0) > 0
                                OR coalesce(b.ta_consulting_3yr,0) > 0)
                          AND coalesce(b.ta_payments_3yr,0) > 0)          AS branch_2,
       count(*) FILTER (WHERE NOT (coalesce(b.ta_speaker_bureau_3yr,0) > 0
                                OR coalesce(b.ta_consulting_3yr,0) > 0)
                          AND coalesce(b.ta_payments_3yr,0) <= 0)         AS branch_3
FROM comm LEFT JOIN b ON b.hcp_id = comm.hcp_id;

-- the duplication symptom: pharma_engagement equal to the untargeted lifetime total
SELECT count(*) FROM hcp_community_scores_v2 s
JOIN hcp_open_payments_summary_v2 o ON o.hcp_id = s.hcp_id
WHERE s.therapeutic_area_id = :ta
  AND s.pharma_engagement = o.total_payments_lifetime
  AND s.pharma_engagement > 0;
```
