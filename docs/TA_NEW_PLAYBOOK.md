# TA_NEW_PLAYBOOK.md — How to Onboard a New Therapeutic Area

**Status:** FOUNDATIONAL — CANONICAL. This document supersedes all prior TA-expansion guidance.
**Created:** July 3, 2026 (during the Atopic Dermatitis / TA #2 build)
**Companion:** `TA_BUILD_DEBT.md` (what the platform still owes to make this fully turnkey)

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
9.  run_step_f_rebuild_publication_authors.py
        → rebuilds publication_authors_v2 linking pubs to the new HCPs.
10. NPPES / Open Payments / Medicare aggregators (--target-version v2)
11. scoring_pipeline.py + established_scoring.py + community_scoring.py
12. generate_narratives_v2.py --target-version v2   (⚠️ --target-version v2 REQUIRED — default writes v1)
13. Frontend cutover / TA enablement (is_visible_in_ui).
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
