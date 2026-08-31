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
(`ta_cycle.py`, stage 1) calls a DIFFERENT script: `pubmed_pipeline.py`.** They now do the same job
but read their query from DIFFERENT places:

| | canonical per this playbook | what the orchestrator runs |
|---|---|---|
| script | `scripts/ingest/ingest_publications.py` | `scripts/ingest/pubmed_pipeline.py` |
| query source | `therapeutic_area_ingestion_config.pubmed_query` (DB table) | `config/therapeutic_areas/<slug>.json` |

**Consequence for a new TA:** authoring the query ONLY in the DB config table (as section 2a instructs) is
NOT enough if you intend to run the weekly orchestrator - `pubmed_pipeline.py` will look for a JSON config
and not find your query. **Populate BOTH** until the two are reconciled, and verify with
`python scripts/ta_cycle.py --operation refresh --ta <slug> --dry-run` before a real run.

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
  - pharma_engagement_scoring.py ..................... ✓ (retrofitted; `--ta` at
        pharma_engagement_scoring.py:159, `@click.option("--ta", default="nsclc")`. Corrected
        2026-08-31: this line read ✗ PENDING while line 645 of this same document already
        invoked the script as `--ta <slug>`.)
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

