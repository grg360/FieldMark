# TA_GATE_BASELINES.md — "What Good Looks Like" per pipeline gate

**Last updated:** July 10, 2026 — added **Gates 11–16** (frontend repoint + enrichment): cohort re-class
post-dedup (11), frontend rendering (12), narratives (13), Belief Profile/the moat gate (14), collaborators
& themes (15), and the parity-matrix definition-of-done (16). Gates 1–10 are the backend build + scoring
(current through July 10, incl. night-session NSCLC-baseline backfill for Gates 10/13/14/15). All queryable NSCLC
baselines are now MEASURED; the only non-backfilled gate is Gate 12 (in-browser regression — needs no numeric baseline).
Companion: `TA_NEW_PLAYBOOK.md` (Part I §0–6 backend, Part II §7–10 frontend/enrichment).

Purpose: at each pipeline gate, a concrete acceptance standard anchored to the NSCLC build (a trusted,
demo-quality TA), so a new TA's output can be judged against a real reference instead of subjective
"looks right." This is also the ruleset the QA Scientist agent will enforce.

**Note on the July 10 gates:** the AD values in Gates 11–16 were validated in-browser/in-DB this session
and stand as legitimate gates on their own (Type B / domain-truth), independent of an NSCLC comparison.
NSCLC baselines drawn from the July 10 parity matrix are real (measured today); genuinely-unmeasured NSCLC
baselines are marked **TBD (query)** in the STILL-TO-MEASURE section rather than fabricated.

## How to read this doc
- **Type A (NSCLC-anchored numeric):** we queried NSCLC's realized value from the DB; new-TA value is
  compared against it. Strongest.
- **Type B (domain-truth / KOL validation):** validated against known-correct people (canonical KOLs),
  not an NSCLC number. Still a hard gate — often the *most* valuable — but the standard is expert truth.
- **IMPORTANT CAVEAT:** NSCLC's numbers are *realized* values from a real, imperfect, partially-cleaned
  build (it had manual NPI merges, a total_career_pubs pollution fix, incomplete pharma linkage). So an
  NSCLC baseline is a realistic FLOOR / reference, NOT an aspirational gold standard. Each gate notes
  whether NSCLC's value was considered healthy or was a known pain point.

TA IDs: NSCLC c0065b03-a25e-4e9a-bde4-4b4d0db7827d | AD 9e4139d2-e062-4a58-8728-cdabb2d7dca1
        Hep 9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e

---

## GATE 1 — Corpus cleanliness (post-ingestion)   [Type B]
- **Metric:** clean publication count; query-behavioral validation (returns TA papers w/o noise);
  advisor validation of the retrieval query.
- **Standard:** disease-anchored MeSH corpus, advisor-signed-off query, no contamination signatures
  (see debt #1 post-mortem for what contamination looks like).
- **AD:** 23,390 clean pubs; advisor-validated query. PASS.
- **NSCLC-comparable?** Weakly (corpus size is TA-dependent). Not worth a forced numeric comparison.

## GATE 2 — HCP identity resolution / Step C   [Type B primary + Type A partial]
- **Metric (B):** canonical KOLs each resolve to exactly ONE hcp, correct institution.
- **Metric (A):** unique identity_hash (no collisions); clustering-method mix; conservative merge rate.
- **AD:** 13,659 HCPs, all unique identity_hash; ~86% ORCID / 14% name+inst / 32 singletons; 58 merges;
  KOLs (Silverberg, Wollenberg, Eichenfield, Irvine, Bieber, Lio, Flohr, de Bruin-Weller) each → 1 HCP,
  correct institution. PASS.
- **NSCLC baseline:** NOT comparable for method-mix — NSCLC used the OLD (pre-rewrite) Step C; AD used
  rewritten Step C. Apples-to-oranges. Keep the KOL-resolves-to-one check (Type B) as the standard.

## GATE 3 — Publication linking / Step F   [Type A]
- **Metric:** link coverage = % of tagged HCPs that have >=1 publication_authors_v2 link. Also: orphan
  rate (authorships that couldn't be attributed) — NOTE: true orphan rate is runtime-logged, may not be
  persisted; use link coverage as the durable proxy.
- **NSCLC baseline:** 91.9% link coverage (73,533 / 80,017 tagged HCPs linked). The ~8% tagged-unlinked
  is a NSCLC data-quality flag worth auditing when NSCLC unfreezes (its old pipeline tagged some HCPs
  without requiring links).
- **AD:** 100% (15,902 / 15,902). Step F orphan rate at run: 81/80,581 = 0.1%.
- **Verdict:** AD structurally cleaner — because AD's tagging is DOWNSTREAM of linking (a tag requires
  accumulated linked-pub scores => tag implies linked, by construction). NOT directly comparable to
  NSCLC's 91.9% (different tagging logic). AD's 100% is the better invariant. PASS.
- **Known caveat (updated July 7):** the "Guttman-Yassky 6 links" symptom was TWO overlapping problems,
  now disentangled: (1) IDENTITY FRAGMENTATION — she was split across 2 records (37-work + 764-work) via a
  Unicode-hyphen surname variant; FIXED by dedup (Gate 6b), now 1 record. (2) CORPUS UNDER-LINKAGE — even
  merged, her real ~764 pubs aren't in publication_authors_v2 (Step F scoped to NEW HCPs to protect frozen
  NSCLC; her actual pubs were never linked). Full unscoped Step F when NSCLC unfreezes fixes (2). Link
  coverage (>=1 link) is a WEAK invariant — it hides under-linked KOLs. Consider a stronger gate:
  linked_pubs vs OpenAlex works_count ratio for known KOLs.

