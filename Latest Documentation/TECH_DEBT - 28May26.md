# FieldMark v2 — Tech Debt

_Last updated: 2026-05-28 (Day 3 continuation — career-year fix + enrichment completion)_

---

## RESOLVED this session (2026-05-28)

- **career_first_pub_year corruption — FIXED.** Was the highest-priority item. ~24% of corpus (55,387 HCPs) had pre-1990 first-pub years from raw OpenAlex earliest-publication noise (homonyms, co-author fragments, citation-graph garbage going back to the 1500s). Fixed via publication-density heuristic backfilled into new column `career_first_pub_year_v2`. Heuristic: first year beginning a sustained 3-year window of ≥2 papers/year; fallback ladder = first ≥2-paper year → earliest year. Validated: Gulley 1956→2001; corpus pre-1990 dropped 24%→4.8%; 0 unresolvable. `scoring_pipeline.py` repointed to read `career_first_pub_year_v2`. `career_age_years` generated column repointed to derive from `career_first_pub_year_v2` (expression: `(latest_pub_year - career_first_pub_year_v2) + 1`).
- **OpenAlex enrichment corpus — COMPLETE at 229,238 distinct HCPs** under snapshot_date 2026-05-27. Two latent pipeline bugs killed: (1) upfront `executor.submit` of all futures hung above ~5k dispatch — replaced with bounded in-flight window (`max_in_flight = workers*2`); (2) missing dedup in `upsert_batch` caused ON CONFLICT 21000 — added dedup by (hcp_id, snapshot_date) keeping highest works_count. Added `--snapshot-date` CLI flag to enrichment script for resuming into a prior snapshot.
- **Frontend: 3 cohort tracks live** (Rising Stars/amber, Established/gold, Community/blue) with real differentiated data, scope-aware ranks via views, RLS public-read policies added.
- **Tooltip Title Case + green "+" spacing** committed (note: "+" spacing made it slightly worse — see below).

---

## OPEN — high priority

### Re-score not yet verified / established + community narratives pending
- `scoring_pipeline.py --target-version v2` was RUNNING at end of session (re-scoring all cohorts against corrected career years). **Must verify it completed and eyeball the re-scored boards** — rankings expected to shift, especially Rare Disease rising stars (was 50% conflation noise).
- `established_scoring.py --execute` NOT yet re-run against corrected `career_age_years`. Needs to run.
- Narratives (`generate_narratives_v2.py`) NOT yet run for any cohort. Gate: scoring must execute first. Rising star ~$7 / ~1,641; established ~$50 / ~11,389; community top-500 default. **API balance $30.45 — established+community will exceed; add funds first.**

