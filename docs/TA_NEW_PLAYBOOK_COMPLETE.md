# TA NEW PLAYBOOK â€” COMPLETE

How to onboard a new therapeutic area on FieldMark. Merged from TA_NEW_PLAYBOOK.md (foundational) plus
the _ch2 and _ch3 addenda â€” chapters were size splits, not topic splits.

**This is the canonical deep reference.** For a condensed, command-driven runbook see docs/TA_BUILD_GUIDE.md.
For the raw chronological record these rules were extracted from, see docs/TA_BUILD_DEBT_COMPLETE.md.
Where this document and the live code disagree, **the code wins** â€” parts of ch1 predate the 2026-07-23
ingest refactor (see section 0z).

Generated: 2026-07-24

---

## Contents

### from TA_NEW_PLAYBOOK.md
- [⛔ SUPERSEDES — do not follow these for new TA builds](#-supersedes-do-not-follow-these-for-new-ta-builds)
- [0. The core philosophy (read this first)](#0-the-core-philosophy-read-this-first)
  - [Two principles that prevent the disaster](#two-principles-that-prevent-the-disaster)
- [0b. THE HCP DATA MODEL — TA silos over a single identity (FOUNDATIONAL)](#0b-the-hcp-data-model-ta-silos-over-a-single-identity-foundational)
  - [The model](#the-model)
  - [The firewall (default) and the Dossier (privileged)](#the-firewall-default-and-the-dossier-privileged)
  - [Why every requirement forces this exact model](#why-every-requirement-forces-this-exact-model)
  - [Consequence for the inventory (resolves the "extension" question)](#consequence-for-the-inventory-resolves-the-extension-question)
- [0c. AUTHOR IDENTITY RESOLUTION — fragmentation, dedup, and the false-merge invariant (FOUNDATIONAL, added July 7)](#0c-author-identity-resolution-fragmentation-dedup-and-the-false-merge-invariant-foundational-added-july-7)
  - [What fragmentation looks like (the symptom chain)](#what-fragmentation-looks-like-the-symptom-chain)
  - [Root causes (all name-normalization failures)](#root-causes-all-name-normalization-failures)
  - [THE INVARIANT — false_split > false_merge (both experts, adopted as code, not philosophy)](#the-invariant-false_split-false_merge-both-experts-adopted-as-code-not-philosophy)
  - [THE COMMITTED RULE — ambiguity, not geography; corroboration required](#the-committed-rule-ambiguity-not-geography-corroboration-required)
  - [name_key normalization (the fix that makes detection possible)](#name_key-normalization-the-fix-that-makes-detection-possible)
  - [The dedup subsystem — TWO detection paths](#the-dedup-subsystem-two-detection-paths)
  - [Merger correctness requirements (learned the hard way)](#merger-correctness-requirements-learned-the-hard-way)
  - [SEQUENCE — dedup BEFORE de-inflation (order matters)](#sequence-dedup-before-de-inflation-order-matters)
  - [The SEPARATE problem dedup does NOT fix: publication under-linkage](#the-separate-problem-dedup-does-not-fix-publication-under-linkage)
  - [The future (committed next-leg, NOT built yet)](#the-future-committed-next-leg-not-built-yet)
- [0d. TA-ANCHORED ESTABLISHMENT — "established in a TA" requires real TA output (added July 8)](#0d-ta-anchored-establishment-established-in-a-ta-requires-real-ta-output-added-july-8)
- [0z. TWO INGEST SCRIPTS - READ BEFORE SECTION 1 (added 2026-07-23)](#0z-two-ingest-scripts---read-before-section-1-added-2026-07-23)
- [1. The canonical pipeline order (v2)](#1-the-canonical-pipeline-order-v2)
- [2. Authoring the retrieval query (the make-or-break artifact)](#2-authoring-the-retrieval-query-the-make-or-break-artifact)
  - [2a. Where it lives](#2a-where-it-lives)
  - [2b. Structure — tiers (retrieval = Tiers 1–3 only)](#2b-structure-tiers-retrieval-tiers-13-only)
  - [2c. The "eczema-style fallback" pattern (recall without noise)](#2c-the-eczema-style-fallback-pattern-recall-without-noise)
  - [2d. Validation gates — run ALL before ingesting (none write data)](#2d-validation-gates-run-all-before-ingesting-none-write-data)
  - [2e. Config-table row — set these explicitly](#2e-config-table-row-set-these-explicitly)
  - [2f. Query-optimization procedure (advisor-endorsed; do during the ontology+compiler pass)](#2f-query-optimization-procedure-advisor-endorsed-do-during-the-ontologycompiler-pass)
- [2g. CONCEPT-TAGGING CURATION DOCTRINE (`curated_ta_concepts`)](#2g-concept-tagging-curation-doctrine-curated_ta_concepts)
  - [The core distinction (do not conflate these three layers)](#the-core-distinction-do-not-conflate-these-three-layers)
  - [The three-status model — every ontology concept gets a status](#the-three-status-model-every-ontology-concept-gets-a-status)
  - [Curation procedure (empirical, allowlist-first)](#curation-procedure-empirical-allowlist-first)
  - [Tuning philosophy: membership stable, weights are the knob](#tuning-philosophy-membership-stable-weights-are-the-knob)
  - [AD worked example — 23 tagging concepts (tiered by diagnostic strength)](#ad-worked-example-23-tagging-concepts-tiered-by-diagnostic-strength)
- [3. Global vs US, and the inventory `--truncate` question](#3-global-vs-us-and-the-inventory---truncate-question)
- [4. Non-negotiable operating discipline (learned the hard way this session)](#4-non-negotiable-operating-discipline-learned-the-hard-way-this-session)
- [5. Validation targets (AD) — the acceptance test for the build](#5-validation-targets-ad-the-acceptance-test-for-the-build)
- [6. Automation horizon (the "holy grail")](#6-automation-horizon-the-holy-grail)
- [3b. CANONICAL INCREMENTAL INVENTORY BUILD (worked & verified, AD, July 3)](#3b-canonical-incremental-inventory-build-worked-verified-ad-july-3)
- [MULTI-TA SCRIPT STANDARD (added July 6 — the contract every pipeline script must meet)](#multi-ta-script-standard-added-july-6-the-contract-every-pipeline-script-must-meet)
- [PIPELINE ADDITIONS (July 6 — steps discovered during AD, missing from original §1 order)](#pipeline-additions-july-6-steps-discovered-during-ad-missing-from-original-1-order)
  - [STATE DERIVATION (before NPPES) — NEW required step for publication-derived HCPs](#state-derivation-before-nppes-new-required-step-for-publication-derived-hcps)
  - [INDUSTRY/NIH HCP HANDLING (during/before NPPES)](#industrynih-hcp-handling-duringbefore-nppes)
  - [ESTABLISHED SCORING SUB-PIPELINE (rewritten July 8 after the AD build — supersedes the old 50/35/15 model)](#established-scoring-sub-pipeline-rewritten-july-8-after-the-ad-build-supersedes-the-old-503515-model)
  - [SCORING DOCTRINE (the load-bearing decisions from the AD build — advisor-validated)](#scoring-doctrine-the-load-bearing-decisions-from-the-ad-build-advisor-validated)
- [MULTI-TA STANDARD — ADDENDUM (July 6): --dry-run is MANDATORY; never write on first run](#multi-ta-standard-addendum-july-6---dry-run-is-mandatory-never-write-on-first-run)
- [7. FRONTEND REPOINT — making a built TA appear correctly](#7-frontend-repoint-making-a-built-ta-appear-correctly)
  - [7a. The foundational insight: cohort data flows through RPCs, not table names](#7a-the-foundational-insight-cohort-data-flows-through-rpcs-not-table-names)
  - [7b. TA-as-indication-under-a-parent (the IA pattern)](#7b-ta-as-indication-under-a-parent-the-ia-pattern)
  - [7c. THE FAÇADE DISCOVERY — the parent hierarchy may be cosmetic](#7c-the-façade-discovery-the-parent-hierarchy-may-be-cosmetic)
  - [7d. Option A (façade mirror) vs Option B (real per-indication ta_id) — PREFER B](#7d-option-a-façade-mirror-vs-option-b-real-per-indication-ta_id-prefer-b)
  - [7e. THE BACKWARD-COMPAT GUARDRAIL (the load-bearing pattern for ALL of Part II)](#7e-the-backward-compat-guardrail-the-load-bearing-pattern-for-all-of-part-ii)
  - [7f. THE TA-SCOPING BUG PATTERN (recurring — expect ~3–4 per TA)](#7f-the-ta-scoping-bug-pattern-recurring-expect-34-per-ta)
  - [7g. VERIFY-IN-BROWSER-LOGGED-IN is the only real confirmation](#7g-verify-in-browser-logged-in-is-the-only-real-confirmation)
  - [7h. Repoint gotchas checklist](#7h-repoint-gotchas-checklist)
- [8. ENRICHMENT LAYER — making the new TA's profiles as complete as the reference](#8-enrichment-layer-making-the-new-tas-profiles-as-complete-as-the-reference)
  - [8a. The enrichment inventory (per-HCP layers to populate)](#8a-the-enrichment-inventory-per-hcp-layers-to-populate)
  - [8b. TRACE-BEFORE-GENERATE (the discipline that prevents wasted runs)](#8b-trace-before-generate-the-discipline-that-prevents-wasted-runs)
  - [8c. COST-GROUNDING (don't trust ballpark estimates)](#8c-cost-grounding-dont-trust-ballpark-estimates)
  - [8d. THE PER-TA REGISTRY PATTERN (how to parameterize a reference-hardcoded pipeline)](#8d-the-per-ta-registry-pattern-how-to-parameterize-a-reference-hardcoded-pipeline)
  - [8e. PROMPT DE-CONTAMINATION — TA-NEUTRAL exemplars (do NOT ask the founder to author clinical claims)](#8e-prompt-de-contamination-ta-neutral-exemplars-do-not-ask-the-founder-to-author-clinical-claims)
  - [8f. IDEMPOTENCY (re-runs must not duplicate)](#8f-idempotency-re-runs-must-not-duplicate)
  - [8g. Signal fields must actually RENDER (audit generate-vs-render)](#8g-signal-fields-must-actually-render-audit-generate-vs-render)
  - [8h. Enrichment run ordering & dependencies](#8h-enrichment-run-ordering-dependencies)
- [9. DEFINITION OF DONE — the parity matrix](#9-definition-of-done-the-parity-matrix)
- [10. PART II OPERATING DISCIPLINE (additions to §4)](#10-part-ii-operating-discipline-additions-to-4)

### from TA_NEW_PLAYBOOK_ch2.md
  - [7i. MODEL MIGRATION REPOINT — when the new cohort uses a DIFFERENT scoring model, not just a different ta_id](#7i-model-migration-repoint-when-the-new-cohort-uses-a-different-scoring-model-not-just-a-different-ta_id)
  - [7j. AUTHOR A NEW RPC BY MIRRORING THE STRUCTURALLY-MATCHING REFERENCE, NOT THE SAME-NAMED ONE](#7j-author-a-new-rpc-by-mirroring-the-structurally-matching-reference-not-the-same-named-one)
  - [7k. career_first_pub_year_v2 IS CANONICAL EVERYWHERE — the one column where "mirror the reference" is WRONG](#7k-career_first_pub_year_v2-is-canonical-everywhere-the-one-column-where-mirror-the-reference-is-wrong)
  - [7l. THE RPC RETURN SHAPE IS A CONTRACT — trace the CONSUMER before finalizing it (the empty-render trap)](#7l-the-rpc-return-shape-is-a-contract-trace-the-consumer-before-finalizing-it-the-empty-render-trap)
  - [7m. DEPRECATE, DON'T PORT, a construct whose premise was retired](#7m-deprecate-dont-port-a-construct-whose-premise-was-retired)
- [11. PER-TA COHORT FORK — routing a new model without touching the frozen TA (added July 12, AD Rising)](#11-per-ta-cohort-fork-routing-a-new-model-without-touching-the-frozen-ta-added-july-12-ad-rising)
  - [11a. NSCLC-frozen is an ARCHITECTURAL GUARANTEE, not vigilance](#11a-nsclc-frozen-is-an-architectural-guarantee-not-vigilance)
  - [11b. Fork at the CALL SITE, never inside the shared fetcher](#11b-fork-at-the-call-site-never-inside-the-shared-fetcher)
  - [11c. CAPTURE THE FROZEN TA'S FINGERPRINT BEFORE the edit — it's the regression oracle](#11c-capture-the-frozen-tas-fingerprint-before-the-edit-its-the-regression-oracle)
  - [11d. BACK-MIGRATION OF THE FROZEN TA IS DEFERRABLE — split-brain is an acceptable, DELIBERATE state](#11d-back-migration-of-the-frozen-ta-is-deferrable-split-brain-is-an-acceptable-deliberate-state)
- [12. GLOBAL-FIRST TAs — the scope default + the global short-circuit (added July 12, AD Rising)](#12-global-first-tas-the-scope-default-the-global-short-circuit-added-july-12-ad-rising)
  - [12a. Some TAs are GLOBAL-FIRST — and the frontend defaults to US](#12a-some-tas-are-global-first-and-the-frontend-defaults-to-us)
  - [12b. Global-first is a DEFINITION-OF-DONE question, decided by the founder, not an engineering afterthought](#12b-global-first-is-a-definition-of-done-question-decided-by-the-founder-not-an-engineering-afterthought)
  - [12c. BEFORE designing global-first scope, check whether the REFERENCE TA already solved it](#12c-before-designing-global-first-scope-check-whether-the-reference-ta-already-solved-it)

### from TA_NEW_PLAYBOOK_ch3.md
- [13. THE POSITIONING LAYER — describing a TA's features publicly (added, marketing landing page)](#13-the-positioning-layer-describing-a-tas-features-publicly-added-marketing-landing-page)
  - [13a. FEATURE COPY IS A CODE-GROUNDED ARTIFACT, NOT A MEMORY-GROUNDED ONE — re-extract before every positioning pass](#13a-feature-copy-is-a-code-grounded-artifact-not-a-memory-grounded-one-re-extract-before-every-positioning-pass)
  - [13b. THE PUBLIC SURFACE DESCRIBES CAPABILITY, NEVER NAMED-INDIVIDUAL SURVEILLANCE — a standing liability rail](#13b-the-public-surface-describes-capability-never-named-individual-surveillance-a-standing-liability-rail)
  - [13c. PROVENANCE CHECK — confirm you're reading the CURRENT log before acting on "full state"](#13c-provenance-check-confirm-youre-reading-the-current-log-before-acting-on-full-state)
  - [13d. CLAIM THE COMPUTE FLOOR — and never market a feature the code doesn't contain](#13d-claim-the-compute-floor-and-never-market-a-feature-the-code-doesnt-contain)
  - [13e. MARKET THE LAYER, GATE THE DRILL-DOWN — differentiator capabilities that carry sensitive columns](#13e-market-the-layer-gate-the-drill-down-differentiator-capabilities-that-carry-sensitive-columns)
  - [13f. SPLIT THE TRUST STORY — transparent scoring vs. grounded AI synthesis; chain every AI claim to its grounding](#13f-split-the-trust-story-transparent-scoring-vs-grounded-ai-synthesis-chain-every-ai-claim-to-its-grounding)
- [14. SHIPPING A STANDALONE STATIC SITE ON CLOUDFLARE PAGES (added — marketing landing deploy)](#14-shipping-a-standalone-static-site-on-cloudflare-pages-added-marketing-landing-deploy)
  - [14a. PAGES, NOT WORKERS — Cloudflare merged the flows and funnels you into the wrong builder](#14a-pages-not-workers-cloudflare-merged-the-flows-and-funnels-you-into-the-wrong-builder)
  - [14b. ENV VARS BIND AT DEPLOY TIME — a dashboard edit does nothing until you redeploy](#14b-env-vars-bind-at-deploy-time-a-dashboard-edit-does-nothing-until-you-redeploy)
  - [14c. THE FAILURE-SIGNATURE LADDER for a Function → Supabase insert (read the log, don't guess)](#14c-the-failure-signature-ladder-for-a-function-supabase-insert-read-the-log-dont-guess)
  - [14d. SEPARATE REPO = the guardrail is structural, not vigilant](#14d-separate-repo-the-guardrail-is-structural-not-vigilant)
  - [14e. POST-DEPLOY, HARD-REFRESH BEFORE BELIEVING WHAT YOU SEE](#14e-post-deploy-hard-refresh-before-believing-what-you-see)
- [15. BRANCH-VS-DIRECT DISCIPLINE ON AN AUTO-DEPLOYING PRODUCTION BRANCH (added — AD merge + Community restyle)](#15-branch-vs-direct-discipline-on-an-auto-deploying-production-branch-added-ad-merge-community-restyle)
  - [15a. The axis is BLAST RADIUS × SILENCE, not change size](#15a-the-axis-is-blast-radius-silence-not-change-size)
  - [15b. "REUSE THE SHARED COMPONENT" ≠ force the wrong component onto new data](#15b-reuse-the-shared-component-force-the-wrong-component-onto-new-data)
- [§32. INCREMENTAL REINGEST — corrections & additions to the ROADMAP (from the first real cycle walk, 2026-07-21)](#32-incremental-reingest-corrections-additions-to-the-roadmap-from-the-first-real-cycle-walk-2026-07-21)
- [§33. RISING-STAR SCORING — THE MOMENTUM CHAIN (the section the main playbook was missing)](#33-rising-star-scoring-the-momentum-chain-the-section-the-main-playbook-was-missing)
  - [THE CHAIN (all scripts in scripts/score/, all click-based, all support --ta/--dry-run/--debug-top).](#the-chain-all-scripts-in-scriptsscore-all-click-based-all-support---ta--dry-run--debug-top)
  - [THE DIFF — reingest_diff.py POINTS AT THE WRONG TABLE](#the-diff-reingest_diffpy-points-at-the-wrong-table)
  - [ALSO UPDATE main TA_NEW_PLAYBOOK.md step 12 to reference THIS section.](#also-update-main-ta_new_playbookmd-step-12-to-reference-this-section)
  - [§33 CORRECTION — the momentum model is NOT "old/inferior tech debt." It's MODEL-PER-LANDSCAPE by design.](#33-correction-the-momentum-model-is-not-oldinferior-tech-debt-its-model-per-landscape-by-design)
- [§34. PER-TA RISING-MODEL SELECTION — the decision tree (how to choose the `rising_model` value when onboarding a TA)](#34-per-ta-rising-model-selection-the-decision-tree-how-to-choose-the-rising_model-value-when-onboarding-a-ta)
  - [1. Does the MOMENTUM model (NSCLC) fit?](#1-does-the-momentum-model-nsclc-fit)
  - [2. Does the EMERGENCE/NETWORK composite (AD) fit?](#2-does-the-emergencenetwork-composite-ad-fit)
  - [3. Neither fits as-is? Sub-cases, CHEAPEST FIRST — exhaust 3a before ever building 3c.](#3-neither-fits-as-is-sub-cases-cheapest-first-exhaust-3a-before-ever-building-3c)
  - [KEY DISCIPLINE](#key-discipline)
- [§35. INCREMENTAL REINGEST — THE COMMAND RUNBOOK (copy-paste, in order)](#35-incremental-reingest-the-command-runbook-copy-paste-in-order)
  - [0. INGEST (produces the ingestion_run_id everything else scopes to)](#0-ingest-produces-the-ingestion_run_id-everything-else-scopes-to)
  - [1. compute affected HCPs (the scope file for tagging/enrich)](#1-compute-affected-hcps-the-scope-file-for-taggingenrich)
  - [2. ta_tagging (scoped)   [DEFAULT DRY-RUN — add --execute]](#2-ta_tagging-scoped-default-dry-run-add---execute)
  - [3. generate the full-TA hcp-ids file, then Step F (scoped additive)](#3-generate-the-full-ta-hcp-ids-file-then-step-f-scoped-additive)
  - [4. 9b authorship position   [DEFAULT DRY-RUN — add --execute]](#4-9b-authorship-position-default-dry-run-add---execute)
  - [5. DEDUP   [detect is read-only; merge defaults to high-confidence tier]](#5-dedup-detect-is-read-only-merge-defaults-to-high-confidence-tier)
  - [6. CAREER CHAIN (the deep one — 4 sub-steps, all AFTER dedup)](#6-career-chain-the-deep-one-4-sub-steps-all-after-dedup)
  - [7. SCORE — via the dispatcher (--ta selects TA + methodology)](#7-score-via-the-dispatcher---ta-selects-ta-methodology)
  - [8. THE DIFF (the deliverable) — capture BEFORE (before step 7!) and AFTER on the CORRECT table](#8-the-diff-the-deliverable-capture-before-before-step-7-and-after-on-the-correct-table)
  - [STAGE ORDERING (hard dependencies)](#stage-ordering-hard-dependencies)


---
---

# ===== source: TA_NEW_PLAYBOOK.md =====

# TA_NEW_PLAYBOOK.md — How to Onboard a New Therapeutic Area

**Status:** FOUNDATIONAL — CANONICAL. This document supersedes all prior TA-expansion guidance.
**Created:** July 3, 2026 (during the Atopic Dermatitis / TA #2 build)
**Last updated:** July 10, 2026 — added **PART II (Frontend Repoint & Enrichment)**: sections 7–10 cover
everything AFTER scoring — making a built TA render correctly (§7), the enrichment/synthesis layer (§8),
the parity-matrix definition-of-done (§9), and Part II operating discipline (§10). Part I (below, §0–§6)
is the BACKEND build (ingest → dedup → score); Part II is getting it into the product at parity.
**Companion:** `TA_BUILD_DEBT.md` (chronological work log / what the platform still owes) and
`<TA>_PARITY_CHECKLIST.md` (per-TA definition-of-done matrix).

**The core Part II mental model:** there is always a FROZEN REFERENCE TA (NSCLC for the AD build) that
already works end-to-end. Every Part II step = "make the new TA do what the reference TA does, WITHOUT
changing the reference TA byte-for-byte." The reference TA is both template and regression oracle.

---

## ⛔ SUPERSEDES — do not follow these for new TA builds

The following documents predate this playbook and contain guidance that is partially wrong,
incomplete, or based on the pre-v2 detour. They are deprecated. Do not follow them. Kept in
place for historical reference only:

- `ATOPIC_DERMATITIS_BUILD.md`
- `TA_EXPANSION_ROADMAP.md`
- `TA_EXPANSION_ROADMAP_v2.md`
- `Latest Documentation/*` (day-2, HANDOVER, TECH_DEBT, etc. remain useful as *architecture history*
  but are NOT the operational runbook)
- `Handovers/AD_INTEGRATION_HANDOFF - 2July26.md` (its diagnosis was directionally right but several
  concrete state claims were wrong — e.g. "zero OpenAlex linkage" was actually 172; verify everything)

**Rule:** if any older doc conflicts with this one, this one wins.

---

## 0. The core philosophy (read this first)

FieldMark is a pipeline of transformations sitting on top of a **retrieval definition**. Everything
downstream — enrichment, HCP creation, scoring, narratives — faithfully processes whatever the
retrieval step decides is "in scope." Therefore:

> **The ingestion definition is the root of the dependency tree. Get it wrong and you don't get a
> slightly-off result — you get tens of thousands of confidently-wrong HCPs, because every downstream
> step processes the contamination without complaint.**

The second TA build (Atopic Dermatitis) proved this the hard way: a contaminated retrieval query plus
a broken tagging backfill produced ~47,850 publications (only ~24K genuinely AD) and would have
produced ~40,000 wrong HCPs. See `TA_BUILD_DEBT.md` §1 for the full post-mortem.

### Two principles that prevent the disaster

**PRINCIPLE 1 — Retrieval is disease identity ONLY.**
The retrieval query answers exactly one question: *"Is this paper about \<the disease\>?"*
It must be built from disease terms: MeSH disease anchors, disease-name synonyms, historical names,
spelling variants, age/severity variants, and tight logical expansions.

It must **NOT** contain: drug names, biologics, mechanisms/cytokines, cell types, barrier proteins,
therapeutic classes, or molecular pathways. Those answer a *different* question ("what does this AD
paper discuss?") and belong in the **enrichment** layer, extracted *after* retrieval.

Why: modern immunology/oncology drugs and mechanisms are **pan-indication**. Bare `dupilumab` pulls
asthma, EoE, CRSwNP, prurigo. Bare `baricitinib` pulls RA, COVID, UC, alopecia. Even *anchored*
mechanism terms (`IL-13 AND dermatitis`) leak, because "mentions the disease" ≠ "is about the disease"
(an asthma paper whose abstract lists "...asthma, allergic rhinitis, atopic dermatitis..." satisfies
`IL-13 AND dermatitis` but is an asthma paper).

**PRINCIPLE 2 — Tag publications ONLY from the retrieval query's own PMID result. NEVER by author graph.**
A publication is tagged to a TA because *that TA's query returned it from PubMed*. Never tag a
publication because one of its co-authors is already a TA-tagged HCP. That is circular
guilt-by-association: it lets any paper sharing any author with an in-scope paper get pulled in,
dragging in wildly unrelated topics (the AD build tagged diesel-exhaust and porcine-encephalitis
papers this way). The canonical `ingest_publications.py` does this correctly (PMID-driven); do not
reintroduce a co-author backfill.

---

## 0b. THE HCP DATA MODEL — TA silos over a single identity (FOUNDATIONAL)

This is the load-bearing architectural decision for a multi-TA platform. Every TA build must honor it.

### The model
- **TA silos are the default unit of the product.** Each TA (Atopic Dermatitis, NSCLC, Breast, ...)
  presents as a self-contained world: its own HCPs, scores, publications, narratives, collaborator
  networks. Users live in a silo — or in several, if explicitly granted.
- **One canonical HCP identity row per PERSON** in `hcps_v2` (name, NPI, ORCID, institution). Dr. Smith
  is ONE row, no matter how many TAs she appears in. This is what Step C dedup exists to produce.
  NEVER duplicate a person into per-TA HCP rows — that re-introduces the conflation v2 was built to kill.
- **All derived intelligence hangs off her, scoped per-(HCP, TA).** Scores
  (`hcp_established_scores_v2`, `hcp_scores_v2`), TA tags (`hcp_therapeutic_areas_v2`), publication
  links, narratives, collaborator networks — every one carries a `therapeutic_area_id` and is computed
  WITHIN a TA. "Dr. Smith in NSCLC" and "Dr. Smith in Breast" are the SAME identity row with SEPARATE
  per-TA intelligence beneath her.

### The firewall (default) and the Dossier (privileged)
- **Firewall = query-time TA-scoping (RLS / app-layer).** By default, TAs are firewalled from each
  other. In the Breast context, a query returns ONLY Dr. Smith's Breast-tagged intelligence; in NSCLC,
  only NSCLC. Neither leaks into the other's context, even for the same user. A dual-access user
  (e.g. a solid-tumor MSL covering Lung + Breast assets) is granted multiple TA scopes.
- **Unified Investigator Dossier (future, first-class capability).** A privileged view that LIFTS the
  firewall to assemble everything about a person across ALL silos — one unified investigator profile
  spanning every TA they touch. This is only possible BECAUSE identity is a single row: the Dossier is
  just "return all per-TA rows for this `hcp_id`, ignore the silo firewall." Physical per-TA
  partitioning would make the Dossier require error-prone re-matching — another reason the single
  identity row is non-negotiable.

### Why every requirement forces this exact model
Single identity row → (a) makes dedup correct, (b) makes the Unified Investigator Dossier possible.
Per-TA intelligence rows → make the silos real and independently scoped.
Query-time scoping → enforces the firewall by default.
Lift-the-firewall view → the Dossier, enabled *because* identity is unified.
Every piece depends on the single identity row. It is the keystone.

### Consequence for the inventory (resolves the "extension" question)
`openalex_author_inventory` stays **UNIFIED and cross-TA** — one row per author, `corpus_pub_count` =
the author's TOTAL cross-TA career corpus. The inventory is the identity/dedup substrate UPSTREAM of
everything; it is what establishes that lung-shards and breast-shards are one person (the fact the
Dossier depends on). A per-TA inventory would sever that identity linkage — DO NOT partition it per-TA.

**Inventory build = incremental, identity-preserving.** For a new TA: scan its publications to find its
authors. Insert new authors; for authors already present (cross-TA overlap), recompute
`corpus_pub_count` from their FULL cross-TA footprint (read-only across ALL `publications_v2`) rather
than overwriting with the new TA's count alone. Reading other TAs' publications for counting is
PERMITTED (read-only; touches no HCP/scoring rows; safe during a TA freeze). Modifying or rebuilding
other TAs' data is NOT permitted during a freeze — and is not needed.

---

## 0c. AUTHOR IDENTITY RESOLUTION — fragmentation, dedup, and the false-merge invariant (FOUNDATIONAL, added July 7)

The AD build (TA #2) surfaced a problem NSCLC/Hep did not: **author identity fragmentation.** A single
real person is split across multiple `hcps_v2` records because their name was ingested inconsistently.
This is UPSTREAM of scoring and, left unfixed, silently corrupts cohort classification and KOL ranking.
It is worse for international TAs (AD is ~82% non-US) and comparatively mild for US/ASCII-name TAs.

### What fragmentation looks like (the symptom chain)
A KOL-poor established cohort → real KOLs showing single-digit linked pubs → the same person under 2+
records with different OpenAlex author IDs. Worked example: **Emma Guttman-Yassky** was split across a
37-work record and a 764-work record because her surname used two different hyphen characters (ASCII
hyphen U+002D vs Unicode hyphen U+2010) that render identically but don't byte-match. Her real profile
existed in the data — just disconnected from the record the classifier surfaced.

### Root causes (all name-normalization failures)
- **Unicode hyphen variants** (U+2010/2011/2012/2013/2014/2212/00AD vs ASCII '-'): Guttman-Yassky,
  Paz-Ares, Calzavara-Pinton, Neuschwander-Tetri, Dagogo-Jack, Abou-Alfa, El-Serag.
- **Diacritics** (Niccolò/Niccolo, Åke/Ake, Giménez/Gimenez, Gürakar/Gurakar).
- **Initials vs full given name** (Ghassan K. vs Ghassan; Juan A. vs Juan).
- **Duplicate OpenAlex author entities** (OpenAlex itself sometimes has the same person twice with
  identical works_count — Ferrucci 261/261, Katoh 494/494).

### THE INVARIANT — false_split > false_merge (both experts, adopted as code, not philosophy)
A false SPLIT under-credits a KOL (fewer pubs/centrality/authority) — recoverable, honest uncertainty.
A false MERGE fuses two real physicians into one record — corrupts pub counts, coauthor graph,
institution history, Open Payments, scoring — IRREVERSIBLE and often undetectable. **In KOL
intelligence, always prefer to under-credit than to invent a superhuman.** When in doubt, do NOT merge.
Concrete failure mode this guards against: three different "Wei Li"s fused into one monster profile that
ranks #2 destroys trust; leaving Wei Li fragmented at #42/#57/#88 merely hurts recall.

### THE COMMITTED RULE — ambiguity, not geography; corroboration required
High-**ambiguity** names are NOT auto-merged, regardless of origin. This is about name frequency, NOT
country — "John Smith / David Brown" are as unmergeable as "Wei Wang / Jun Li." Both experts and the
NSCLC precedent (2,476 un-merged "Wang" records, ships clean) confirm: **leave common-name records
separate.** They're mostly distinct people; a corroborating signal can't reliably distinguish
same-person-fragmented from two-different-people, so don't try.

**Auto-merge (high-confidence band) requires ALL of:**
1. Identical normalized full name — `name_key(first)` AND `name_key(last)` both match. NEVER surname
   alone (Alexander Leung ≠ Donald Leung ≠ Ting Leung — same surname, different people).
2. Low ambiguity — rare surname (block frequency ≤ ~10 as the current proxy; global rarity is the
   better long-term signal — see below).
3. ≥1 STRONG corroborating signal: `shared_openalex_id` (identical author id) OR `shared_coauthors`
   (≥1 common co-author) OR `same_institution` (both non-empty, equal). **Weak signals that do NOT
   qualify:** `both_have_openalex` (~everyone who publishes has one) and `pub_domain_overlap` (within
   one TA, everyone shares the domain). These are near-universal and mean nothing on their own.

No corroboration → do NOT merge (record as low-evidence for a future review queue). Record a
`merge_reason` on every merge (which signals fired) — these become training data for the eventual
scoring resolver, and give you "why were these merged?" explainability.

### name_key normalization (the fix that makes detection possible)
`name_key(value)` = Unicode NFKC → fold all hyphen variants to '-' → strip diacritics (NFKD, drop
combining marks `category == 'Mn'`) → lowercase → collapse whitespace. Apply to BOTH the blocking key
AND the pair match. Without this, variant-hyphen/diacritic names land in different blocks and are never
even compared. `scripts/dedup/dedup_detect.py` has this now.

### The dedup subsystem — TWO detection paths
`scripts/dedup/dedup_detect.py` (read-only, writes candidate CSV) + `dedup_merge.py` (executes).
- **Stub absorption** (original): a substantive publication record + a thin NPI-only stub of the same
  person. This is what NSCLC/Hep needed; it does NOT catch fragment-vs-fragment.
- **Fragment pairing** (added July 7): two SUBSTANTIVE records of the same person. This is the AD case.
  Requires the corroboration gate above. Emits `candidate_type` = stub|fragment and `merge_reason`.

### Merger correctness requirements (learned the hard way)
- **Survivor = highest OpenAlex `works_count`** (from `hcp_author_metrics_v2`), NOT `total_career_pubs`
  and NOT `is_primary`. Critical because de-inflating `total_career_pubs` from linked-pub counts
  INVERTS the signal for fragments (Guttman-Yassky's real 764-work record had only 2 LINKED pubs → a
  naive pub-count survivor would keep the 37-work fragment and destroy the real profile). Log
  `[SURVIVOR SWAP]` when the CSV primary loses.
- **Transitive clusters** — a person split 3+ ways (Werfel: 513/365/74/48) must fold ALL into the ONE
  highest-works survivor via union-find components, not pairwise (pairwise can merge two non-survivors
  or double-merge). Track already-merged ids; assert survivor/merged-away overlap == 0.
- **Re-point ALL FKs to `hcps_v2.id`.** There are ~39 of them. The merger initially handled only 22 →
  merges failed on the missing ones (and would have orphaned score/rank rows —
  `hcp_established_ranks_v3`, `hcp_score_ranks_v2`, `hcp_network_centrality_v2`,
  `hcp_publication_leadership_v2`, `hcp_pharma_engagement_v2`, `hcp_author_metrics_v2`, and
  `hcp_top_collaborators_v2` which references hcps_v2 via BOTH `hcp_id` AND `collaborator_hcp_id`).
  Before running the merger for a new TA, AUDIT all FKs to hcps_v2.id (`pg_constraint`, contype='f')
  and confirm every one is in the re-point list. Each conflict-delete must target the table's ACTUAL
  pk/unique constraint.

### SEQUENCE — dedup BEFORE de-inflation (order matters)
De-inflating `total_career_pubs` from the join table BEFORE dedup harms fragmented KOLs (sets their
count to a fragment's sliver). Correct order: **dedup/merge identities FIRST → THEN re-derive
`total_career_pubs` and `career_first_pub_year_v2` on the merged identities → THEN classify.** Any
career-metric derivation must run downstream of identity resolution.

### The SEPARATE problem dedup does NOT fix: publication under-linkage
Merging fixes IDENTITY (one record, pointing at the rich OpenAlex author profile). It does NOT fix a
thin publication corpus. Guttman-Yassky post-merge still showed ~8 LINKED pubs vs. her OpenAlex
works_count of 764 — because her actual publications were never ingested/linked into
`publication_authors_v2`. If establishment/ranking reads `total_career_pubs` (linked) rather than
OpenAlex `works_count` (rich), a merged KOL can still look thin. Decide per build: use OpenAlex
works_count as an establishment signal, or complete publication linkage. Keep these two problems
(identity vs. corpus linkage) mentally separate.

### The future (committed next-leg, NOT built yet)
Both experts recommend treating identity resolution as its OWN subsystem: **blocking → evidence scoring
(ORCID +100 / OpenAlex-author +100 / same institution / shared coauthors / career continuity / GLOBAL
surname rarity — not TA-cohort frequency, which drifts as you ingest more TAs) → decision bands
(high→auto-merge, medium→review queue, low→leave split).** Add an `identity_status` field per HCP
(resolved / high_confidence / ambiguous / fragmented / reviewed) so uncertainty has somewhere to live.
Today's rule-based high-confidence merge is deliberately the strict high-confidence subset of that
future system — not a throwaway. Note: ORCID/OpenAlex clustering improves over time, so some impossible
merges today become trivial later — another reason not to force them now.

---

## 0d. TA-ANCHORED ESTABLISHMENT — "established in a TA" requires real TA output (added July 8)

Establishment must NOT be decided on a global career alone. The AD build found the established cohort polluted
by cross-TA passengers — hepatologists with 30-year liver careers and ZERO AD publications, qualifying via a
global `career_age > 10` rule. They are not AD KOLs and must not appear in AD's established cohort.

**The rule:** `established = (ta_pubs >= TA_ESTABLISHED_MIN_PUBS) AND (existing career-based rule)`.
  - `ta_pubs` = the HCP's TA-specific publication count (COUNT from publication_authors_v2 JOIN
    publication_therapeutic_areas_v2, scoped to the TA). Requires corpus linkage to be complete first (§0c).
  - `TA_ESTABLISHED_MIN_PUBS = 5` (tunable; verify no real KOL sits below it — for AD the lowest real KOL had 8).
  - Career rule (unchanged): total_career_pubs>=500 OR (>=200 AND first_pub_year<2020) OR career_age>10.
  - HCPs meeting the career rule but with ta_pubs < threshold route to COMMUNITY (present in the TA, but not a
    KOL) — not deleted. Record `ta_pubs` in cohort_reason for auditability.

**Effect on AD:** established dropped from 9,449 (59%, polluted) to 2,547 (16%, a credible KOL tier). Every
hepatologist -> community; every real AD KOL retained. This should be STANDARD for every TA.

---

## 0z. TWO INGEST SCRIPTS - READ BEFORE SECTION 1 (added 2026-07-23)

This playbook documents `ingest_publications.py` as the canonical ingester. **The orchestrator
(`reingest_cycle.py`, stage 1) calls a DIFFERENT script: `pubmed_pipeline.py`.** They now do the same job
but read their query from DIFFERENT places:

| | canonical per this playbook | what the orchestrator runs |
|---|---|---|
| script | `scripts/ingest/ingest_publications.py` | `scripts/ingest/pubmed_pipeline.py` |
| query source | `therapeutic_area_ingestion_config.pubmed_query` (DB table) | `config/therapeutic_areas/<slug>.json` |

**Consequence for a new TA:** authoring the query ONLY in the DB config table (as section 2a instructs) is
NOT enough if you intend to run the weekly orchestrator - `pubmed_pipeline.py` will look for a JSON config
and not find your query. **Populate BOTH** until the two are reconciled, and verify with
`python scripts/reingest_cycle.py --ta <slug> --dry-run` before a real run.

**Behavioural convergence (2026-07-23):** `pubmed_pipeline.py` was refactored to be publications-only - it
no longer mints HCPs, no longer gates publication persistence on author resolution, and now populates
`pub_date` + `pubmed_authorships`. It therefore now matches the section-1 architectural rule this playbook
already stated for `ingest_publications.py`. (Before that refactor it created HCPs from PubMed names, whose
`identity_hash` collided with `create_hcps_v2`'s OpenAlex-derived one - that mismatch silently dropped ~94%
of publications on any checkpoint-resumed run.)

**Open debt:** decide which ingester is canonical and retire or reconcile the other, including the config
source. Until then, treat section 1 step 1 as "whichever ingester you run - it must be publications-only,
and its query must be reachable from the config source THAT script reads."

---

## 1. The canonical pipeline order (v2)

HCP identity is resolved **OpenAlex-first**, AFTER publication ingestion. Publication ingestion does
NOT create HCP rows. This is the single most important architectural rule in v2.

```
1.  ingest_publications.py --ta <slug> --target-version v2
        → publications only. Writes pubmed_authorships (JSONB). NO HCP creation.
        → tags source_therapeutic_area_id + parent TA (hierarchy) from the ESearch PMID set.
2.  openalex_pipeline.py --target-version v2
        → DOI enrichment → populates publications_v2.authorships (the durable asset Step C reads).
3.  inventory_openalex_authors.py --target-version v2  [see §3 on --truncate vs incremental]
        → builds openalex_author_inventory from authorships. Threshold: --min-pubs (default 3).
4.  run_step_c_create_hcps.py --target-version v2 --dry-run --limit 20   (then real)
        → creates HCPs from inventory clusters, OpenAlex-first, deduped. Does NOT tag TAs.
5.  career_enrichment_from_clusters.py --target-version v2
        → first_pub_year / total_career_pubs.
6.  ta_tagging_rebuild.py   ⚠️ VERIFY THIS EXISTS — see TA_BUILD_DEBT §4. May be unwritten.
        → assigns TA tags to HCPs from publication evidence (≥3 pubs/TA).
7.  run_step_b_matching.py --target-version v2
        → ONLY for Workstream B (NPPES community) HCPs needing linkage, AFTER Step C.
8.  reconcile_step_c_duplicates_diagnostic.py → reconcile_step_c_duplicates_apply.py
        → merges duplicate HCPs Step C's clustering missed (multi-shard authors).
9.  rebuild_publication_authors_v2.py (Step F) — links pubs to HCPs.
        ⚠️ CANONICAL INVOCATION: scope to ALL HCPs tagged to the TA, NOT just newly-created ones.
        Export all TA hcp_ids (SELECT hcp_id FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id=<TA>)
        to a file, then run with --hcp-ids-file <file> --execute.
        DO NOT use --only-new-hcps: it links only HCPs created in this run, leaving PRE-EXISTING cross-TA
        HCPs (who also work in the new TA) UNDER-LINKED. This silently buried ~34% of AD's established cohort
        (864 KOLs with big careers but <20 linked pubs, e.g. Guttman-Yassky at 6 links) — see debt §29o-29q.
        Frozen-safe by construction: the script provably writes links only for scoped HCPs, only to pubs their
        own OpenAlex IDs appear on — it cannot touch another TA's links.
9b. Derive authorship position (is_first_author/is_senior_author) into publication_authors_v2 from the OpenAlex
        authorships JSON (author_position first/middle/last). REQUIRED — the scientific scorer's senior/first
        signals are all-zero (dead) without this. See debt §29m. Run right after Step F.
10. NPPES / Open Payments / Medicare aggregators (--target-version v2)
10b. IDENTITY RESOLUTION (dedup) — REQUIRED, esp. for international TAs. See §0c.
        dedup_detect.py (read-only → candidate CSV) → review high-confidence fragment set →
        dedup_merge.py --dry-run → --execute. Merge BEFORE deriving career metrics.
11. career-metric re-derivation ON MERGED identities: total_career_pubs (join-table COUNT, --ta) +
        career_first_pub_year_v2 (sustained-onset method). MUST run after 10b, not before.
11b. cohort_classification_v2.py --ta <slug> --execute → hcp_cohort_classification_v2 (career-based:
        established / rising_eligible / too_young / community). CLASSIFY before cohort-scoring.
12. scoring_pipeline.py (rising) + publication_leadership/network/pharma (established) + community
13. generate_narratives_v2.py --target-version v2   (⚠️ --target-version v2 REQUIRED — default writes v1)
14. Frontend cutover / TA enablement (is_visible_in_ui).
```

Runtime notes: inventory ~30 min; Step C ~1–2 h; career enrichment ~6 h. Plan a long window.

---

## 2. Authoring the retrieval query (the make-or-break artifact)

### 2a. Where it lives
The **canonical** `scripts/ingest/ingest_publications.py` reads its query from the
`therapeutic_area_ingestion_config` **database table** (`pubmed_query` column), resolved by TA slug.
It does NOT read the `config/therapeutic_areas/*.json` files — those were the detour's path. Put the
query in a config-table row (see §2e).

### 2b. Structure — tiers (retrieval = Tiers 1–3 only)
- **Tier 1 — Canonical disease.** MeSH disease anchor + primary disease name(s). ALWAYS retrieve.
- **Tier 2 — Historical synonyms.** e.g. for AD: Besnier prurigo, neurodermatitis variants.
- **Tier 3 — Disease variants.** Age (infantile/pediatric/adult-onset/late-onset), severity
  (moderate-to-severe/severe/refractory/chronic), spelling (British/American), common misspellings,
  and tight logical expansions like `(atopic AND dermatitis)`.
- **Tier 4 — Mechanisms** (IL-4, IL-13, IL-31, TSLP, filaggrin, Th2 ...): **DO NOT SEARCH.**
  → enrichment tags, extracted post-ingestion.
- **Tier 5 — Drugs** (dupilumab, tralokinumab, baricitinib, upadacitinib ...): **DO NOT SEARCH.**
  → enrichment tags. Removing bare drugs does NOT cost recall — a drug-in-disease paper contains the
  disease term and is caught by the anchor (validated: dupilumab-in-AD papers still returned 2,621).

### 2c. The "eczema-style fallback" pattern (recall without noise)
For diseases with a broad common term (eczema), don't use it bare. Anchor it:
```
(eczema[tiab] AND (atopic OR infantile OR childhood OR pediatric OR paediatric OR chronic))
```
This captures disease papers titled with only the broad term while excluding sibling conditions
(contact/seborrheic/nummular/dyshidrotic eczema).

### 2d. Validation gates — run ALL before ingesting (none write data)
1. **Count check.** Single ESearch, `retmax=0`, over the TA's date range. Sanity-check magnitude.
   (AD: 24,318 distinct — a large-but-clean disease literature. "Big" is not "contaminated"; verify which.)
2. **Decomposition.** Remove the broad clauses; confirm the disease core dominates the volume.
   (AD: core disease terms alone = 22,486 of 24,318 → 92% from unambiguous disease terms = clean.)
3. **Contamination-shed test (behavioral — the real proof).** Confirm specific KNOWN papers resolve
   correctly: known cross-indication contaminants EXCLUDED, known in-disease papers INCLUDED,
   validation-target KOL papers INCLUDED. Use `term = (<query>) AND <probe>` → count 0 or N.
   (AD results: dupilumab-in-asthma ProVENT = 0 ✓; dupilumab caught = 2,621 ✓;
    Guttman-Yassky = 361 ✓; baricitinib+RA slice = 40, mostly legit cross-indication AD reviews ✓.)
4. **Windowed-sum reconciliation.** The ingester sums per-window ESearch counts (NOT deduped), so its
   "PMIDs found" will exceed the true distinct count. Reproduce the windowed sum of YOUR query to
   confirm the ingester's number = windowing artifact, not query broadening.
   (AD: script "found 33,771"; windowed sum of our query = 33,771 exactly → confirmed benign;
    real insert dedups to ~24,318 via the per-batch existence check.)

### 2e. Config-table row — set these explicitly
```sql
INSERT INTO therapeutic_area_ingestion_config
  (therapeutic_area_id, pubmed_query, pubmed_days_back, pubmed_max_results, is_active, is_visible_in_ui)
VALUES ('<TA_UUID>', '<validated query>', 3650, 60000, true, true);
```
- `pubmed_days_back = 3650` (10 yr — matches Hep/NSCLC; the COLUMN DEFAULT is 1460 = 4 yr, wrong for us).
- `pubmed_max_results` = a ceiling comfortably above the validated count (AD used 60000 for a ~24K corpus).
- ⚠️ The other columns (`openalex_concept_ids`, `openalex_min_works_count`, `nppes_taxonomy_codes`,
  `ctgov_condition_filters`, `scoring_weights`, `indication_keyword_filters`) are the REST of the TA
  contract and are needed by LATER stages. Author them before those stages run — see TA_BUILD_DEBT §5.

### 2f. Query-optimization procedure (advisor-endorsed; do during the ontology+compiler pass)
For every clause: remove it → re-run count → record unique PMIDs lost → keep only if it earns its place
(meaningful unique recall OR an important naming convention). AD's query can likely compress from ~30
clauses to ~15–18 with negligible recall loss (suspected zero-contributors in a 10-yr window:
`constitutional eczema`, `Besnier prurigo`). This is evidence-based query tuning; make it a compiler feature.

---

## 2g. CONCEPT-TAGGING CURATION DOCTRINE (`curated_ta_concepts`)

`ta_tagging_rebuild_v2.py` assigns HCPs to a TA by scoring their publications' OpenAlex concepts
against a curated per-TA concept set (`curated_ta_concepts`), with `CONCEPT_SCORE_THRESHOLD = 0.4`
(a concept is ignored on a paper if its OpenAlex score < 0.4), `WEIGHTED_RELEVANT_THRESHOLD = 5.0`,
`FRACTION_THRESHOLD = 0.30`, and recency weighting. A paper needs SEVERAL concepts to fire to clear
the bar — so an individually-generic concept (keratinocyte) can't tag a paper alone; it only
contributes alongside AD-specific concepts.

### The core distinction (do not conflate these three layers)
- **Disease ontology** = biological truth. What the disease *is* (IL-4/IL-13 ARE core AD cytokines).
- **Tagging feature set** (`curated_ta_concepts`) = the OPTIMIZED VOCABULARY FOR THE CURRENT CLASSIFIER.
  A concept belongs here only if it is BOTH disease-relevant AND empirically useful for tagging under
  the current OpenAlex-concept-scoring mechanics. It is NOT the disease ontology.
- **Enrichment ontology** = scientific characterization ("which AD KOLs work on IL-13"). Mechanisms,
  cytokines, drugs, biomarkers live here regardless of tagging utility, extracted from paper content.

### The three-status model — every ontology concept gets a status
- **Tagging** — disease-relevant AND empirically effective → goes in `curated_ta_concepts`.
- **Enrichment** — characterizes the science but not a disease-identity tag (drugs, mechanisms) → enrichment ontology.
- **Dormant** — biologically core but currently INEFFECTIVE for tagging (OpenAlex scores it weak/rare).
  Retained in the ontology with status=Dormant; excluded from tagging; revisit when the classifier
  changes (e.g. embeddings / LLM concept extraction). Prevents both conceptual debt ("why is this
  useless concept in the tagging set?") and recall debt ("we lost IL-4 and forgot it mattered").

### Curation procedure (empirical, allowlist-first)
1. **Rank** OpenAlex concepts by frequency across the clean corpus, at score ≥ 0.4, level ≥ 2
   (`jsonb_array_elements` over `openalex_concepts`).
2. **Allowlist-curate** — deliberately ACCEPT disease-specific concepts. Use OpenAlex to SUGGEST, never
   to auto-accept. Prefer a curated allowlist over trusting automatic extraction.
3. **Denylist** recurring semantic collisions — OpenAlex maps "Type 2" to *any* "type 2" string
   (Type 2 diabetes, Cannabinoid receptor type 2, Activin type 2 receptors) instead of the intended
   "Type 2 inflammation." Maintain a small denylist for these.
4. **Verify effectiveness via DISTRIBUTION, not mean.** A concept's mean score can hide a useful
   high-confidence tail — OR hide that a decent mean is all weak. Check `COUNT(*) FILTER (score>=0.6/0.8)`.
   (AD worked example: IL-4 mean 0.395, but distribution showed 81 above 0.4, only 2 above 0.6, 0 above
   0.8 → confirmed Dormant, not just "low mean." IL-13: 46 above 0.4, 5 above 0.6, 0 above 0.8, on 0.2%
   of papers → Dormant. Neither is discarded; both are enrichment-ontology + Dormant-for-tagging.)
5. **Reject** other diseases (they're diseases in their own right, not diagnostic concepts): for AD,
   Asthma, Allergy, Food allergy, Contact dermatitis, Psoriasis, Acne, Alopecia areata. And OpenAlex
   junk (Variation-astronomy, Seasonality, Context-archaeology, Epidermis-zoology).
6. **Target ~30-50 concepts** (Hep 46, NSCLC 37, AD 23), all level ≥ 2.

### Tuning philosophy: membership stable, weights are the knob
Treat the concept LIST as relatively stable; treat WEIGHTS as the tuning surface. It's easier and safer
to lower keratinocyte's influence 1.0→0.5 than to remove it and later discover lost recall in
mechanistic papers. Biggest gains after the first tagging run come from weight calibration on REAL
true/false positives — not from pre-guessing membership. (Requires the two enhancements in
TA_BUILD_DEBT §9: per-concept weights + matched-concept observability.) Optimize for the classifier you
HAVE; do not design the ontology for a speculative future pipeline.

### AD worked example — 23 tagging concepts (tiered by diagnostic strength)
- **Tier 1 (diagnostic):** Atopic dermatitis, Atopy, EASI, SCORAD, DLQI, Dupilumab, Filaggrin, TSLP,
  Skin barrier, Transepidermal water loss, Immunoglobulin E, Sensitization.
- **Tier 2 (strong biology):** Janus kinase, Eosinophil, Staphylococcus aureus, Dysbiosis, Microbiome,
  Chemokine, Proinflammatory cytokine.
- **Tier 3 (weak/supporting, low future weight):** Keratinocyte, Stratum corneum, Itching, Erythema.
- **Dormant (ontology, not tagging):** IL-4, IL-13, IL-31, Type 2 inflammation, HaCaT.
- **Enrichment ontology (not tagging):** all drugs (dupilumab is BOTH — a strong tagging concept AND an
  enrichment tag), cytokines, pathways.

---

## 3. Global vs US, and the inventory `--truncate` question

- **Ingest globally; surface US-first; let users opt into international.** Retrieval carries no
  affiliation filter (keeps international KOLs — Thaci/DE, Bissonnette/CA, Deleuran/DK). Geographic
  scoping is a presentation/filter concern, never a retrieval one.
- **Inventory is TA-agnostic and global.** `inventory_openalex_authors.py` scans ALL of
  `publications_v2` (no TA filter). `--truncate` wipes and rebuilds the whole inventory (all TAs).
  - This is a **foundational, all-TA, destructive** op — NOT a per-TA one. Do not `--truncate`-rebuild
    the world every time you add a TA, especially if another TA is under review/frozen.
  - The right long-term operation is **incremental inventory update** for just the new TA's authors —
    but the script can't do that yet, and a naive incremental upsert would CLOBBER cross-TA authors'
    `corpus_pub_count` (an AD-only scan sees only AD pubs). See TA_BUILD_DEBT §6.
  - Before any `--truncate`: snapshot the inventory (`CREATE TABLE openalex_author_inventory_backup AS ...`).

---

## 4. Non-negotiable operating discipline (learned the hard way this session)

1. **Read the actual script/schema before running or proposing anything.** Every failure this session
   traced to acting on an assumption about what a script did or what a table contained.
2. **Verify every state claim with SQL — including claims in handoff docs.** The AD handoff's
   "zero OpenAlex linkage" was actually 172 real HCPs; a blind delete would have destroyed them.
3. **Verify schema column names via `information_schema` before writing any query.** (Two authoritative
   docs disagreed on `hcp_therapeutic_areas_v2` vs `hcps_therapeutic_areas_v2`; the DB settled it.)
4. **Inspect JSONB structure before parsing it.** OpenAlex author id is nested at
   `authorships[i].author.id` (a URL), NOT a flat `author_id`. Assuming flat = silent empty result.
5. **Snapshot before any delete. Trace FKs before any delete. Dry-run the predicate as a COUNT first.**
6. **Materialize a frozen, indexed delete-list**, then delete against it. Never re-derive the target
   set per batch (slow, and can drift). Double-guard predicates (e.g. TA-tag AND date) so a shifted
   assumption still can't hit protected rows.
7. **Delete child-first, batched, over the direct `run_sql.py` connection** — not the dashboard.
   The dashboard (`api.supabase.com`) has a short HTTP timeout that rolls back large deletes; the
   direct psycopg connection honors `SET statement_timeout` and completes.
8. **A surprising number is a thread to pull, not a nuisance to dismiss.** "21,779 authors in both
   AD and NSCLC" was outlandish → pulling it uncovered the entire corpus contamination.
9. **One step at a time. Verify it worked. Then the next.** Fail-fast beats a long plan built on a
   wrong assumption.

---

## 5. Validation targets (AD) — the acceptance test for the build
Once AD is scored, these should surface as top AD Established. If Guttman-Yassky is not top-ranked AD
Established, something upstream is wrong:
Emma Guttman-Yassky, Jonathan Silverberg, Eric Simpson, Lawrence Eichenfield, Amy Paller,
Andrew Blauvelt, Robert Bissonnette, Diamant Thaci, Mette Deleuran.

---

## 6. Automation horizon (the "holy grail")
Target end-state: a few scripts that run the whole pipeline (SQL builds → ingest → enrich → create →
dedup → score → narrate) for a TA from its config row. That is this playbook with the human removed.
It requires three things the platform doesn't yet fully have — each is a `TA_BUILD_DEBT.md` theme:

1. **Parameterization** — every per-TA script takes `--ta` + reads the config row; nothing hardcoded.
2. **Idempotency + resumability** at every stage — so an unattended run survives a failed step.
3. **Verification gates as code** — the "must read 172/0/172"-style checks become assertions that halt
   the pipeline on failure. *Automation without gates is not automation; it is an unattended way to
   corrupt the database faster.* (This session built 191,551 wrong HCPs the manual way; the automated
   way would do it at 3am with no one watching.)

Sequence to get there safely: **manual-verified (now) → parameterized/config-driven → gated → orchestrated.**
Retire debt items → the orchestrator becomes writable.

---

## 3b. CANONICAL INCREMENTAL INVENTORY BUILD (worked & verified, AD, July 3)

The `inventory_openalex_authors.py` script only does global `--truncate` rebuild (touches frozen TAs,
and its AD-scoped upsert would CLOBBER cross-TA counts). REPLACED by this SQL-native staged method,
which is the canonical approach for every TA. It is incremental, cross-TA-count-correct, and touches
zero rows outside the new TA's authors.

**Stage 1 — flatten authorships to an indexed table (one-time, reused by Step C too):**
```sql
CREATE TABLE author_pub_flat AS
SELECT auth->'author'->>'id' AS author_id, p.id AS pub_id, p.pub_year,
       p.source_therapeutic_area_id AS source_ta_id,
       auth->'author'->>'display_name' AS display_name,
       COALESCE(auth->'author'->>'orcid', auth->>'raw_orcid') AS orcid,
       auth->'institutions'->0->>'display_name' AS institution,
       auth->'institutions'->0->>'ror' AS institution_ror
FROM publications_v2 p, jsonb_array_elements(p.authorships) auth
WHERE p.authorships IS NOT NULL AND jsonb_typeof(p.authorships)='array'
  AND auth->'author'->>'id' IS NOT NULL;
CREATE INDEX idx_author_pub_flat_author ON author_pub_flat(author_id);
CREATE INDEX idx_author_pub_flat_source_ta ON author_pub_flat(source_ta_id);
```
(AD run: 3,168,001 appearances, 1,231,741 distinct authors, 403,596 enriched pubs.)

**Stage 2 — aggregate FULL corpus, scope write to the new TA's authors, upsert preserving counts:**
- `corpus_pub_count` = COUNT over the author's FULL flat footprint (all TAs) → cross-TA-correct, no clobber.
- Scope the WRITE to authors appearing in the new TA (`source_ta_id = <TA>`), `HAVING count >= 3`.
- `INSERT ... ON CONFLICT (openalex_author_id) DO UPDATE` — insert new, update existing to full count.
- Do NOT update `has_matching_hcp`/`matching_hcp_id` in the DO UPDATE (preserve any Step B/C linkage).
- Descriptive fields via `MODE() WITHIN GROUP` (most-frequent name/institution/ror/orcid per author).
- (AD run: 21,014 written = 7,309 cross-TA updates + 13,705 new inserts; inventory 239,306 → 253,011.)

**Discipline:** snapshot inventory first (`..._pre_<ta>_backup`); dry-run the scope as a COUNT before
writing; run WRITES via terminal `run_sql.py` (not dashboard); use dashboard for read-only SELECTs where
you need to SEE results (`run_sql.py --file` reports SELECTs poorly — returns "OK: -1 rows affected").

**Tool-split rule:** terminal `run_sql.py` for writes/long ops; dashboard for read-only SELECTs needing
visible results. `SET statement_timeout` only applies on the direct (terminal) connection.

---

## MULTI-TA SCRIPT STANDARD (added July 6 — the contract every pipeline script must meet)

Discovered during AD (TA #2): NONE of the original scripts were built for multi-TA. Each has needed the
same retrofit. This is the STANDARD every TA-pipeline script must meet before it is safe to run for a
new TA. When a script fails this, fix it TO STANDARD (permanent), do not one-off patch it.

**The contract:**
1. **TA scoping.** A `--ta <slug>` flag (and/or `--ingestion-run-id`) that scopes the ENTIRE operation
   to one TA. Must REFUSE to run unscoped (v2). No hardcoded TARGET_TA_IDS lists.
2. **Frozen-TA safety.** Must be PROVABLY incapable of writing/updating/deleting rows for any TA outside
   scope. Pattern: filter-at-source + candidate filter + write guard + post-load assertion. Trace the
   data flow and confirm no out-of-scope write path exists. (NSCLC is frozen under advisor review.)
3. **v2 schema correctness.** Reference only columns that exist on the v2 tables. Common landmines:
   `derived_state`/`openalex_author_id` do NOT exist on hcps_v2; OpenAlex link is via
   hcp_openalex_authors_v2; TA membership is via hcp_therapeutic_areas_v2 (no ta_id on hcps_v2).
4. **--target-version v2** routing (get_table_name pattern).
5. **--dry-run default or available**, writes nothing in dry mode.
6. **Idempotency.** Re-runnable safely (ON CONFLICT DO NOTHING/UPDATE, or IS NULL / enriched_at scoping).
7. **.env from project root** (load_dotenv() root-search, not script-dir).
8. **ASCII-only Python; PowerShell files UTF-8 no BOM.**

**Retrofit ledger (which scripts meet the standard):**
  - create_hcps_v2.py (Step C) ......................... ✓ (rewritten)
  - rebuild_publication_authors_v2.py (Step F) ......... ✓ (rewritten)
  - ta_tagging_rebuild_v2.py ........................... ✓ (--ta added)
  - targeted_nppes_enrichment.py ...................... ✓ (retrofitted; .env-path minor pending)
  - recompute_established_ranks_v3.py ................. ✓ (already had --ta; verify NSCLC-safe on use)
  - scoring_pipeline.py (rising cohort) ............... ✓ (July 7: --ta scoping + write-scope assert +
        LOAD-scoping to TA hcp_ids + pagination-guard fix [empty-batch terminator, not offset-vs-count bail])
  - cohort_classification_v2.py (NEW, July 7) ........ ✓ (career-based cohort assignment -> the per-TA
        table hcp_cohort_classification_v2; --ta/--dry-run/--execute + write-scope assert)
  - dedup_detect.py .................................. ✓ (July 7: Unicode name_key + fragment path +
        rarity gate + STRONG-corroboration requirement + merge_reason; read-only)
  - dedup_merge.py ................................... ✓ (July 7: works_count survivor + union-find
        transitive clusters + already-merged tracking + all 39 hcps_v2 FKs re-pointed)
  - publication_leadership_scoring.py ................. ✓ (verified July 7: fully TA-scoped via ta_pubs CTE;
        BUT reads established set from hcp_established_ranks_v2 — needs wiring to hcp_cohort_classification_v2)
  - network_centrality_scoring.py .................... ✗ PENDING
  - pharma_engagement_scoring.py ..................... ✗ PENDING
  - open_payments_aggregator.py / open_payments_filter.py ✗ PENDING
  - [state-derivation script — see below] ............ ✗ TO BUILD/PORT from v1

This ledger IS the agent-team's "what's ready" map. Keep it current as scripts are retrofitted.

---

## PIPELINE ADDITIONS (July 6 — steps discovered during AD, missing from original §1 order)

Two steps belong in the canonical pipeline between tagging and scoring, both learned the hard way on AD:

### STATE DERIVATION (before NPPES) — NEW required step for publication-derived HCPs
Publication-derived HCPs have country but no US state (state normally comes FROM NPPES -> chicken/egg).
NPPES name->NPI matching needs a state to disambiguate. So BEFORE NPPES:
  - Derive `derived_state` (or feed state to matcher) from institution via `staging_us_institution_to_state`
    (institution_normalized -> state).
  - **The mapping is TA-dependent** (seeded from oncology/hep). Each new clinical domain brings clinical
    institutions it lacks -> EXTEND the mapping with the new TA's clinical centers first. (AD needed
    GWU->DC, National Jewish->CO, Rochester, Children's Colorado, etc.)
  - Industry/NIH institutions correctly stay unmapped (they're not clinical; see debt #15).
  - (v1 hcps had derived_state/institution_state columns; v2 hcps_v2 does not — port this step to v2.)

### INDUSTRY/NIH HCP HANDLING (during/before NPPES)
Industry/basic-science HCPs (pharma cos, NIH, Rockefeller, etc.): KEEP in population + cohort-classify
(they have real scientific/network signal), but do NOT NPPES-match (not clinicians; pharma legitimately
null). Exclude from NPPES scope. (Reconstructed from NSCLC behavior — see debt #15.)

### ESTABLISHED SCORING SUB-PIPELINE (rewritten July 8 after the AD build — supersedes the old 50/35/15 model)

**Pipeline order (Rising/Community are parallel chains, still TBD):**
  0. IDENTITY RESOLUTION (dedup) must be complete first — see §0c. Scoring on fragmented identities is wrong.
  1. cohort_classification_v2.py --ta <slug> -> hcp_cohort_classification_v2 (TA-ANCHORED establishment; §0d)
  2. Derive authorship position (is_first/is_senior) from OpenAlex authorships JSON into publication_authors_v2
     (REQUIRED — the scorer's senior/first signals are dead without it; see §0c). Also complete corpus linkage.
  3. publication_leadership_scoring.py --ta <slug> -> hcp_publication_leadership_v2 (SCIENTIFIC AUTHORITY)
  4. network_centrality_scoring.py --ta <slug> -> hcp_network_centrality_v2 '10yr' (NETWORK INFLUENCE)
  5. pharma_engagement_scoring.py --ta <slug> -> hcp_pharma_engagement_v2 (COMMERCIAL ENGAGEMENT — displayed)
  6. recompute_established_ranks_v3.py --ta <slug> --w-scientific 0.75 --w-network 0.25 --w-pharma 0.0
     -> hcp_established_ranks_v3 (composite -> frontend). Each scorer reads the established set from
     hcp_cohort_classification_v2 WHERE cohort='established' (NOT the old hcp_established_ranks_v2).

### SCORING DOCTRINE (the load-bearing decisions from the AD build — advisor-validated)

**TWO AXES, not one score. Concepts are TA-INDEPENDENT.**
  - SCIENTIFIC/CLINICAL AUTHORITY (the rank): publications, authorship position, citations, guideline/consensus
    authorship, network. Answers "who CHANGED the field?" — stable, slow-moving.
  - COMMERCIAL ENGAGEMENT (displayed, NOT ranked): Open Payments, companies, drugs, advisory. Answers "who is
    engaged with industry?" — different axis. NEVER fold commercial into the KOL rank.
  The concepts stay constant across every TA. This is why the model generalizes without per-TA weight hacks.

**Nimbleness lives at the DATA-AVAILABILITY layer, not the concept layer** (see debt §29ae). Don't hand-tune
  weights per TA. Instead: assess per-TA which signals have trustworthy coverage; RANK on signals whose data
  supports the whole cohort fairly; DISPLAY (don't rank on) signals with structural coverage gaps.
  - Pharma: US-only (Open Payments). For an intl-heavy TA (AD is 73% intl, ~11% pharma coverage) -> weight 0,
    display only. For a US-centric TA it MAY be defensible to weight — assess coverage first.
  - Trial leadership: strong concept BUT gated on investigator->HCP match quality. ct.gov gives clean roles
    (PI/chair/director) but matching fails on prominent KOLs (no ORCID/OpenAlex bridge id). DEFERRED until a
    real investigator-resolution effort. Do not add it to the rank on the current match quality.
  - Prestige signals (guideline/consensus/editorial/review) are IN PubMed (publication_types), internationally
    uniform, and ALREADY the highest-weighted signals in the scientific score (guideline-senior = 15x a normal
    senior pub). Lean on these, not on registry-dependent signals.

**Composite weights: 0.75 scientific / 0.25 network** (advisor). Rationale: authority is stable (persists if
  someone stops collaborating); network is contextual (rewards collaboration structure — inflates for
  consortium-heavy cultures, e.g. European multicenter groups). Authority deserves the heavier weight. Do NOT
  tune the network algorithm; only its relative weight needed recalibration. The composite reweights per-HCP:
  a missing signal is dropped and remaining weights renormalize (sum-of-present-weights) — NOT scored 0.

**VALIDATE, don't tune** (the key discipline): the acceptance test is "does the ranking naturally RECOVER the
  known KOLs?" — hand the top-20 to a domain Head of Medical Affairs; do they nod? If it recovers the reference
  names, STOP tuning (further tweaking overfits to one TA). AD reference list: Silverberg, Simpson,
  Guttman-Yassky, Wollenberg, Weidinger, Flohr, Eichenfield, Bieber. Build a reference KOL list per TA.

**CALIBRATION GOTCHA (cost us hours — check this):** percentile columns must be DOUBLE PRECISION / NUMERIC,
  never INTEGER. An integer percentile_rank column silently rounds continuous percentiles, tying the entire
  top ~1% at 100, which collapses scientific discrimination and lets network dominate the composite at the top.
  Also use the CONTINUOUS percentile formula 100*(1-pos/(n-1)), not integer-floored 100-int(pos*100/n). All
  three component scorers must use the same continuous form. Bake double-precision into the table DDL.

**Display normalization:** show percentile ("99th percentile") or a robust rank-preserving transform, NOT
  min-max (min-max lets one outlier — e.g. Silverberg — rescale everyone; every future superstar shifts all
  displayed scores). Ranking already uses percentile; this is a display-layer fix (still TODO).

## MULTI-TA STANDARD — ADDENDUM (July 6): --dry-run is MANDATORY; never write on first run
Learned the hard way: trials_pipeline.py had no --dry-run, and a "--limit 5 test" WROTE 30 trials + 1,723
investigator records before its matching behavior was validated. RULE: every pipeline/enrichment/scoring
script MUST have a --dry-run that computes and prints but writes NOTHING. Any script lacking one gets a
--dry-run ADDED (Cursor) BEFORE its first execution against a TA. First run of any script is ALWAYS
--dry-run. Validate against a known KOL (e.g. Silverberg for AD) in the dry-run before executing.
Add to the 8-point contract as point 9.

---

# PART II — FRONTEND REPOINT & ENRICHMENT (added July 10, after the AD Established frontend+enrichment build)

Part I above gets a TA *built* in the database (ingested, deduped, scored → `hcp_established_ranks_v3`).
Part II gets it to *appear correctly in the product* (frontend repoint) and *look as complete as the
frozen reference TA* (enrichment layer). These are the two halves nobody documented before AD #2.

**Mental model for Part II:** there is always a FROZEN REFERENCE TA (for AD it was NSCLC) that already
works end-to-end. Every step in Part II is "make the new TA do what the reference TA already does,
WITHOUT changing the reference TA's behavior byte-for-byte." The reference TA is both your template
and your regression oracle.

---

## 7. FRONTEND REPOINT — making a built TA appear correctly

### 7a. The foundational insight: cohort data flows through RPCs, not table names
The frontend does NOT query tables by name. Cohort feeds flow through Postgres RPCs
(`get_established_filtered`, `get_rising_star_filtered`, `get_community_filtered`) that take a `p_ta_id`.
So a "repoint" is mostly a **data-function / parameter-threading** job, not a table-rename job. Trace the
actual data flow before assuming anything — the wiring is rarely what the UI suggests.

### 7b. TA-as-indication-under-a-parent (the IA pattern)
A new TA is usually surfaced as an **indication under a parent TA chip**, mirroring the reference:
NSCLC is an indication under **Oncology**; AD is an indication under **Immunology**. Match the reference's
information architecture — mentors/users read the parent→indication hierarchy as "real platform," and a
flat top-level chip for every sub-indication looks wrong.

### 7c. THE FAÇADE DISCOVERY — the parent hierarchy may be cosmetic
When we traced Oncology→NSCLC we found the "hierarchy" is a FAÇADE at the data layer: the **TA LABEL
carries the ta_id** (`taLabelToApiSlug("Oncology") === "nsclc"`, hardcoded), and the indication chips are
**cosmetic — they never enter the cohort query**. Selecting "All" vs "NSCLC" under Oncology yields the
same ta_id. ALWAYS trace how the reference TA's label/indication actually resolves to its ta_id before
copying it — you may be copying a shortcut.

### 7d. Option A (façade mirror) vs Option B (real per-indication ta_id) — PREFER B
- **Option A** — reproduce the façade: map the parent label straight to the new ta_id. Fast (~1 line),
  but reproduces the flaw: activating a *second* indication under that parent would show the first
  indication's data. A latent demo footgun the moment you display multiple indications.
- **Option B** — REAL per-indication resolution: add an optional `taId` to the indication config, thread
  it into `filters`, and have cohort fetchers use `filters.taId ?? TA_ID_MAP[taSlug]`. Makes the
  indication genuinely select the ta_id. This is the architecturally correct multi-indication foundation
  (and FieldMark's whole thesis is many-TAs-many-indications).
- **DECISION (AD):** did Option B. The `?? currentBehavior` fallback is the safety mechanism (see 7e).
  Do B unless there's a strong reason not to — "the right fix now" beats "the fast fix + debt."

### 7e. THE BACKWARD-COMPAT GUARDRAIL (the load-bearing pattern for ALL of Part II)
Every shared-code change uses an ADDITIVE fallback so existing TAs are byte-for-byte unchanged:

    const taId = filters.taId ?? TA_ID_MAP[taSlug];   // new TA passes taId; others hit the untouched path

- An entity WITHOUT the new field resolves EXACTLY as today → reference TA unaffected.
- Only the new TA takes the new branch.
- VERIFY the invariant explicitly every time (e.g. confirm `taLabelToApiSlug("Oncology")` still returns
  "nsclc" so NSCLC is preserved). Assert it; don't assume it.

### 7f. THE TA-SCOPING BUG PATTERN (recurring — expect ~3–4 per TA)
The single most common frontend bug class: **the data exists and is correct, but a component renders it
wrong (or empty) because of a HARDCODED reference-TA assumption in the READ path.** Each is the same shape:
a query/prop hardcodes the reference TA's id/slug/name, so the new TA reads the wrong (empty) scope.

Three caught during AD (all identical in shape, different location):
  1. **Established score block** — detail page derived cohort from a global `hcps_v2` column that's NULL
     for indication-scoped HCPs → showed "Unclassified." Fix: when a taId is passed, derive cohort from
     presence in `hcp_established_ranks_v3` for that ta_id.
  2. **Narrative slug** — generator writes `therapeutic_area_slug="atopic-dermatitis"`; frontend read
     resolved the PARENT label ("immunology") → no match → blank. Fix: narrative reads resolve the
     indication slug via `apiSlugForTaId(taId)`. (There were TWO read sites — `getHCPDetail` AND
     `getHCPNarrative` via `hcp.specialty` — find them ALL.)
  3. **Belief Profile tag** — `DetailScreen:1587` passes `therapeuticArea={taSlug==="nsclc"?"NSCLC":taSlug}`
     → reference reads a DISPLAY NAME, new TA reads a SLUG. The generator's written tag must match whatever
     the frontend reads for that TA.

**LESSON:** the frontend read format is often INCONSISTENT across TAs (reference reads a display name via a
special-case ternary; others read a slug). When you add a TA, audit every place the reference TA is
hardcoded and confirm the new TA's read matches its written value. A `grep` for the reference TA's
id/slug/name across the frontend surfaces the whole set. (Debt: reconcile the ternary to one canonical
format — deferred because it touches the reference TA's render path.)

### 7g. VERIFY-IN-BROWSER-LOGGED-IN is the only real confirmation
Typecheck/build passing ≠ it renders. RLS means anon sees nothing — you MUST log in and click through.
The regression oracle: the reference TA must look IDENTICAL to before (e.g. NSCLC's #1 unchanged), the new
TA must render its correct roster, and any shared side-panel must look sane. Headless agents (Claude Code)
CANNOT do this — the founder's browser check is the gate on every "renders correctly" claim.

### 7h. Repoint gotchas checklist
- Count badges (`getTACounts`) often read DIFFERENT tables than the feed (`_scores_v2` vs `_ranks_v3`) — a
  new TA can have a working feed but "0" count badges. Backend data gap, not a frontend bug.
- Un-hardcoding a shared panel (e.g. InstitutionsInTerritoryPanel) may FIX a latent bug for OTHER TAs
  (they were showing the reference TA's data) — a real behavior change to flag, usually an improvement.
- Territory/practice-state filtering reads `hcps_v2.nppes_practice_state` directly (a column predicate),
  NOT region-scope rank rows. Populating practice-state is the whole territory fix (see §8f).

---

## 8. ENRICHMENT LAYER — making the new TA's profiles as complete as the reference

Scoring (Part I) populates the AUTHORITY layer (ranks + component percentiles). The ENRICHMENT/SYNTHESIS
layer is separate and, for a new TA, usually UNBUILT — every enrichment step was run only for the
reference TA. Each enrichment is "run the reference TA's step for the new ta_id," but with gotchas.

### 8a. The enrichment inventory (per-HCP layers to populate)
For each, the frozen reference TA has it; a new TA starts at 0:
  - **Narratives** (`hcp_narratives_v2`) — Why This Expert + why_now + engagement_angle + signal_strength +
    caution_flags. Cheapest (~$1/200, minutes).
  - **Belief Profile / Scientific Positions** (`hcp_scientific_positions_v1` → `hcp_ai_overviews`,
    `synthesis_type='scientific_positions'`) — the DIFFERENTIATED MOAT (authority-weighted position
    aggregation). TWO-stage, per-paper extraction, ~$15–25/top-100.
  - **Top Collaborators** (`hcp_top_collaborators_v2`) — collaborator-pairing step.
  - **Research Themes** (`hcp_research_themes_v2`) — theme-extraction step.
These are PUBLICATION-DERIVED → apply to Established + Rising, NOT Community (non-publishing; Community gets
an OPERATIONAL narrative from Open Payments + NPPES, a different generator, built with the Community
Workspace).

### 8b. TRACE-BEFORE-GENERATE (the discipline that prevents wasted runs)
Before running ANY enrichment for a new TA, have the agent READ THE ACTUAL SCRIPT and report:
  1. What tables/columns it reads; how it selects HCPs (does it work for the new TA's cohort?).
  2. **THE TAG/SLUG it WRITES vs what the frontend READS** — the #1 silent-failure mode. If write ≠ read,
     it generates INVISIBLE output. Confirm they match BEFORE spending.
  3. Model, token, cap settings → a GROUNDED cost (not a read-the-code ballpark).
  4. Idempotency (does a re-run duplicate?).
  5. Every reference-TA hardcode (constants, SQL, AND prompt text).
This single read saved AD from: a slug-mismatch invisible narrative run, a tag-mismatch invisible belief
run, and a 4× cost misestimate. Always trace first.

### 8c. COST-GROUNDING (don't trust ballpark estimates)
Estimates from reading code are guesses; the actual cap/token settings are facts. A per-paper extractor
looks expensive ("1 call/paper × all papers") until you read the PAPER CAP (~10/HCP) and learn abstracts
are PRE-STORED (no live fetch). AD Belief Profile: ballpark said $20–60; grounded reality ~$15. If a founder
remembers it costing less, TRUST THAT — search past chats for the original build's actual numbers before
re-estimating.

### 8d. THE PER-TA REGISTRY PATTERN (how to parameterize a reference-hardcoded pipeline)
Don't swap constants inline. Build a registry keyed by `--ta`:

    TA_CONFIGS = {
      "nsclc":            { ta_id, tag, label, ...exemplars },  # reference: VERBATIM original strings
      "atopic-dermatitis":{ ta_id, tag, label, ...exemplars },  # new TA
    }

- The reference entry reproduces the ORIGINAL strings verbatim → reference renders byte-for-byte identical.
- New TA entry carries its own ta_id, tag (must match frontend read), label, and prompt exemplars.
- Add a `--ta` flag (default = reference). Thread `ta_id` through selection → prompt → write.
- PROVE reference byte-identity: a zero-API prompt-render harness that diffs before/after prompt text
  (empty diff = proven, stronger than a live dry-run, costs nothing).
- This generalizes to any-TA and is the reusable pattern for all future enrichment parameterization.

### 8e. PROMPT DE-CONTAMINATION — TA-NEUTRAL exemplars (do NOT ask the founder to author clinical claims)
Reference-TA prompts contain TWO classes of hardcoding:
  - HARD (ta_id, tag, SQL) — mechanical to parameterize.
  - SOFT (the reference TA's NAME + its DRUG/ENDPOINT EXEMPLARS baked into the prompt) — a QUALITY risk:
    left unchanged, they tell the model the new TA's investigators work in the reference disease and seed
    theme-naming with the wrong drugs → biased extraction + mislabeled experts.
**The fix is TA-NEUTRAL/STRUCTURAL exemplars** that teach the SHAPE of the output (a claim + endpoint +
polarity) WITHOUT naming specific drugs or asserting clinical statements. The founder is NOT a scientist and
must not author clinical claims. The real clinical content comes from the model extracting the REAL
abstracts. Neutral exemplars + real abstracts = accurate, un-biased extraction. (AD validated this: neutral
exemplars produced specific, correct AD positions — pediatric underdiagnosis, severity-tool caution — with
zero reference-TA leakage.) The domain advisor refines with TA-specific exemplars LATER (ship-now-refine-later,
matching how the reference TA itself was built).

### 8f. IDEMPOTENCY (re-runs must not duplicate)
Enrichment gets re-run (test-5 then full, refreshes, new TAs). A non-idempotent write duplicates.
  - Plain INSERT with no ON CONFLICT → re-run appends duplicates. FIX: delete-existing-rows-for-(HCP,TA)
    before insert, INSIDE the per-HCP transaction (partial-run safe; only reprocessed HCPs are cleared).
  - The NULLS-DISTINCT constraint trap: a standard UNIQUE treats NULLs as distinct, so rows with a NULL
    scope column (e.g. global-scope) ESCAPE an existing upsert and duplicate on re-run. FIX: swap to
    `UNIQUE NULLS NOT DISTINCT (...)` (PG15+) so NULL rows conflict and the upsert fires. (This was the AD
    ranks_v3 dedup: 2,546 duplicate global rows from a re-run, fixed by the constraint swap; recurrence
    structurally prevented, no script change needed.)

### 8g. Signal fields must actually RENDER (audit generate-vs-render)
A generator may write fields the UI never shows. AD found 4 of 5 narrative fields (why_now,
engagement_angle, signal_strength, caution_flags) were generated but RENDERED NOWHERE for Established
(a Signal Summary section was gated to `rising_star` only, and why_now was dropped in a mapping). Un-gating
surfaced the MOST MSL-actionable content platform-wide. LESSON: after enrichment, AUDIT that every generated
field has a render site; "are we surfacing everything we compute?" is a recurring audit question. (Watch
field FORMAT vs component: a full-sentence value in a fixed badge component overflows — render prose fields
as wrapping text blocks, guard each sub-block on its own field so empty fields hide cleanly.)

### 8h. Enrichment run ordering & dependencies
- LOCATION before NARRATIVES: narratives reference practice location → resolve NPPES practice-state first,
  or narratives omit/misstate geography and need regeneration. (Data-dependency ordering.)
- DEDUP before ENRICHMENT: enrichment selects "top-N by rank" from the ranks table — clean duplicates first
  or selection is corrupted (fewer distinct HCPs, double-generation).
- Stage-1 before Stage-2 (Belief Profile): Stage 2 selects only HCPs that already have Stage-1 positions.
- Narratives anchor on INSTITUTION (reliable), not stale NPPES city — verify location claims are corroborated.

---

## 9. DEFINITION OF DONE — the parity matrix

The acceptance test for a new TA is a **live-DB parity matrix vs the frozen reference TA**, per cohort:
rows = enrichment layers, columns = {Reference Established, New Established, Reference Rising, New Rising}.
Each cell = coverage (distinct cohort HCPs with a row / cohort population) + remaining work.

Reading the matrix (critical — %s are NOT apples-to-apples):
  - FULL-COHORT layers (classification, pub-leadership, network, author-metrics) should approach 100% for a
    properly-built TA. (AD Established hit 98–99% — CLEANER than NSCLC's 57%, because AD used the TA-anchored
    cohort vs NSCLC's looser legacy denominator. A new TA does NOT need to "catch up" to the reference's %.)
  - OVERLAY layers (narratives, belief profiles, themes, web signals) are TOP-KOL BY DESIGN → low cohort %
    is EXPECTED even when "done"; judge by top-N depth, not cohort %.
  - US clinical/commercial (Medicare, Open Payments) are coverage-capped by the US fraction; an intl-heavy TA
    showing low coverage is STRUCTURAL, not a defect (→ display-only, weight 0).
Save the matrix as `docs/<TA>_PARITY_CHECKLIST.md` — it IS the definition-of-done.

---

## 10. PART II OPERATING DISCIPLINE (additions to §4)

- **VERIFY STATE BEFORE ACTING — including agents' in-flight work.** Before starting a run, confirm nothing
  else (esp. a background agent job) is already doing it — two processes writing the same table race and
  corrupt. The founder caught this; ask the agent for status before parallel work on a shared resource.
- **LONG RUNS GO IN THE FOUNDER'S TERMINAL**, not an agent background job. Agent background jobs redirect to
  a file and BLOCK-BUFFER → no live progress/ETA/failure-count until done (blind for 1–2 hrs). Direct
  terminal runs stream live progress and allow Ctrl-C. (Use `python -u` / PYTHONUNBUFFERED=1 if an agent
  must run one.) Agent = code work + short verifiable runs; multi-minute/hour GENERATION = founder's terminal.
- **SEARCH PAST CHATS FOR DESIGN INTENT** before re-deriving how a feature works or what it cost. The original
  build conversations hold the real cost numbers, the exemplar provenance, and the design rationale. (Saved
  AD from re-authoring exemplars the founder never wrote, and from a 4× cost misestimate.)
- **AGENT + STRATEGY SPLIT that works:** the coding agent (Claude Code) traces/parameterizes/reviews/fixes in
  the codebase; the strategy thread holds architecture, decisions, and this running doc; the founder does
  domain validation (does the output read TRUE to the field?) and the browser gate. Read the actual
  script/schema before acting — the agent's estimates and the strategy thread's inferences are both guesses
  until grounded in the code/DB.
- **COMMIT + PUSH at every verified milestone** (multi-machine safety; branch commits don't deploy).


---

# ===== source: TA_NEW_PLAYBOOK_ch2.md =====

### 7i. MODEL MIGRATION REPOINT — when the new cohort uses a DIFFERENT scoring model, not just a different ta_id
§7a–7h assume the new TA rides the SAME model as the reference (repoint = thread a ta_id). Rising broke that
assumption: AD rising uses a NEW model (`hcp_rising_composite_v1`, 2-axis emergence + network-influence,
scope-row shaped) replacing the OLD (`hcp_rising_star_ranks_v3`, 2x2 momentum/visibility, US-centric). That is
NOT a repoint — it's a model migration, and it changes the frontend CONTRACT (column names, dimensionality), not
just the ta_id. Signs you're in a model migration, not a repoint: the new table has different columns than the
reference RPC returns; the UI renders a different NUMBER of axes; the old model has a column the new one doesn't
(here: `archetype`, `us_rank`). When you see these, the frontend is a REWORK (types + mapper + breakdown
component + the tiles), not a one-line fetcher change. Budget accordingly — "wiring, not scoring" was true of the
DATA but undersold the FRONTEND by ~4 files + 2 sub-paths.

### 7j. AUTHOR A NEW RPC BY MIRRORING THE STRUCTURALLY-MATCHING REFERENCE, NOT THE SAME-NAMED ONE
When the new cohort's table is shape-identical to a DIFFERENT cohort's table, mirror THAT cohort's RPC. AD rising's
`hcp_rising_composite_v1` is scope-row shaped (scope_type/scope_value/rank, one row per HCP per scope) — identical
to `hcp_established_ranks_v3`, NOT to the old rising table. So `get_rising_composite_filtered` mirrors
`get_established_filtered` (true scope-row filtering) — NOT `get_rising_star_filtered`, which fakes scope with a
`us_rank` CASE trick because its table is one-row-per-HCP. **Shape match > name match.** Trace both candidate
reference bodies (`pg_get_functiondef`) before choosing; the same-named one is often the wrong template.
- Mirror the reference's WHERE/states/theme-EXISTS/ORDER BY/LIMIT verbatim; swap ONLY the table + score column;
  ADD the new model's real columns as return fields.
- Alias the new composite score into the reference's generic slots (`normalized_score`/`composite_score`) so any
  SHARED card chrome renders unchanged while the reworked breakdown reads the real new columns. Extra returned
  columns are name-keyed and harmless if unread — belt-and-suspenders against a blank-card regression.
- GRANT EXECUTE to the same role the new table's RLS admits (here: authenticated only — the table was RLS-locked
  authenticated-read; anon would 401 anyway). NOTIFY pgrst.
- New function NAME (don't overload the old one) -> collides with nothing, leaves the frozen TA's RPC untouched.

### 7k. career_first_pub_year_v2 IS CANONICAL EVERYWHERE — the one column where "mirror the reference" is WRONG
The reference (established) RPC reads plain `career_first_pub_year`; DON'T copy that. Plain is homonym-corrupted
(OpenAlex works-count/first-work); `_v2` is the correction (MIN(pub_year) over LINKED pubs, 1940 floor). Measured
divergence: **75.8% of the corpus** (214,102 / 282,464 rows) disagree. Any new RPC/view/card surfacing career
start MUST select `career_first_pub_year_v2`, aliased back to `career_first_pub_year` so frontends don't change.
This is load-bearing for RISING specifically (career-start drives early-career eligibility) — but it's a display
correctness issue for every cohort. **Established's RPC still reads plain = a latent CARD-DISPLAY bug** (ranks are
safe — the scorers already gate on `_v2`, verified by grep; only the projection column is wrong). Fix TA-wide when
convenient. LESSON: "mirror the reference" is a STRUCTURAL heuristic; for any column that's a known data-quality
correction, verify which column holds correct data (`count(*) FILTER (WHERE a IS DISTINCT FROM b)` + a spot-check
of known-affected rows) and use the corrected one regardless of what the reference does.

### 7l. THE RPC RETURN SHAPE IS A CONTRACT — trace the CONSUMER before finalizing it (the empty-render trap)
Producer/consumer disagreement is this project's #1 recurring bug (count-RPC v2/v3 §30ep, themes tag, feed
loadMore §30es). A column-name mismatch renders EMPTY or ZERO, not an error — it LOOKS like data. Before shipping
any cohort RPC, grep the consumer half and confirm the exact field names it reads:
  - the mapper (`enrichAndMapCohortRows` / the cohort branch in api.ts),
  - the type (`types.ts`), the data model (`hcpData.ts`),
  - the detail-breakdown component AND its separate builder query (the detail breakdown is often fed by its OWN
    direct-table query, NOT the feed mapper — AD rising's `getRisingStarScoreBreakdown` reads the old table
    directly; that's a SECOND repoint hiding behind the first).
If the consumer speaks a different vocabulary than the new model emits (AD rising's entire read path spoke the old
2x2 momentum/visibility names — nothing read the new columns), the frontend is a rework, and you either (a) rework
the consumer to the new names [correct], or (b) alias the new columns into the old names in the RPC [a lie in the
data layer — rejected]. Do (a).

### 7m. DEPRECATE, DON'T PORT, a construct whose premise was retired
`archetype` was labels for positions in the old 2x2 grid. The advisor pass that designed the new model killed one
of those axes AS DISHONEST (recent centrality = current connectedness, not growth). So archetype named positions
in a grid whose axes no longer mean what they claimed — porting it forward would carry a retired premise. RULE:
when a model changes, don't reflexively preserve every downstream label; ask whether the label's MEANING survives
the new axes. If not, drop it (stub cleanly; leave the old subsystem live for the frozen TA that still uses the
old table) and, if the capability is still wanted, DERIVE IT HONESTLY from the new axes as new design work —
don't reconstruct the old one. (For AD rising: emergence-high/network-low = "surging on science, not yet
connected" vs the inverse — a real, honest quadrant story, deferred as an open design Q until the 2-tile render
is seen.)

---

## 11. PER-TA COHORT FORK — routing a new model without touching the frozen TA (added July 12, AD Rising)

### 11a. NSCLC-frozen is an ARCHITECTURAL GUARANTEE, not vigilance
"Be careful not to touch NSCLC" is a promise; "NSCLC's code path is never in the diff" is a guarantee. Build the
guarantee. When a new TA needs a different cohort model, do NOT globally swap the RPC — FORK at the dispatch site
so the frozen TA's path is byte-for-byte unchanged (not "preserved" — literally the same literals).

### 11b. Fork at the CALL SITE, never inside the shared fetcher
`fetchCohortViaRpc` takes the RPC/table names as PARAMETERS; the per-cohort literals live at the call sites
(`getRisingStars` / `getEstablished` / `getCommunity`), where `taId` is already resolved two lines above. Fork
there:

    const risingRowsRpc  = taId === TA_ID_MAP["atopic-dermatitis"] ? "get_rising_composite_filtered" : "get_rising_star_filtered";
    const risingCountRpc = taId === TA_ID_MAP["atopic-dermatitis"] ? "get_rising_composite_filtered_count" : "get_rising_star_filtered_count";
    const risingTable    = taId === TA_ID_MAP["atopic-dermatitis"] ? "hcp_rising_composite_v1" : "hcp_rising_star_ranks_v3";
    const risingCohortTag= taId === TA_ID_MAP["atopic-dermatitis"] ? "rising_composite" : "rising_star";

The frozen TA hits the SAME four literals it does today. `enrichAndMapCohortRows` already discriminates on the
`cohort` tag -> the new TA gets a NEW mapping branch; the old branch is untouched. (This is §7e's additive
guardrail applied to the whole model, not just a ta_id.)

### 11c. CAPTURE THE FROZEN TA'S FINGERPRINT BEFORE the edit — it's the regression oracle
Before any change, snapshot the frozen TA's cohort output (top-N via its RPC, verbatim). Post-change, the
identical call must reproduce it byte-for-byte. AD-rising example: NSCLC top-10 global via
`get_rising_star_filtered(<nsclc_ta_id>, 'global', ARRAY['global'], …, 10, 0)` — ranks 1–10, all "Balanced Rising
Star", captured to diff after. Pair with §7g (browser gate): typecheck/build passing ≠ renders; the frozen TA
must look IDENTICAL logged-in.

### 11d. BACK-MIGRATION OF THE FROZEN TA IS DEFERRABLE — split-brain is an acceptable, DELIBERATE state
Reconciling the frozen TA onto the new model (so both TAs share one model) is NOT a precondition to shipping the
new TA. If the frozen TA's DB is load-bearing (AD: NSCLC holds mentor records), DEFER it: the per-TA fork lets the
new TA use the new model while the frozen TA keeps the old, indefinitely. Two live models = a maintenance concern,
not a correctness/safety one. Log it as deliberate; reconcile on the founder's schedule. (Note: the back-migration
would NOT mutate the frozen table anyway — it writes new rows into the new table — but "don't run it" stands when
the founder says the TA is frozen.)

---

## 12. GLOBAL-FIRST TAs — the scope default + the global short-circuit (added July 12, AD Rising)

### 12a. Some TAs are GLOBAL-FIRST — and the frontend defaults to US
A TA's international skew is a product fact, not an edge case: AD is ~82% international; its rising/established
cohorts LIVE in global scope. But `resolveFilterScope` (rank-filters.ts) DEFAULTS to region/US, and
`fetchCohortViaRpc` SHORT-CIRCUITS global to empty (api.ts ~476–478: `if scopeType==="global" ||
scopeValues.length===0 return {rows:[],total:0}`). So for a global-first TA, the DEFAULT view is the wrong lens
AND explicit-global returns empty. Global rising is served NOWHERE today (traced: no global branch in
`getRisingStars`, every direct old-table read is US-only/count/detail) — a pre-existing gap, latent because
NSCLC is US-heavy and never exercised it.

### 12b. Global-first is a DEFINITION-OF-DONE question, decided by the founder, not an engineering afterthought
If the demo needs the international cohort visible (AD: yes — the international researchers ARE the point), global
is part of Tier 1 DoD, not a deferrable enhancement. Shipping US-defaulted would under-serve exactly the cohort
the TA exists to show. This forces TWO edits in TWO files: relax the 476–478 short-circuit (shared infra — governs
all 3 cohorts, trace its blast radius) AND change the region/US default for that TA (rank-filters.ts). Both
potentially TA-conditional (mirror §11b's fork discipline — don't change the default for the frozen US-centric TA).

### 12c. BEFORE designing global-first scope, check whether the REFERENCE TA already solved it
The pivotal question that sizes the work: does the reference TA (which faced the same international problem) ALREADY
handle global-default, or did it ship US-defaulted? If solved -> MIRROR the existing scope pattern (clean). If not
-> the reference has the SAME latent gap, and you're designing global-first scope for the first time (bigger, and
it fixes both TAs). Trace the reference's default-scope resolution and whether it bypasses the 476–478 short-circuit
BEFORE writing the new TA's scope spec. [OPEN for AD as of this writing — routed to Code; resolves whether AD Rising
Tier 1 is "mirror" or "design-new."]

---

# ===== source: TA_NEW_PLAYBOOK_ch3.md =====

# TA NEW PLAYBOOK — CHAPTER 3
Continues TA_NEW_PLAYBOOK_ch2.md (which ran §7–§12). Chapter epoch: §13-series.
Same format as ch2: distilled, durable rules for standing up a new therapeutic area on FieldMark —
extracted from the ch1–ch3 debt log, generalized so a future builder can act without re-deriving.

Scope note: ch1–ch2 covered the DATA + FRONTEND layers of a TA launch (scoring model migration, RPC
mirroring, per-TA forks, global-first scope). Ch3 opens the POSITIONING / PUBLIC layer — how a TA's
features are described accurately and safely to the outside world — plus whatever new engineering rules
emerge as work continues.

---

## 13. THE POSITIONING LAYER — describing a TA's features publicly (added, marketing landing page)

### 13a. FEATURE COPY IS A CODE-GROUNDED ARTIFACT, NOT A MEMORY-GROUNDED ONE — re-extract before every positioning pass
The scoring layer EVOLVES between the moment a feature is named and the moment you describe it: "Dark Horses"
was dropped; rising migrated from a 2x2 momentum/visibility grid to a 2-axis emergence/network composite
(§7i); `archetype` was retired as dishonest (§7m). Every one of those is a case where the LABEL a human
remembers outlived the COMPUTATION beneath it. Marketing/positioning copy that overclaims relative to what the
model actually does is the same producer/consumer disagreement bug as §7l — except the "consumer" is a
prospect, and the failure isn't a blank card, it's a false promise.
RULE: before writing ANY public-facing or positioning copy for a TA's features, RE-EXTRACT the current
user-facing definition from the LIVE components (headings, tooltips, methodology strings) AND the underlying
compute (RPC/table/column/script). Treat all prior descriptions as stale until re-grounded. For each feature
confirm: (a) the verbatim in-app strings, (b) what it actually computes, (c) any label⇄computation gap. Copy
may claim only what (b) supports. The extraction report (`FEATURE_DEFINITIONS_CURRENT.md`) is a reusable
asset — it is the CANONICAL FEATURE SURFACE a new TA must light up, and it should be regenerated (cheap,
read-only) at each TA launch rather than trusted from the last one.
COROLLARY (single source of truth): feature descriptions drift because they live in many places (in-app copy,
marketing page, decks, memory). Prefer ONE code-derived canonical definition per feature that the positioning
surfaces cite, so the next drift is caught at the source, not re-discovered per channel.

### 13b. THE PUBLIC SURFACE DESCRIBES CAPABILITY, NEVER NAMED-INDIVIDUAL SURVEILLANCE — a standing liability rail
FieldMark's product identifies and profiles named physicians (HCPs). On any PUBLIC, unauthenticated surface,
that same capability, shown concretely, reads as surveillance of identifiable individuals — a liability and a
trust problem, and it undercuts the invitation-only mystique. RULE for every TA's public/positioning material:
describe the CAPABILITY in the abstract (what the platform can surface, how, why it's rigorous) — never a
named or real-looking physician, never a product screenshot that exposes an individual's profile. Carry it with
brand, concept, and abstract visuals (nebula/constellation motif). This is TA-agnostic: it holds for every new
TA's launch page, not just the first. (Behind the gate, named data is the point; in front of it, capability
only. The gate is the line — §30gl.)

### 13c. PROVENANCE CHECK — confirm you're reading the CURRENT log before acting on "full state"
A session opened against a debt-doc export that was stale (ended §30gl; the referenced §30gq was absent; the
outputs copy was empty). No harm done because the work at hand didn't depend on the missing entry — but the
generalizable rule: when a session's plan hinges on "the latest entry has the full state," VERIFY the log you
were handed actually contains that entry before building on it. Cheap check: grep for the referenced section id;
if absent, flag it and either retrieve the current version or proceed only on state you can see. Silent
reliance on a stale handoff is how a producer/consumer mismatch (§7l) sneaks into the PROCESS layer instead of
the code.

### 13d. CLAIM THE COMPUTE FLOOR — and never market a feature the code doesn't contain
Turning features into public copy has two failure modes, both seen in the AD/marketing pass:
(1) NAMING ESCALATION — an in-app UI LABEL can be more aspirational than the thing it renders. "Belief Profile"
    renders data the store/generator call `scientific_positions` (the generator prompt explicitly forbids belief
    language); "PRE-MEETING BRIEF" renders whenever a relationship exists with NO meeting/calendar entity anywhere;
    "What N MSLs are saying" renders a MOCK, non-persisted reaction count. RULE: public copy claims the COMPUTE
    FLOOR — what the code actually computes — never the UI's own aspirational label. Derive the claim from the
    extraction's "what it computes" section, NOT its "user-facing copy" section.
(2) PHANTOM FEATURES — memory and the founding brief listed "natural-language queries"; the code has none (the real
    surface is a 3-sentence AI identity blurb generated from theme metadata). RULE: a feature absent from the
    extraction report is NOT marketed, however confidently memory asserts it. The extraction (§13a) is the ALLOWLIST
    of what may be claimed — presence in code is necessary, not just plausibility in memory.
COROLLARY — the fork discipline (§11b) applies to COPY, not just RPCs. The AD rising card's "Momentum 70% /
Visibility 30%" tooltip is wrong because a SHARED card string wasn't forked when AD got a new model — the same
byte-identical-frozen-path guarantee that protects the frozen TA's DATA must protect its SHARED UI STRINGS too.
Before any new TA's launch copy (or even in-app strings), confirm every SHARED string a new model reuses actually
describes the NEW model; a model migration (§7i) silently invalidates the reused label.

### 13e. MARKET THE LAYER, GATE THE DRILL-DOWN — differentiator capabilities that carry sensitive columns
A capability can be a top differentiator AND carry columns too sensitive for a public, unauthenticated surface.
(Community: the practicing-physician layer competitors who only index publishers MISS — genuinely a wedge pharma
asks about — but the drill-down is named practitioners × Open Payments dollars, sortable.) Don't drop the
differentiator to protect the sensitive part; SPLIT it. Public copy markets the LAYER and its strategic value
(why it matters, what it covers at CATEGORY level — subspecialty/location/career-stage; "a directory, not a
ranking"); the sensitive drill-down (names, dollars, per-individual figures) stays behind the gate. Keep public
and gated CONSISTENT: the public claim must be a TRUE SUBSET of the gated feature, never a different promise.
TEST: could a competitor read the public block and the gated feature side by side and find a contradiction? If
yes, the public copy overreached. (§13b's capability-not-surveillance rail still governs the public block; the
community layer is a per-TA build — a new TA stands up its own directory, currently AD-only in-app.)

### 13f. SPLIT THE TRUST STORY — transparent scoring vs. grounded AI synthesis; chain every AI claim to its grounding
FieldMark has two intelligence layers, and they earn trust DIFFERENTLY — market them differently.
- SCORING (emergence, network position) is deterministic, inspectable math → market as transparent, "no black
  box." A scientific buyer trusts what it can audit.
- SYNTHESIS (position extraction, identity summary, engagement angles) is AI → market as the exciting "reading"
  layer ("AI reads the corpus for you"), but NEVER unattached: pair every AI claim with its grounding (positions
  tie to publications; generator prompts forbid invention; outputs constrained to the inputs).
RULES: (1) do NOT claim AI does the RANKING — it doesn't, and "AI-ranked your KOLs" reads as LESS trustworthy to
a scientific audience, not more. (2) Concentrate the AI message where it's genuinely load-bearing (a dedicated
band + the AI-native feature blocks), not sprinkled everywhere — selective emphasis excites; ubiquitous "AI!"
reads as hype. (3) Vendor-naming the model publicly is a founder call (credibility signal vs. vendor-lock
perception); the app's internal "Generated by Claude" attribution keeps either choice consistent.

## 14. SHIPPING A STANDALONE STATIC SITE ON CLOUDFLARE PAGES (added — marketing landing deploy)

### 14a. PAGES, NOT WORKERS — Cloudflare merged the flows and funnels you into the wrong builder
Cloudflare's "Create application" defaults toward the WORKERS builder (tell: header reads "Create a Worker,"
fields ask for `npx wrangler deploy` / `versions upload` / an API token). A static site + Functions is a PAGES
project. The Pages entry is often a small "Looking to deploy Pages? Get started" link, NOT one of the big buttons.
The correct Pages setup screen shows Framework preset / Build command / **Build output directory** — and asks for
NONE of the wrangler/API-token stuff. If you see wrangler commands, you're in the wrong builder; back out.
Static-site settings: framework preset None, build command EMPTY, output dir = the folder (`public`).

### 14b. ENV VARS BIND AT DEPLOY TIME — a dashboard edit does nothing until you redeploy
Setting/changing a Pages env var (`SUPABASE_URL`, keys) does NOT affect the running Function until a NEW deploy.
"Retry deployment" re-runs the SAME commit (picks up new env values); a git push builds a NEW commit. If you fix a
value and nothing changes, you almost certainly didn't redeploy. Corollary: a git push that shows a NEW commit hash
is the only thing that ships new CODE — a "retry" of the old hash ships the old code (cost us a cycle: debug logging
was committed locally but the deployed hash was still the pre-logging build → empty logs).

### 14c. THE FAILURE-SIGNATURE LADDER for a Function → Supabase insert (read the log, don't guess)
A form Function returning a generic 502/error walks a deterministic ladder; instrument it and read the real cause:
- Function "outcome: ok", `exceptions:[]`, `logs:[]`, returns 502 → the CATCH fired with no log → `fetch()` THREW
  → malformed URL. #1 cause: **`SUPABASE_URL` missing the `https://` scheme** (or a trailing space/newline in the
  pasted value — invisible without quoting/escaping the logged value). Your-side env fix, no code change.
- `resp 401` → auth: anon key in the service-role slot, or missing `apikey`/`Authorization` header.
- `resp 403 code 42501 "permission denied for table"` → **Supabase default-privileges: new tables don't grant the
  `service_role` table privileges by default.** Fix: `grant select, insert on table public.<t> to service_role;`
  RLS stays ON, no public policies — service_role bypasses RLS; the public/anon key still can't touch it. (This is
  the same Data-API default-privileges change flagged for the platform's Oct-30 enforcement — it bites EVERY new
  table exposed through the API, not just waitlist. Sweep app tables before enforcement.)
- `resp 404` → wrong REST path / URL didn't carry to this build / double-slash from a trailing slash on the URL.
- `resp 400/409 <postgres msg>` → payload vs schema. Specifically **409 = the dedup unique index rejecting a repeat**
  — which is the guard WORKING; but if the code doesn't treat a duplicate as success, a returning user sees a false
  error. Insert must send `Prefer: resolution=ignore-duplicates` AND/OR treat 409 as `{ok:true}` 200.
Keep a STATUS-ONLY failure log in production (`console.log("insert failed", resp.status)` — no body, no PII). Silent
failure paths are worse for a form that quietly matters; the bare status is the breadcrumb that ends the next guess.

### 14d. SEPARATE REPO = the guardrail is structural, not vigilant
The marketing site lives in its OWN repo + its OWN Pages project, never the app repo. This makes "a marketing deploy
can't touch the app" a GUARANTEE (the app's code is never in the diff), not a thing you have to be careful about —
the §11a principle applied at the repo level. Watch the failure mode: running the new repo's git commands (`remote
add`, push) from the APP directory would point the app's history at the marketing remote. Always confirm the working
directory + `git remote -v` before pushing. (Also: gitignore tooling scratch like `supabase/.temp/` — an untracked
temp file blocks `git checkout` on every branch switch.)

### 14e. POST-DEPLOY, HARD-REFRESH BEFORE BELIEVING WHAT YOU SEE
The window between "new code deployed" and "browser still holding old CSS/JS" renders as a SHATTERED layout with
correct data — looks catastrophically broken, is actually cache. Ctrl+Shift+R or incognito before diagnosing. Cost
a genuine "it's broken!" scare on the app release that a hard-refresh instantly cleared. Pair rule: restart the dev
server after any branch switch (Vite hot-reloads file changes but can hold a stale module graph across a bulk swap).

---

## 15. BRANCH-VS-DIRECT DISCIPLINE ON AN AUTO-DEPLOYING PRODUCTION BRANCH (added — AD merge + Community restyle)

### 15a. The axis is BLAST RADIUS × SILENCE, not change size
`foundation-rebuild` auto-deploys to production on push. A branch-per-tiny-change ritual won't be sustained (a rule
you won't follow is worse than none), so decide by consequence, not size:
- COMMIT DIRECT when low-blast-radius and self-evident: styling, copy, a single isolated component — failure is
  cosmetic and obvious in seconds. (Community restyle → direct.)
- CUT A BRANCH when the change touches SHARED code (components multiple TAs use, `api.ts`, routing), DATA/MIGRATIONS,
  or AUTH/entitlement — or when a failure would be SILENT (breaks a TA/feature you're not looking at; locks out users
  you can't see because you're already logged in). A NEW TA BUILD is the flagship "branch" case — it touches shared
  cohort logic and can break the frozen TA silently. (§11c fingerprint gate applies to exactly these.)
Cheap safety net for the direct path: hard-refresh + eyeball production after every push (§14e).

### 15b. "REUSE THE SHARED COMPONENT" ≠ force the wrong component onto new data
Aligning a new surface (Community cards) to an existing design system: reuse the shared TOKENS/primitives (card
chrome, tile look, typography, color vars), NOT a component whose behavioral premise doesn't fit. The cohort KPI tile
carries a 0–100 percentile bar + a metric-tooltip map; community data is dollars + a manufacturer name with NO
percentile. Importing it literally renders an empty 0% bar — a UI lie, the §7m "porting a retired premise" trap in
styling form. Correct: match the token-level look, drop the percentile machinery. Prefer shared style VARIABLES over
copied hex literals, or the surface silently drifts the next time the design system is retuned (§13a/§7l one-source
instinct, applied to CSS). When Code flags that a shared component doesn't fit the new data — that's the discipline
working; take the token-match option, not the force-fit.

---

## §32. INCREMENTAL REINGEST — corrections & additions to the ROADMAP (from the first real cycle walk, 2026-07-21)

The full canonical pipeline order (§1) documents the from-scratch BUILD. The INCREMENTAL reingest cycle (weekly pub
refresh) is a NET-NEW sequence, now designed and walked once — see **INCREMENTAL_REINGEST_SEQUENCE.md** (the incremental
counterpart to §1). Key corrections the walk forced into the ROADMAP:

**§32a. Stale script-status inventory.** The §1-era inventory listing `network_centrality_scoring.py` and
`pharma_engagement_scoring.py` as "✗ PENDING" is STALE — both exist on disk (scripts/score/) and the full established
scoring sub-pipeline is present. (Established composite weights: --w-scientific 0.75 --w-network 0.25 --w-pharma 0.0,
so pharma_engagement is displayed-only, irrelevant to rank.)

**§32b. Inventory upsert must use GREATEST (never lower a count).** The §3b Stage-2 upsert (`ON CONFLICT DO UPDATE`)
must set `corpus_pub_count = GREATEST(EXCLUDED.corpus_pub_count, existing.corpus_pub_count)`, NOT
`= EXCLUDED.corpus_pub_count`. Reason: `author_pub_flat` under-represents the corpus the inventory counts were built
from (drift both directions — 933 established KOLs would DROP, 2,665 would rise, on the current NSCLC state). A bare
overwrite silently degrades established KOLs. GREATEST is correct both ways: never lower (anti-clobber), raise when flat
shows more. DISCIPLINE (proven load-bearing): dry-run the upsert as a COUNT with a `clobber_would_drop_count` check
BEFORE writing — it must be 0. LATENT FOOTGUN: a full `--truncate` inventory rebuild from the current flat table does
NOT get this protection → would lower 933+ KOLs. Before any full rebuild, rebuild author_pub_flat completely from
publications_v2 first, or always use GREATEST semantics.

**§32c. ta_tagging is LOAD-BEARING in the incremental cycle and runs BETWEEN Step C and Step F.** Step C does not tag
TAs (§1 L270); Step F scopes to TA-tagged HCPs (`--hcp-ids-file` from hcp_therapeutic_areas_v2). So newly-created HCPs
MUST be tagged (ta_tagging_rebuild_v2 --ta <slug> --execute) before Step F, or they're silently unlinked (zero-pub
phantoms). ta_tagging is also the concept-classifier that decides which new HCPs enter the scored population.

**§32d. Incremental SCOPING — three tools added (this session).** The back half of the chain was built whole-corpus/
whole-TA for the BUILD and is untenable per incremental cycle. Added:
  - `compute_affected_hcps.py` (scripts/utilities): computes the affected-HCP set = new HCPs (by ingestion_run_id) UNION
    pre-existing authors of the batch pubs. CRITICAL: group B is derived from publications_v2.authorships JSON →
    hcp_openalex_authors_v2, NOT from publication_authors_v2 (which is empty until Step F runs — a sequencing trap).
    Output feeds `--candidate-hcp-ids-file` for the scoped stages.
  - `dedup_detect.py --candidate-hcp-ids-file / --ingestion-run-id` (scoped): relational name-block scoping — must
    load full hcps_v2 for blocking (the key folds hyphens/diacritics in Python; a SQL surname filter would MISS
    variant-surname existing HCPs), then scope the expensive publication_authors_v2 read to the neighborhood. Emits
    only pairs with ≥1 seed member (new-vs-existing dups preserved — the important case).
  - `ta_tagging_rebuild_v2.py --candidate-hcp-ids-file` (scoped): Phase 3 must re-aggregate each affected HCP's FULL
    pub set (a new pub can push a PRE-EXISTING HCP over/under threshold — so the affected set must include existing
    co-authors of batch pubs, not just new HCPs).
  Every scoped tool requires a BOTH-MODES validation (full vs scoped → identical decisions for the affected HCPs) before
  it's trusted on real data. Offline proofs done; real-data validation of scoped ta_tagging pending (full-scan baseline
  crashed — under investigation).

**§32e. Non-negotiable ordering (unchanged from build, re-confirmed):** Step F BEFORE dedup (dedup repoints
publication_authors_v2 FKs so Step F links follow merges); career metrics AFTER dedup (R1 — de-inflating before identity
resolution harms fragmented KOLs); cohort classify AFTER career, BEFORE scoring (R2); Step F uses `--hcp-ids-file` with
ALL TA hcp_ids, NEVER `--only-new-hcps` (R3 — buried 34% of AD's established cohort).

---

## §33. RISING-STAR SCORING — THE MOMENTUM CHAIN (the section the main playbook was missing)

**The main TA_NEW_PLAYBOOK.md step 12 ("scoring_pipeline.py (rising) → hcp_score_ranks_v2") is STALE for the live
NSCLC rising leaderboard.** Ground truth (frontend api.ts + FEATURE_DEFINITIONS_CURRENT.md + ch2 §7i):

- **NSCLC (and every non-AD TA) rising board** = the "OLD" 2x2 Momentum/Visibility model → table
  `hcp_rising_star_ranks_v3` (momentum_component, visibility_component, scientific/network momentum & visibility
  percentiles, `archetype`) → produced by a 5-SCRIPT MOMENTUM CHAIN. Frontend reads via RPC `get_rising_star_filtered`,
  ordered by `us_rank`.
- **AD rising** = the NEWER emergence/network composite → `hcp_rising_composite_v1` (rising_composite_scoring.py +
  emergence_scoring.py). NSCLC has 0 rows there. (ch2 §7i: the advisor pass that designed the new AD model killed one
  of the old model's axes AS METHODOLOGICALLY DISHONEST — so NSCLC runs a partly-superseded model. Migrating NSCLC to
  the new composite is a SEPARATE model-migration project, ch2 §7i-7j, not a cycle step.)
- `scoring_pipeline.py → hcp_score_ranks_v2` is only a DETAIL-PAGE rank FALLBACK for rising/community, NOT the board.
  Its NSCLC rising data was 7 weeks stale. Do NOT rely on it for the leaderboard or the diff.

### THE CHAIN (all scripts in scripts/score/, all click-based, all support --ta/--dry-run/--debug-top).
New HCPs have 0 rows in all momentum inputs, so the WHOLE chain must run (centrality is whole-graph — an HCP's
centrality depends on all edges, so it can't be per-HCP scoped; --ta nsclc recomputes the whole NSCLC graph incl new
HCPs + their Step-F edges). UPSERTs (ON CONFLICT DO UPDATE), so re-running refreshes existing rows + adds new HCPs.

1. `network_centrality_scoring.py --ta nsclc --window-type hist_2016_2020 --start-year 2016 --end-year 2020`
   → hcp_network_centrality_v2 (historical window; network_momentum's early baseline)
2. `network_centrality_scoring.py --ta nsclc --window-type recent_2021_2025 --start-year 2021 --end-year 2025`
   → hcp_network_centrality_v2 (recent window; rising_star + network_momentum both read this)
   VERIFY: new HCPs now have recent_2021_2025 centrality rows (was 0).
3. `scientific_momentum_scoring.py --ta nsclc`  (--early 2016-2020 vs --recent 2021-2025, reads publication_authors_v2)
   → hcp_scientific_momentum_v1
4. `network_momentum_scoring.py --ta nsclc`  (diffs hist_2016_2020 vs recent_2021_2025 centrality)
   → hcp_network_momentum_v1
5. `rising_star_scoring.py --ta nsclc`  (Rising Star Raw = 0.70*Momentum + 0.30*Visibility; reads sci_momentum JOIN
   net_momentum JOIN net_centrality[recent_2021_2025] JOIN hcps_v2) → hcp_rising_star_ranks_v3 (THE LIVE BOARD)
   VERIFY: new rising HCPs now have hcp_rising_star_ranks_v3 rows; board reflects the cycle.

All 5 have --dry-run (compute, no write) + --debug-top N (print top N). Dry-run each, verify counts, then run live.
network_centrality is the slow one (whole-graph centrality over ~76K nodes).

### THE DIFF — reingest_diff.py POINTS AT THE WRONG TABLE
reingest_diff snapshots hcp_score_ranks_v2 (the stale fallback), but the board is hcp_rising_star_ranks_v3 (rising) +
hcp_established_ranks_v3 (established). To show real "what changed", REPOINT reingest_diff at those two tables, and the
BEFORE snapshot must be re-taken on the correct table (the existing 8c7244a1 is on the wrong table). TODO: repoint +
re-baseline. For THIS cycle: after the chain runs, capture before/after on hcp_rising_star_ranks_v3 to see the 63 new
rising stars enter + any rank movement.

### ALSO UPDATE main TA_NEW_PLAYBOOK.md step 12 to reference THIS section.

### §33 CORRECTION — the momentum model is NOT "old/inferior tech debt." It's MODEL-PER-LANDSCAPE by design.
Earlier framing in §33 ("OLD model", "partly-superseded", "migration is outstanding work") is WRONG and is retracted.
Corrected understanding (per Garrett): NSCLC and AD use DIFFERENT rising-star methodologies BECAUSE THE THERAPEUTIC
LANDSCAPES ARE DIFFERENT — a deliberate fit-for-purpose choice, not a version lag.
- NSCLC (large, mature, US-heavy, dense long-history co-authorship network) → MOMENTUM/VISIBILITY model
  (hcp_rising_star_ranks_v3): measures velocity/acceleration through an established field where there's a rich
  temporal signal. Correct for this landscape.
- AD (~82% international, different research structure) → EMERGENCE/NETWORK composite (hcp_rising_composite_v1):
  emergence + network-influence fits a landscape where "who's surfacing / who's connected" matters more than
  velocity through a dense US network.
The ch2 §7i "killed an axis as dishonest" note = that axis didn't work FOR AD's landscape, driving an AD-appropriate
model — NOT a universal condemnation of the momentum model. The per-TA fork (ch2 §11: taId===AD ? composite :
rising_star) is the INTENDED architecture (model-per-landscape), NOT a temporary pre-unification state. There is NO
"migrate NSCLC to the new model" TODO. Each TA gets the methodology that fits its landscape; adding a TA includes
choosing/assigning its rising model, not defaulting everything to one.

---

## §34. PER-TA RISING-MODEL SELECTION — the decision tree (how to choose the `rising_model` value when onboarding a TA)

Companion to §33's model-per-landscape architecture. When onboarding a TA, its rising-star scoring model is a
DELIBERATE choice driven by the therapeutic landscape, made at build time. Walk this tree in order:

### 1. Does the MOMENTUM model (NSCLC) fit?
Fits when the landscape has DEPTH TO MEASURE VELOCITY AGAINST: long publication history, dense co-authorship network,
strong US presence, enough temporal signal that "who's accelerating" is meaningful. Requires ~5-script chain
(centrality x2 windows → sci/net momentum → rising_star_scoring → hcp_rising_star_ranks_v3).
LIKELY FITS: mature solid tumors, Alzheimer's, major cardiology, big established fields ("more protein to chew on").
→ If yes: rising_model='momentum'. Done.

### 2. Does the EMERGENCE/NETWORK composite (AD) fit?
Fits when the field is YOUNGER / SPARSER / MORE INTERNATIONAL / FAST-MOVING, where recent output growth + connectedness
beats velocity-through-density. emergence_scoring + rising_composite_scoring → hcp_rising_composite_v1 (0.75 emergence
+ 0.25 network).
LIKELY FITS: rare diseases with a real cohort, newer modalities, internationally-skewed fields (AD ~82% intl).
→ If yes: rising_model='emergence_composite'. Done.

### 3. Neither fits as-is? Sub-cases, CHEAPEST FIRST — exhaust 3a before ever building 3c.
- **3a. PARAMETER problem, not model problem (CHECK FIRST).** "Neither fits" is USUALLY "right model, wrong
  windows/weights." A mature-but-recently-exploded field (e.g. immuno-oncology ~2015+) may want MOMENTUM with SHIFTED
  windows (recent 2020-2025 vs 2015-2019, not the 2016-2020/2021-2025 defaults). That's a CONFIG change to the existing
  chain, not a new model. Most "neither" cases resolve here.
- **3b. HYBRID of the two existing scorers.** Landscape with an established old guard AND rapid new-researcher influx
  might want momentum's velocity signal + emergence's from-zero detection. Composite the two existing scorers' outputs
  rather than build new. Moderate effort, reuses code.
- **3c. GENUINELY NEW methodology (real project — only if signal SOURCES differ).** A landscape structurally unlike
  both — so sparse that neither centrality nor pub-velocity has signal (very rare disease, <50 real researchers). The
  rising signal must come from DIFFERENT SOURCES: trial leadership, grant awards (NIH RePORTER — K-award/R01 as
  rising leading indicators), conference activity, MSL crowdsourced intel. Build only when the signal sources
  themselves differ, not just the tuning.
- **3d. SHIP WITHOUT RISING (the honest "not yet").** If no model is defensible on the available signal, DON'T ship a
  rising board — show Established + Community only, add Rising when data supports it. "I don't want to put lipstick on
  a pig" applies directly: a rising board on insufficient signal IS lipstick. Better to omit than ship noise.

### KEY DISCIPLINE
Exhaust 3a (reparametrize an existing model) BEFORE 3c (build new). Only build a new model when the SIGNAL SOURCES
differ (publications too thin → trials/grants/conference/MSL), not merely when the tuning is off. Choosing the model
(and its windows/weights) is part of TA onboarding — record it in the per-TA `rising_model` config so the automated
reingest dispatches the correct chain (§33).

---

## §35. INCREMENTAL REINGEST — THE COMMAND RUNBOOK (copy-paste, in order)
Every stage of one incremental reingest cycle with the EXACT command. NSCLC example (TA_ID
c0065b03-a25e-4e9a-bde4-4b4d0db7827d, this-cycle ingestion_run_id 5001edfd-7085-4e97-8f04-16b813bbd32a). Substitute
the run's own ta_id / ingestion_run_id. Windows/PowerShell. Prepend $env:PYTHONIOENCODING="utf-8" for any query that
outputs unicode names.

### 0. INGEST (produces the ingestion_run_id everything else scopes to)
    python scripts/ingest/ingest_publications.py --ta nsclc --incremental
    # → new publications_v2 rows + a new ingestion_run_id. RECORD that id; every stage below scopes to it.

### 1. compute affected HCPs (the scope file for tagging/enrich)
    python scripts/utilities/compute_affected_hcps.py --ingestion-run-id <RUN> --out affected.txt
    # → affected.txt = new HCPs (by run_id) UNION existing authors of the batch pubs (via authorships JSON →
    #   hcp_openalex_authors_v2, NOT publication_authors_v2 which is empty for new HCPs pre-Step-F).

### 2. ta_tagging (scoped)   [DEFAULT DRY-RUN — add --execute]
    python scripts/classify/ta_tagging_rebuild_v2.py --ta nsclc --candidate-hcp-ids-file affected.txt --execute
    # scoped mode resolves HCP→pubs via author_pub_flat (Step-F-independent). VERIFY hcp_therapeutic_areas_v2 count rose.

### 3. generate the full-TA hcp-ids file, then Step F (scoped additive)
    python scripts/utilities/run_sql.py "SELECT hcp_id FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id='<TA_ID>'" > nsclc_all_hcp_ids.txt
    # regex-clean to bare uuids (one per line) → nsclc_all_hcp_ids_clean.txt (strip run_sql header/---/footer)
    python scripts/classify/rebuild_publication_authors_v2.py --hcp-ids-file nsclc_all_hcp_ids_clean.txt --execute
    # R3: ALL TA hcp_ids, NEVER --only-new. ON CONFLICT DO NOTHING (additive, safe). "R3 risk DROPPED: 0" must hold.
    # VERIFY: new_hcps_now_linked = count(DISTINCT pa.hcp_id) WHERE hcp_id IN (new HCPs) → was 0, now ~tagged count.

### 4. 9b authorship position   [DEFAULT DRY-RUN — add --execute]
    python scripts/classify/derive_authorship_position_v2.py --pub-ids-file batch_pubs_<N>.txt --author-position-mode skip --execute
    # --author-position-mode skip is MANDATORY (author_position col is INTEGER; default 'label' writes STRING → crash).
    # scope by PUB (the batch's new pubs). Writes is_first_author/is_senior_author booleans (the scorer signal).

### 5. DEDUP   [detect is read-only; merge defaults to high-confidence tier]
    python scripts/dedup/dedup_detect.py --ingestion-run-id <RUN>          # → dedup_candidates_phase1.csv
    # REVIEW every candidate. shared_coauthors = decisive same-person. Empty 0-pub stub = safe merge. Different-institution
    # + pub_domain_overlap = same-person-multi-affiliation. Verify low-evidence via institution+pub_count before merging.
    python scripts/dedup/dedup_merge.py --dry-run                          # then:
    python scripts/dedup/dedup_merge.py --execute                         # (--tier fragment_low_evidence / --cluster N for others)
    # VERIFY hcps_v2 count drops by #merges.

### 6. CAREER CHAIN (the deep one — 4 sub-steps, all AFTER dedup)
    # 6a. career metrics: writes total_career_pubs + RAW career_first_pub_year. NO --execute flag (dry-run is opt-in).
    python scripts/enrich/career_enrichment_from_clusters.py --only-changed-today --target-version v2
    # 6b. author metrics: populates hcp_author_metrics_v2.counts_by_year (billed; scoped via the flag Code added).
    python scripts/enrich/openalex_author_enrichment.py --hcp-ids-file affected.txt        # (--dry-run to preview scope)
    #     VERIFY: count(hcp_author_metrics_v2 WHERE new HCPs AND counts_by_year NOT NULL AND snapshot=today) > 0.
    # 6c. sustained-onset → career_first_pub_year_v2 (run the NSCLC-adapted SQL; PREVIEW before UPDATE; snapshot_date
    #     in the SQL MUST match 6b's printed snapshot_date). File: nsclc_career_first_pub_year_v2_incremental.sql
    python scripts/utilities/run_sql.py "<the sustained-onset UPDATE, scoped by ingestion_run_id>"
    #     VERIFY: count(career_first_pub_year_v2) for new HCPs → was 0, now ~all.
    # 6d. cohort classify: reads _v2, guards it, derives career_age, assigns cohort.   [--execute]
    python scripts/classify/cohort_classification_v2.py --ta nsclc --execute
    #     GATE: new HCPs spread across rising_eligible/established/community, NOT 100% community. career_age 0..~50.

### 7. SCORE — via the dispatcher (--ta selects TA + methodology)
    python scripts/score/rising_score.py --ta nsclc --execute
    # Dispatches by the TA's rising_model. momentum (NSCLC) → 5-script chain → hcp_rising_star_ranks_v3.
    #   emergence_composite (AD) → emergence + rising_composite → hcp_rising_composite_v1.
    # ~70-90 min for momentum (two whole-graph centrality windows are the long poles). Fail-fast per step.
    # VERIFY: count(hcp_rising_star_ranks_v3 WHERE new HCPs) > 0.
    # (Established scoring is a separate chain / future established_score.py dispatcher — TA-agnostic, run when needed.)

### 8. THE DIFF (the deliverable) — capture BEFORE (before step 7!) and AFTER on the CORRECT table
    # BEFORE (capture BEFORE running step 7, or the board is overwritten):
    $env:PYTHONIOENCODING="utf-8"
    python scripts/utilities/run_sql.py "SELECT h.first_name,h.last_name,r.us_rank,r.rising_star_raw,r.momentum_component,r.visibility_component,r.archetype FROM hcp_rising_star_ranks_v3 r JOIN hcps_v2 h ON h.id=r.hcp_id WHERE r.therapeutic_area_id='<TA_ID>' AND r.country='US' ORDER BY r.us_rank LIMIT 30" > nsclc_rising_board_BEFORE.txt
    # AFTER (same query → _AFTER.txt), then compare: do top ranks hold? do new rising HCPs appear? any movement?
    # NOTE: reingest_diff.py currently points at the WRONG table (hcp_score_ranks_v2). Repoint it to
    #   hcp_rising_star_ranks_v3 + hcp_established_ranks_v3 before relying on it (TODO).

### STAGE ORDERING (hard dependencies)
ingest → affected → tagging → Step F → 9b → DEDUP → career chain (6a→6b→6c→6d) → score → diff.
Career MUST be after dedup (R1). 9b after Step F (updates rows F created). Capture BEFORE-snapshot before step 7.