## GATE 4 — Tagging   [Type B primary + Type A distribution]
- **Metric (B):** all canonical KOLs tag=true with weighted_relevant >> gate (5.0). BEST gate we have.
- **Metric (A):** tagged-HCP count + publication_count distribution shape (note: weighted_relevant score
  is computed in-memory, NOT persisted; only publication_count is stored for comparison).
- **Technique worth reusing:** hand-compute a known KOL's tagging score in SQL BEFORE the run to predict
  pass (AD: Silverberg weighted_relevant 669.9 vs 5.0 gate, computed pre-run -> confirmed the run works).
- **NSCLC baseline:** 80,017 tagged; publication_count avg 5.22, max 346.
- **AD:** 15,902 tagged; publication_count avg 3.86, median 2.0, max 431. All 9 canonical KOLs tag=true
  (Silverberg 669.9, Wollenberg 301, Irvine 228, Eichenfield 207, Bieber 204, Lio 193, Flohr 182,
  Guttman-Yassky 7.9). PASS.
- **Verdict:** same distribution SHAPE, AD smaller-per-HCP on avg (smaller/younger TA). Absolute tagged
  count is TA-size-dependent (NSCLC 5x AD) — compare SHAPE, not raw count. PASS.

## GATE 5 — State derivation / institution coverage   [Type B]
- **Metric:** % of US HCPs at clinical institutions that get a derived_state; advisor cross-check that
  major TA clinical centers are all mapped.
- **AD:** 1,490 / 2,379 US HCPs (63%) mapped to a state after extending staging_us_institution_to_state
  with AD clinical centers. Advisor confirmed all major AD/derm/allergy centers present. PASS.
- **NSCLC-comparable?** Coverage % is TA-dependent (ratio of clinical vs industry/research affiliations).
  Not a clean numeric comparison. The unmapped ~37% is mostly correctly-excluded industry/research.
- **Reusable rule:** the institution->state mapping is TA-dependent (oncology-seeded); EXTEND it with each
  new TA's clinical centers. (Future: institution_master reference table — debt #18.)

## GATE 6 — NPPES / NPI matching   [Type A + Type B spot-check]
- **Metric (A):** high-confidence NPI-match rate among US HCPs at clinical institutions (with a state).
- **Metric (B):** canonical KOL resolves to CORRECT NPI (misattribution check).
- **NSCLC baseline:** 33.0% realized NPI coverage (2,655 / 8,046 US clinical HCPs). NOTE: NSCLC's NPI
  linkage was a KNOWN PAIN POINT (manual Janne/Reddy merges, pharma-gap distortion) -> 33% is a FLOOR,
  "acceptable," not gold-standard.
- **AD (first-pass dry-run):** 31.7% high-confidence (709 hc / 254 ambiguous-skip / 1276 no-match of
  2,239 processed). PASS -- lands on the NSCLC band.