### Narrative percentile formatting (verify before full batch)
- `generate_narratives_v2.py` line 403-407 injects `{ctx.pub_velocity_pct}th percentile` — rounds to 1 decimal (line 169), so renders e.g. "97.6th percentile" + ordinal grammar bug ("21.0th"). Prompt (line 21/429) instructs Claude to reframe as "top X%", which MAY clean it in output. **Test on a small batch and read one narrative before committing to the full run.** If awkward, change lines 403-407 to `int(round(...))`. (This is the "97.63rd percentile" issue first seen in Gulley's v1 narrative — the career-length half is fixed; the percentile-formatting half is unverified in v2.)

---

## OPEN — medium priority

### career_age_years uses generated column (year drift)
- `career_age_years` is `(latest_pub_year - career_first_pub_year_v2) + 1`. Fine now. Worth confirming `latest_pub_year` stays fresh on weekly refresh; otherwise career age goes stale.

### Residual common-name conflation (~0.5%)
- After the v2 fix, 1,070 HCPs (0.5%) still have pre-1970 career start — these are common-name author MERGES (e.g. "John Wright"→1950) where even sustained activity belongs to a fused historical author. This is an author-disambiguation problem, not a career-start one. Separate, lower-priority workstream. Ties to the 12,312 candidate dedup clusters below.

### Dedup work pending (carried from prior)
- 12,312 candidate clusters identified. Score-first approach: dedup only top scorers fragmented across stubs. Real fragmented canonicals: Sanyal, Chalasani, Kowdley.

### Canonical UUIDs in v2 scripts still reference v1 (carried)
- `open_payments_aggregator.py`, `medicare_aggregator.py` hardcode v1 canonical KOL UUIDs in validation blocks. Underlying NPI-matched aggregation works; only in-script canonical_check fails. Real v2 UUIDs:
  - Loomba: 8a5ed89d-df8a-4b7c-a5f7-37f602b63577
  - Sanyal: be751618-9371-4ce1-8760-c579599fd30e (pub-keyed; stub 4f51954e has NPI)
  - Chalasani: 22388b63-dc82-44d7-abaa-24ab8f4ab8eb (stub 0731986d has 43 authorships; ad708363 has NPI)
  - Kowdley: 272ff3bc-0464-499b-9ab2-1ceae503e415 (stub 043409e4 has NPI)

### Established cohort_score not differentiated (carried)
- Path-based bucketing → only 5 distinct scores; 4,092 HCPs all = 95. Per-TA scores in `hcp_established_scores_v2` ARE differentiated; `hcps_v2.cohort_score` remains path-based. Established cohort also showed identical 11,390 counts for Hep AND NSCLC — suspect top-N threshold not quality cutoff.

### Trial-to-TA mapping ~2-3% false-positive (carried, acceptable for demo)
- Liver metastases of non-Hep cancers tag as Hep; Selpercatinib thyroid trials tag NSCLC via drug.

---

## OPEN — frontend / lower priority

- **Green "+" add-button placement** — current `paddingBottom:28` / `bottom:10,right:10` is WORSE than before (button too high/tight). To be resolved as part of the card redesign (see below), not a standalone tweak.
- **Card redesign (APPROVED, queued)** — score-as-headline (large amber number top-right + "RANK #N · US"), `why_now` insight line w/ trending icon under institution, H-INDEX pill replacing CIT TRAJ, name+institution grouped left. Gated on narratives existing (for `why_now`) + enrichment (for h_index, now done). Two wiring tasks: card must read/display `why_now` (currently shows no narrative field) and `h_index`.
- **CIT TRAJ is a weak/uniform signal** — every card shows ~+76% (81% of pubs lack citation data). Redesign swaps it for H-INDEX which has real variance.
- **TA login count flash** (e.g. Established "11,390 → 2,885") — loading-state architecture debt; multiple tracks/TAs/region update async showing brief stale data. Needs coherent loading-state pass.
- **Verified DOLs panel** doesn't render — `dol_matches_v2` table EMPTY; getVerifiedDOLs joins through it. 27 v2 HCPs flagged is_verified_dol=true but matches table needs v1→v2 migration.
- **Social/DOL workstream** — last capture May 21 (1,526 posts / 809 users / 66 matches). 809→66 = only 8% of captured social users match known HCPs; the 92% (people talking about a TA who aren't in hcps) are discarded. Architectural fix = surface high-engagement non-HCP accounts as candidate DOLs. Deferred to post-ASCO. ASCO starts 5/29. Decision: capture is cheap & non-recapturable; matching can re-run on banked posts later.
- **Social track empty** (no getSocial wiring).
- **Community schema** has dead `*_score` columns (pharma_engagement_score etc, all null) alongside the real populated columns (patient_volume, pharma_engagement, group_practice_signal, career_years, publication_signal). Should drop the dead ones.
- **cohort_classification single-valued** but tier is per-TA — can't perfectly align cross-TA HCPs. Rising stars were backfilled into cohort_classification this session (1,614 NULL→rising_star; 21 left as established).
- **Republish auth screen tagline** "We see the nebula. Not just the star." — confirmed, not yet live in Bolt.
