# TA_GATE_BASELINES.md — "What Good Looks Like" per pipeline gate

Purpose: at each pipeline gate, a concrete acceptance standard anchored to the NSCLC build (a trusted,
demo-quality TA), so a new TA's output can be judged against a real reference instead of subjective
"looks right." This is also the ruleset the QA Scientist agent will enforce.

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