- **KOL spot-check:** Jonathan Silverberg -> npi 1831325521 (GWU, DC) CORRECT. Nanette Silverberg ->
  npi 1316933740 (Mt Sinai, NY) CORRECT -- two same-surname derm KOLs cleanly disambiguated by state.
  Gil Yosipovitch -> 1679558027 CORRECT. No misattribution.
- **STRUCTURAL CEILING (important):** ~33% is NOT a failure -- it's the nature of publication-derived
  data. ~two-thirds of US publication authors are non-clinician researchers/PhDs/industry with NO NPI
  (correctly no-match). Chasing higher risks misattribution. The corollary: ~two-thirds of HCPs
  legitimately lack pharma data -> this is WHY the scoring formula must NOT penalize missing pharma
  (see debt #14 — the "weight only available signals" decision). AD didn't create this; it revealed a
  platform-wide truth NSCLC shares.
- **Minor data-quality flag:** some country='US' HCPs are actually international (e.g. Greek-script names)
  -- they correctly no-match (no state, non-Latin name). country='US' has minor noise. Note, don't fix.

## GATE 6b — Identity resolution / author fragmentation   [Type B primary + Type A distribution]  (added July 7)
- **Why this gate exists:** international-heavy TAs fragment real KOLs across multiple hcps_v2 records via
  Unicode-hyphen/diacritic/initials name variants. NSCLC (US/ASCII names) barely has this; AD (82% intl)
  has it badly. This gate catches it BEFORE it corrupts cohort classification. See PLAYBOOK §0c.
- **Metric (B):** each canonical KOL exists as exactly ONE substantive record after dedup; same-surname
  DIFFERENT-first-name people stay SEPARATE (no false merge).
- **Metric (A):** zero-TA-pub rate among the "established" cohort as a fragmentation smell test.
- **NSCLC baseline (the "clean" reference):** established cohort 4,394; zero-NSCLC-pub = 130 (3%). This 3%
  is what a NON-fragmented TA looks like. AD BEFORE dedup: 25% zero-AD-pub established -> the smell that
  triggered the whole investigation. If a new TA's established cohort has >>3% zero-pub members, suspect
  fragmentation.
- **AD dedup result (July 7):** ~586 corroborated fragments merged (high-confidence band: identical
  name_key + rare surname + STRONG corroboration). Guttman-Yassky: 2 records -> 1 (survivor = her 764-work
  OpenAlex profile); the 7 OTHER Guttmans (different first names) correctly stayed separate. Paz-Ares:
  4 records -> 1. 0 false merges, 0 survivor/merged-away overlap. PASS (identity).
- **KNOWN RESIDUAL (do not mistake for pass):** merge fixes IDENTITY, not corpus linkage. Guttman-Yassky
  post-merge still ~8 LINKED pubs vs OpenAlex works_count 764 — her real pubs aren't in
  publication_authors_v2. So this gate passing does NOT guarantee she'll rank correctly; that depends on
  whether downstream scoring reads OpenAlex works_count (rich) vs total_career_pubs (thin). Separate gate.
- **INVARIANT enforced:** false_split > false_merge. A KOL left fragmented (recall loss) passes with a flag;
  a false merge (two people fused) is a hard FAIL. Common-ambiguity names (any origin) left un-merged is
  CORRECT, not a gap.

## GATE 8 — Cohort classification   [Type A + Type B]  (added July 7, script built)
- **Metric (A):** cohort distribution (established / rising_eligible / too_young / community) and the
  established-rule breakdown; consistency with the scoring pipeline's own cohort gate.
- **Metric (B):** canonical KOLs land in `established`; benchmark (Silverberg) via a defensible rule.
- **Established gate (career-based, confirmed from scoring_pipeline):** total_career_pubs>=500 OR
  (>=200 AND first_pub_year<2020) OR career_age>10. Rising-eligible: career_age in [3,10]. Community =
  leftovers. Classify FIRST (career structure), score cohorts AFTER. Guard first_pub_year BETWEEN 1940-2026.
- **AD result (July 7, pre-dedup-rerun):** established 9,466 (59.5%) / rising_eligible 5,944 (37.4%) /
  too_young 484 (3.0%) / community 8. Rising_eligible EXACTLY matched scoring's in-band 5,944 (logic
  validated). Silverberg -> established. Classifier reproduces the scoring gate precisely.
- **CAUTION (the thing this gate must catch):** classification uses GLOBAL total_career_pubs, so before
  dedup the established cohort was polluted by cross-TA passengers (hepatologists with 0 AD pubs, ranked on
  their liver careers via career_age>10). This is WHY dedup (6b) + the TA-scoped established SCORER must
  run — the classifier is generous (career-based), the SCORER enforces TA-specificity. Re-run classifier
  AFTER dedup + metric re-derivation. PENDING re-run on merged identities.

---

## GATES STILL AHEAD (no baseline yet — capture when AD reaches them)
- pharma_engagement_scoring -> hcp_pharma_engagement_v2 (percentile)  [Open Payments done — Gate 7]
- publication_leadership_scoring -> hcp_publication_leadership_v2 (scientific pctile)  [verified TA-scoped;
  needs wiring to hcp_cohort_classification_v2 instead of hcp_established_ranks_v2]
- network_centrality_scoring -> hcp_network_centrality_v2 (network)
- recompute_established_ranks_v3 -> composite (THE generalization verdict: do AD Established rankings
  ring true? compare top-N to domain truth; compare score distribution shape to NSCLC)
- Rising Star + Community cohort gates (parallel chains, not yet examined)

For the final scoring gate, the KOL check is: do Silverberg/Wollenberg/Eichenfield/Guttman-Yassky surface as
top AD Established, the way Janne/Heymach/Ramalingam do for NSCLC? That's the ultimate "does it generalize."
NOTE (July 7): reaching this verdict now depends on resolving the linked-pub-thinness question (Gate 6b
residual) — a merged KOL with thin linked pubs may still rank low if scoring reads total_career_pubs.

## GATE 7 — Open Payments / pharma rollups   [Type B domain-truth, strong]
- **Metric:** approved AD drugs dominate payment records in expected commercial order (advisor's check);
  canonical KOL shows rich AD-specific engagement.
- **Standard (advisor):** Dupixent/Rinvoq/Cibinqo/Adbry/Ebglyss/Nemluvio/Opzelura/Eucrisa should dominate;
  if a core drug is essentially absent -> investigate (data bug vs commercial timeline).
- **AD result (EXECUTED, --ta scoped, NSCLC untouched):** 275 by_ta rows. By-drug $ order:
  Dupixent $11.0M (122 HCPs) >> Rinvoq $3.3M >> Opzelura $1.8M >> Cibinqo $1.5M >> VTAMA $951K >>
  Adbry $723K >> Zoryve $462K >> Eucrisa $133K. TEXTBOOK AD market order. PASS.
  Newer biologics (Ebglyss, Nemluvio) minimal — consistent w/ 2024 launch timeline (not a gap).
- **KOL spot-check:** Silverberg $1,738,236 AD-attributed, 9 drugs, 8 companies. Rich, real profile.
- **Note:** VTAMA $951K + Zoryve $462K = ~$1.4M of AD signal that would've been MISSED without the
  unmatched-diagnostic drug-list refinement. Validates the refinement loop (21e) as a required step.
- **Scoping proof:** pre-write assertion passed; 275 rows all AD ta_id; NSCLC pharma rollups untouched.

## GATE 9 — Component scorers (scientific / network / commercial)   [Type B + Type A]  (added July 8)
- **Scientific authority (publication_leadership):** all reference KOLs at top by raw score; authorship-position
  signal POPULATED (is_senior/is_first derived from OpenAlex authorships JSON — verify not all-zero). Guideline/
  consensus/editorial/review pub-types counted (guideline-senior weighted 15x). percentile_rank column MUST be
  double precision (integer ties the top 1% at 100 — see debt §29am). AD: Silverberg raw 582 (184 senior) #1.
- **Network centrality:** graph from publication_authors_v2 self-join, TA-scoped; benefits from complete corpus
  linkage. Real KOLs are hubs. CAVEAT: centrality rewards collaborative-publication culture (European consortia
  score high) — this is why network is weighted 0.25 not higher. AD: 19,926 nodes, Girolomoni/Patruno top network.
- **Commercial engagement (pharma):** DISPLAYED not ranked (weight 0 in composite) for intl-heavy TAs. AD: 275
  payers of 2,547 established (11% — structural, US-only Open Payments; 73% of AD established is international).
  hcp_open_payments_by_ta_v2 holds only payers (no 0-fill) — missing pharma is absent, not penalized.

## GATE 10 — Established composite ranking (THE generalization verdict)   [Type B domain-truth, decisive]
- **Metric:** hand the top-20 to a domain Head of Medical Affairs — do they nod? Recovers the reference KOLs
  without hand-tuning. This is the ultimate "does the methodology generalize."
- **Weights:** 0.75 scientific / 0.25 network / 0.0 pharma (pharma displayed). Per-HCP reweighting for missing
  signals (renormalize present weights, never score missing as 0).
- **VALIDATE don't tune:** if it recovers the reference list, STOP. Reference KOL list per TA (AD: Silverberg,
  Simpson, Guttman-Yassky, Wollenberg, Weidinger, Flohr, Eichenfield, Bieber).
- **AD result (EXECUTED):** hcp_established_ranks_v3, 2,546 global + 2,295 region rows. GLOBAL top: Silverberg #1,
  Wollenberg, Flohr, Guttman-Yassky, E.Simpson, Girolomoni, Werfel, Eichenfield, Katoh, Deleuran... US top:
  Silverberg, Guttman-Yassky, Simpson, Eichenfield, Lio, Boguniewicz, Yosipovitch, Abuabara, Leung, Ong.
  Domain-perfect. PASS — the generalization verdict, fully realized. NSCLC=onc/US; AD=derm/82%-intl/fragmented
  — same methodology, credible ranking both. Advisor: "a credible first-generation KOL ranking; the names are right."
- **Calibration lesson:** the ranking was briefly network-skewed (consortium hubs above scientific leaders) —
  root cause was NOT weights but a saturated scientific axis (integer percentile column + integer-floored
  formula tied the top at 100). Fix the calibration and the weighting fixes itself (advisor). Check percentile
  column types (double precision) and use the continuous percentile formula.
- **NSCLC score-distribution baseline (MEASURED July 10):** global composite min 0 / max 100 / avg 42.9 /
  median 38.2 / p90 82.9 / p99 98.7. Healthy spread, NOT top-compressed (the integer-tying gotcha is ABSENT
  in the reference). A new TA's global distribution should match this SHAPE — if the top is compressed
  (many tied at ~100), suspect the percentile-column-type / integer-floor calibration bug. Cross-check AD's
  distribution against this when convenient.

---

# GATES 11–16 — FRONTEND REPOINT & ENRICHMENT (added July 10)

These cover everything AFTER the composite ranking (Gate 10): getting the built TA to render correctly
and populating the enrichment layer to reference-TA parity. Companion: `TA_NEW_PLAYBOOK.md` Part II (§7–10).
Many AD values here were validated in-browser/in-DB this session and are legitimate gates on their own
(Type B), independent of an NSCLC comparison. NSCLC baselines that come from the July 10 parity matrix are
real (measured today); ones we never queried are marked **TBD (query)** with the SQL to run.

## GATE 11 — Cohort re-classification post-dedup   [Type A]  (resolves the Gate 8 PENDING item)
- **Metric:** re-run cohort classification AFTER dedup + a clean ranks table; established cohort no longer
  polluted by cross-TA passengers; the ranks table has exactly one row per (hcp, ta, scope).
- **AD result (EXECUTED July 10):** ranks_v3 deduped — global 5,131 → 2,585 distinct (one row/HCP), 0 dupes;
  constraint swapped to `UNIQUE NULLS NOT DISTINCT` (recurrence structurally prevented). AD-only issue;
  NSCLC clean (0 dupes). Silverberg global rank renders (was null via `.maybeSingle()` on 2 rows). PASS.
- **The invariant this gate enforces:** no duplicate (hcp_id, ta_id, scope_type, scope_value) rows. The
  NULLS-DISTINCT trap: standard UNIQUE lets NULL-scope (global) rows escape the upsert and duplicate on
  re-run. Check: `GROUP BY hcp_id,ta_id,scope_type,scope_value HAVING count(*)>1` returns 0.
- **NSCLC baseline:** 0 duplicate rows (never re-run; clean). AD matched after the fix.

## GATE 12 — Frontend repoint / rendering   [Type B in-browser, decisive]
- **Metric:** logged-in, the new TA renders its correct roster (feed AND detail), the FROZEN reference TA
  looks byte-for-byte identical (regression), and shared side-panels are sane. Typecheck/build passing is
  necessary but NOT sufficient — RLS means you MUST log in and click through (see PLAYBOOK §7g).
- **Standard:** (a) new-TA chip → correct cohort feed (domain-correct top-N); (b) card click → POPULATED
  detail (not "Unclassified"); (c) reference TA's #1 and cards UNCHANGED; (d) the TA-scoping bug pattern
  audited — grep the reference TA's id/slug/name across the frontend, confirm every new-TA read matches its
  written value (expect ~3–4 hardcode bugs per TA; see PLAYBOOK §7f).
- **AD result (EXECUTED July 10):** Immunology→AD chip renders domain-correct Established roster (Silverberg
  #1, Guttman-Yassky #2, Simpson #3, Eichenfield #4 peds…); NSCLC byte-for-byte unchanged (verified
  `taLabelToApiSlug("Oncology")==="nsclc"`); card→detail populated (score block, ranks, bars). Option B
  (real per-indication ta_id) implemented with `?? currentBehavior` guardrail. THREE scoping bugs found +
  fixed (score-block null-cohort derive; narrative slug ×2 read sites; belief-profile tag). PASS.
- **Reusable:** the reference-TA hardcode audit is a REQUIRED step, not opportunistic. A `grep` for the
  reference id/slug/name IS the checklist.

## GATE 13 — Narratives enrichment   [Type A + Type B]  (top-KOL overlay — judge by depth, not cohort %)
- **Metric (A):** narratives written for the intended top-N of the cohort; low cohort % is EXPECTED (overlay
  layer, top-KOL by design). **Metric (B):** a canonical KOL's narrative RENDERS on the detail page and
  reads true to the field; the write-slug MATCHES the frontend read-slug (else invisible).
- **Standard:** trace-before-generate (confirm tag/slug match + cost BEFORE running, PLAYBOOK §8b); narrative
  anchors on INSTITUTION not stale NPPES city; all 5 generated fields (narrative/why_now/engagement_angle/
  signal_strength/caution_flags) have a RENDER site (audit generate-vs-render, PLAYBOOK §8g).
- **AD result (EXECUTED July 10):** 198 Established narratives (top-200, 2 transient failures), $1.10, 34 min.
  Guttman-Yassky "Why This Expert" + full Signal Summary render + read true. Slug fix landed (writes
  atopic-dermatitis, frontend reads atopic-dermatitis). Signal Summary un-gated (4 fields were generated-but-
  buried for Established platform-wide — now surface). PASS.
- **NSCLC baseline (MEASURED July 10):** 3,213 narratives; field-completeness narrative_text 100%,
  why_now / engagement_angle / signal_strength ~94% (3,012 ea), caution_flags 26% (843). **Standard:**
  why_now/engagement_angle/signal_strength should populate ~universally; caution_flags LEGITIMATELY sparse
  (~quarter) — most HCPs warrant no caution, null is correct (validates hide-when-null UI). (Parity matrix
  also showed 1,356 as the rendered narrative slice — parity is a SLICE not 100% cohort; don't chase raw count.)
- **Slug-match invariant:** generator write value == frontend read value for the TA. The #1 silent-failure
  mode (PLAYBOOK §8b). Verify by RENDER, not by row count.

## GATE 14 — Belief Profile / Scientific Positions   [Type B domain-truth, the MOAT gate]
- **Metric (B):** a canonical KOL's Belief Profile renders and reads TRUE to their known scientific positions
  (founder/advisor gut-check — "is this actually them?"); themes are genuine TA concepts, NOT drug names, NOT
  reference-TA leakage; healthy polarity spread (not all-positive = real positions, not cheerleading).
- **Metric (A):** positions extracted per HCP (cap ~10 papers), profiles written with correct tag; depth
  classification (deep ≥5 / focused ≥3 / signal) sane.
- **Standard:** per-TA registry (TA_CONFIGS) with reference entry VERBATIM (prove byte-identity via prompt-
  render diff); TA-NEUTRAL exemplars (founder authors NO clinical claims; model extracts real abstracts);
  Stage-1 idempotent (delete-before-reinsert); tag == frontend read.
- **AD result (test-5 EXECUTED July 10; full top-100 running):** test-5 = 249 positions from 50 papers
  (polarity 119 pos / 58 unmet-need / 41 cautionary / 31 hypothesis — healthy mix), 5 profiles all depth=deep,
  genuine AD themes ("Beyond-Severity Burden Assessment", "Skin Barrier Therapeutic Targeting",
  "Psychodermatology Adjunctive Benefit"), tag=atopic-dermatitis on all 5, zero NSCLC contamination. NSCLC
  byte-identity PROVEN (prompt-render diff empty). Extraction quality validated as AD-accurate + specific.
  PASS (test-5); full top-100 pending completion. Cost ~$15 (grounded; NOT the $20-60 ballpark).
- **NSCLC baseline (MEASURED July 10):** 6,354 positions / 181 HCPs = **35.1 positions/HCP**; polarity
  2,160 positive / 1,560 unmet-need / 1,602 cautionary / 1,032 hypothesis (~34%/25%/25%/16%). ~104 Belief-
  Profile HCPs synthesized (parity matrix). **Standard for a new TA:** positions/HCP in the ~35 band (top-KOL
  slice runs higher, ~50); polarity SHAPE = positive largest, hypothesis smallest (a healthy realistic mix,
  not all-positive). AD test-5 matched the shape (48/23/16/13). PASS criterion is shape-match + domain truth,
  not exact count.
- **The differentiated-moat note:** this is authority-weighted position aggregation — the layer no
  publication-count competitor can replicate. Its gate is DOMAIN TRUTH (does it read true to the KOL), not a
  coverage %. Neutral-exemplars + real-abstracts is the quality mechanism (validated: AD produced correct AD
  positions with zero founder clinical authorship).

## GATE 15 — Top Collaborators & Research Themes   [Type A + Type B]  (net-new runs per TA)
- **Metric:** collaborator-pairing run populates `hcp_top_collaborators_v2` (detail collaborator panel);
  theme-extraction run populates `hcp_research_themes_v2`; canonical KOL shows plausible co-authors / themes.
- **AD result:** **NOT YET RUN (0 rows both).** Two net-new runs remain for AD Established parity.
  network_centrality_v2 DID run (19,925+ AD rows) — that's the graph; the collaborator-PAIRING step is
  separate and pending.
- **NSCLC baseline (MEASURED July 10 night):**
  - **Top Collaborators** = 434,929 rows / 93,923 HCPs = **4.6 collaborators/HCP**. NOTE: this is a NEAR-FULL-
    COHORT layer (populated for ~94K HCPs, not a top-KOL overlay) — matches the parity matrix's 57% coverage.
    Keyed by `therapeutic_area_id` (uuid) + has a `window_type` column (per time-window, like network 10yr —
    check which window the frontend reads before the AD run). Target for AD: ~4.6/HCP across the cohort.
  - **Research Themes** = 10,640 rows / 1,064 HCPs = **exactly 10.0/HCP** (CAPPED at top-10 themes per HCP).
    Keyed by `therapeutic_area` = **TEXT** storing the DISPLAY NAME `'NSCLC'` (NOT a uuid, NOT a slug). Target
    for AD: top-10 themes/HCP for the run's HCP set.
- **SCHEMA GOTCHA (tag-match risk — trace before the AD run):** the two tables key the TA DIFFERENTLY —
  collaborators by `therapeutic_area_id` (uuid), themes by `therapeutic_area` (TEXT display name). When AD themes
  run, the written `therapeutic_area` value MUST match what the frontend reads for AD (per belief-profile
  precedent the frontend reads the slug `atopic-dermatitis` — confirm the themes read path before generating, or
  themes generate invisibly). Same class as the narrative-slug / belief-tag bugs (PLAYBOOK §7f, §8b).
- **Standard:** same trace-before-generate + tag-match + backward-compat discipline as Gates 13–14.
- **PENDING for AD** — run both (collaborator-pairing + theme-extraction), confirm tag-match FIRST, then re-check.

## GATE 16 — Definition of Done: the parity matrix   [Type A, the acceptance gate]
- **Metric:** a live-DB parity matrix vs the frozen reference TA, per cohort (Established + Rising): rows =
  enrichment layers, columns = {Ref Est, New Est, Ref Rising, New Rising}, each cell = coverage + remaining.
  Saved as `docs/<TA>_PARITY_CHECKLIST.md`. See PLAYBOOK §9.
- **Reading rule (critical — %s NOT apples-to-apples):** full-cohort layers should approach 100% for a
  properly-built TA (AD Est 98–99%, CLEANER than NSCLC's 57% legacy denominator — new TA needn't "catch up");
  overlay layers (narratives/belief/themes) are top-KOL by design (judge depth not %); US clinical/commercial
  coverage-capped by US fraction (intl-heavy TA low = structural, display-only).
- **AD result (EXECUTED July 10):** matrix built + saved (`AD_PARITY_CHECKLIST.md`). AD Established
  ESSENTIALLY DONE (Belief Profile finishing + Collaborators + Themes = 2 net-new runs remain). AD Rising
  ENTIRELY UNBUILT — one blocker (rising scoring chain never ran; 3,234 eligible waiting), whole column
  cascades from it. PARTIAL PASS (Established near-complete; Rising is a separate coherent workstream).
- **Rising model reconciliation (flag):** the parity matrix measured the OLD rising model (hcp_rising_star_
  ranks_v3 + network_momentum); AD Rising was also discussed as the NEW model (hcp_rising_composite_v1 /
  scientific_emergence_v1) with a frontend repoint pending. RESOLVE which is canonical before running AD
  Rising — the scoring chain and the frontend repoint must target the SAME model.

---

## STILL-TO-MEASURE — NSCLC diagnostics we never ran (backfill these baselines)
The Gate 11–16 AD values are validated and stand as gates on their own. These NSCLC baselines would
STRENGTHEN the Type-A comparisons but were never queried (most Gate 13–16 NSCLC numbers above come from the
July 10 parity matrix, which IS real; the ones below are genuinely unmeasured). Run in the founder's terminal
(per PLAYBOOK §10), NSCLC ta_id = c0065b03-a25e-4e9a-bde4-4b4d0db7827d:

1. ~~Gate 14 NSCLC position-extraction depth~~ **MEASURED July 10 (night):** NSCLC = 6,354 positions / 181 HCPs
   / **35.1 per HCP**; polarity 2,160 positive / 1,560 unmet-need / 1,602 cautionary / 1,032 hypothesis
   (~34%/25%/25%/16%). AD test-5 (~50/HCP for top-5 KOLs, 119/58/41/31 = 48%/23%/16%/13%) = SAME SHAPE
   (positive largest, hypothesis smallest), slightly positive-skewed on the top KOLs; full AD top-100 avg should
   settle toward ~35. Gate 14 VALIDATED — AD positions structurally comparable to NSCLC. (Baseline now filled in
   Gate 14 above.)
2. ~~Gate 13 NSCLC narrative field-completeness~~ **MEASURED July 10 (night):** NSCLC = 3,213 narratives; 
   narrative_text 3,213 (100%), why_now / engagement_angle / signal_strength 3,012 each (~94%), caution_flags
   843 (26%). => caution_flags is LEGITIMATELY SPARSE by design (most HCPs warrant no caution → null is correct,
   validates the 'hide caution when null' UI + AD's frequent-null caution_flags is correct). Target for AD:
   ~universal why_now/engagement_angle/signal_strength, ~quarter caution_flags. (Baseline now filled in Gate 13.)
3. ~~Gate 15 NSCLC collaborator/theme depth~~ **MEASURED July 10 (night):** collaborators 434,929 / 93,923 HCPs
   = 4.6/HCP (near-full-cohort, keyed therapeutic_area_id uuid, has window_type); themes 10,640 / 1,064 HCPs =
   10.0/HCP (capped top-10, keyed therapeutic_area TEXT='NSCLC' display name). Baselines now filled in Gate 15.
   The therapeutic_area='NSCLC' text key is a TAG-MATCH risk for the AD themes run (see Gate 15 schema gotcha).
4. **Gate 12 NSCLC has no numeric baseline (it's a Type-B in-browser gate)** — nothing to query; the standard
   IS "reference TA renders identically," which is self-referential. No backfill needed.
5. ~~Gate 10 score-distribution SHAPE~~ **MEASURED July 10 (night):** NSCLC global composite = min 0, max 100,
   avg 42.9, median 38.2, p90 82.9, p99 98.7. Healthy spread, NOT top-compressed (the integer-percentile-tying
   calibration gotcha is absent). AD's global distribution should match this shape — cross-check AD when convenient.

