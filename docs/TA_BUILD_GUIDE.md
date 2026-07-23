# Building a New Therapeutic Area — Step-by-Step Guide
**Audience:** a team standing up a new TA (e.g. Alzheimer's disease) on an isolated branch.
**What this is:** the operational runbook — commands, order, and what to watch for. Distilled from
`TA_NEW_PLAYBOOK.md` (the full 898-line canonical source) + `TA_BUILD_DEBT.md` + the working reingest
pipeline. When this guide and an older doc conflict, the full playbook wins; when the playbook and the
live code conflict, **the code wins — read it first.**

> **`[VERIFY]`** marks a handful of exact flag/column names to confirm against the live scripts before
> running. They're flagged rather than guessed because a wrong command is worse than a checked one.

---

## The one idea that matters most
FieldMark is a pipeline of faithful transformations on top of a **retrieval definition**. Every
downstream step (enrich → create HCPs → tag → score → narrate) processes whatever retrieval decides is
"in scope," without complaint.

> **The ingestion query is the root of the dependency tree. Get it wrong and you don't get a slightly-off
> result — you get tens of thousands of confidently-wrong HCPs.** The AD build proved this: a contaminated
> query produced ~47,850 pubs (only ~24K real) and would have created ~40,000 wrong HCPs.

**Two principles that prevent the disaster:**
1. **Retrieval = disease identity ONLY.** The query answers exactly one question: *"Is this paper about
   the disease?"* Build it from disease terms only (MeSH anchors, disease names, historical synonyms,
   spelling/age/severity variants). **NEVER** put drugs, mechanisms, cytokines, cell types, or pathways
   in the retrieval query — modern drugs/mechanisms are pan-indication (`dupilumab` pulls asthma, EoE,
   CRSwNP; `IL-13 AND dermatitis` pulls asthma papers that merely mention AD). Those belong in the
   **enrichment** layer, extracted *after* retrieval.
2. **Tag pubs ONLY from the retrieval query's own PMID result — NEVER by author graph.** A paper is
   tagged to a TA because that TA's PubMed query returned it. Never tag a paper because a co-author is
   already TA-tagged — that circular guilt-by-association dragged diesel-exhaust and porcine-encephalitis
   papers into AD. The canonical ingester is PMID-driven; keep it that way.

---

## The data model (don't violate this)
- **One canonical identity row per PERSON** in `hcps_v2` (name, NPI, ORCID, institution). Dr. Smith is
  ONE row no matter how many TAs she's in. Never duplicate a person into per-TA HCP rows.
- **All intelligence hangs off her, scoped per-(HCP, TA).** Scores, TA tags
  (`hcp_therapeutic_areas_v2`), pub links, narratives — each carries a `therapeutic_area_id`.
  "Dr. Smith in NSCLC" and "Dr. Smith in Alzheimer's" are the SAME identity row with SEPARATE per-TA
  intelligence beneath her.
- **`openalex_author_inventory` stays UNIFIED and cross-TA** — one row per author, `corpus_pub_count` =
  total cross-TA career. It's the identity/dedup substrate; do NOT partition it per-TA.
- **TAs are firewalled** (query-time scoping). A new TA must not leak into or mutate another TA's data.

---

## Isolation rules (you're on a branch building in parallel)
- **NSCLC is the frozen reference TA.** It works end-to-end; treat it as both template and regression
  oracle. Every step = "make the new TA do what NSCLC does, WITHOUT changing NSCLC byte-for-byte."
- Your writes must be **TA-scoped**: everything you insert carries your TA's `therapeutic_area_id`.
- The shared substrate (`hcps_v2`, `openalex_author_inventory`, `publications_v2`) is cross-TA by
  design — you'll add rows, but you must never delete/rewrite another TA's rows. Double-guard every
  delete predicate (TA-tag AND date) so a shifted assumption can't hit protected rows.
- Before merging back: confirm NSCLC's cohort counts / top-KOL rankings are unchanged (regression check).

---

## STEP 0 — Create the TA + author the retrieval query (the make-or-break step)
Spend most of your care here. Everything downstream depends on it.

### 0.1 Create the TA row
Create the therapeutic_area row (get its UUID — you'll use it everywhere). `[VERIFY]` the exact table/
columns:
```sql
-- confirm columns first:
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='therapeutic_areas' ORDER BY ordinal_position;
```

### 0.2 Author the query in TIERS (retrieval = Tiers 1–3 ONLY)
- **Tier 1 — Canonical disease:** MeSH disease anchor + primary name(s). (e.g. "Alzheimer Disease"[Mesh]).
- **Tier 2 — Historical synonyms:** older/alternate names for the disease.
- **Tier 3 — Variants:** age (early-onset/late-onset), severity, spelling (British/American),
  common misspellings, tight logical expansions.
- **Tier 4 — Mechanisms (amyloid, tau, ApoE, neuroinflammation…): DO NOT SEARCH** → enrichment.
- **Tier 5 — Drugs (lecanemab, donanezil, aducanumab…): DO NOT SEARCH** → enrichment.
  (Removing bare drugs does NOT cost recall: a drug-in-disease paper contains the disease term and is
  caught by the anchor.)

**Broad-common-term fallback** (if the disease has a broad term that alone is noisy) — anchor it:
```
(dementia[tiab] AND (Alzheimer OR "senile" OR amnestic OR "cognitive decline"))   -- illustrative; tune
```
so you catch disease papers titled with only the broad term while excluding sibling conditions
(vascular/Lewy-body/frontotemporal dementia, unless you intend to include them).

### 0.3 Run ALL validation gates BEFORE ingesting (none write data)
1. **Count check** — single ESearch, `retmax=0`, over the date range. Sanity-check magnitude.
   ("Big" ≠ "contaminated" — verify which.)
2. **Decomposition** — remove broad clauses; confirm the disease core dominates the volume (AD: core
   terms alone = 92% of total → clean).
3. **Contamination-shed test (the real proof)** — confirm KNOWN papers resolve correctly:
   `term = (<your query>) AND <probe>`:
   - known cross-indication contaminant → **0** (e.g. a pure-asthma drug trial)
   - known in-disease paper → **included**
   - a validation-target KOL's known papers → **included**
4. **Windowed-sum reconciliation** — the ingester sums per-window ESearch counts (not deduped), so its
   "PMIDs found" will exceed the true distinct count. Reproduce the windowed sum of your query to confirm
   the ingester's bigger number is a windowing artifact, not query broadening.

### 0.4 Query optimization (earn every clause)
For each clause: remove it → re-run count → record unique PMIDs lost → keep only if it earns meaningful
unique recall. (AD compressed ~30 clauses → ~15–18 with negligible loss.)

### 0.5 Write the ingestion config row
The canonical ingester reads its query from the **`therapeutic_area_ingestion_config` DB table**
(`pubmed_query` column), NOT the `config/therapeutic_areas/*.json` files (those were an old detour path).
`[VERIFY]` current column names, then:
```sql
INSERT INTO therapeutic_area_ingestion_config
  (therapeutic_area_id, pubmed_query, pubmed_days_back, pubmed_max_results, is_active, is_visible_in_ui)
VALUES ('<TA_UUID>', '<validated query>', 3650, 60000, true, false);
```
- `pubmed_days_back = 3650` (10 yr — matches NSCLC/Hep; the column DEFAULT of 1460/4yr is WRONG for us).
- `pubmed_max_results` = a ceiling comfortably above your validated count.
- `is_visible_in_ui = false` until the build is validated (don't surface a half-built TA).
- ⚠️ The OTHER config columns (`openalex_concept_ids`, `openalex_min_works_count`, `nppes_taxonomy_codes`,
  `ctgov_condition_filters`, `scoring_weights`, `indication_keyword_filters`) are needed by LATER stages —
  author them before those stages run.

---

## STEP 1 — Curate the tagging concept set (`curated_ta_concepts`)
TA tagging scores each HCP's publications' OpenAlex concepts against a curated per-TA concept set.
This is a **DIFFERENT artifact from the retrieval query** and from the disease ontology:
- **Disease ontology** = biological truth (what the disease *is*).
- **Tagging set (`curated_ta_concepts`)** = the optimized vocabulary for the *current* classifier — a
  concept belongs here only if it's BOTH disease-relevant AND empirically effective at tagging under
  OpenAlex concept-scoring.
- **Enrichment ontology** = scientific characterization (drugs/mechanisms) — lives elsewhere.

**Curation procedure (allowlist-first, empirical):**
1. Rank OpenAlex concepts by frequency across your CLEAN corpus at score ≥ 0.4, level ≥ 2.
2. Allowlist-curate: deliberately accept disease-specific concepts. OpenAlex SUGGESTS; you decide.
3. Denylist semantic collisions (OpenAlex maps "Type 2" to Type-2-diabetes / receptor-type-2, etc.).
4. Verify effectiveness by DISTRIBUTION not mean: `COUNT(*) FILTER (score>=0.6 / >=0.8)`. A core concept
   that scores weak/rare in OpenAlex → mark **Dormant** (keep in ontology, exclude from tagging), don't
   discard it (prevents silent recall loss).
5. Reject other diseases (they're diseases, not diagnostic concepts) and OpenAlex junk.
6. Target **~30–50 concepts**, all level ≥ 2 (Hep 46, NSCLC 37, AD 23).

**Tuning philosophy:** membership stable, **weights are the knob**. After the first tagging run, calibrate
weights on real true/false positives — don't pre-guess membership.

---

## STEP 2 — Run the pipeline
Two ways to run, depending on how much the orchestrator has been generalized for multi-TA:

### Path A — the orchestrator (preferred if your TA is wired into it)
`reingest_cycle.py` runs the whole chain (ingest → OpenAlex enrich → flatten → inventory → create HCPs →
affected → tag → Step F → authorship → dedup → career → cohort → score). **Always `--dry-run` first.**

> Stage 1 of the orchestrator is `pubmed_pipeline.py`, which — like `ingest_publications.py` in Path B —
> now persists **publications only** (`publications_v2` + `publication_therapeutic_areas_v2` +
> `source_therapeutic_area_id` + raw `pubmed_authorships`). It does NOT create `hcps_v2` or write
> `hcp_therapeutic_areas_v2`. HCP identity is minted later by `create_hcps_v2.py` (stage 2) from the
> OpenAlex inventory; TA tags come from `ta_tagging_rebuild_v2.py` (stage 4). The orchestrator always
> passes `--reset-checkpoint` so stage 1 re-writes every cycle (resuming a stale checkpoint dropped the
> batch — the old name-based-HCP loss).
```powershell
# DRY RUN FIRST — prints the full plan, writes nothing:
python scripts/reingest_cycle.py --ta <slug> --dry-run

# then a real, windowed run:
python scripts/reingest_cycle.py --ta <slug> --mindate YYYY/MM/DD --maxdate YYYY/MM/DD --execute
# or --days N for a rolling window
```
- `--resume-from <stage>` re-enters after a failed step (reuses run-ids/files from the work dir).
- ⚠️ The orchestrator was hardened on NSCLC; a NEW TA may hit hardcoded-NSCLC assumptions
  (`[VERIFY]` — see TA_BUILD_DEBT: ~246 hardcoded NSCLC refs across ~74 frontend files, plus substrate
  scripts using Python constants instead of per-TA config). Expect to generalize a few things.
- 🛑 **BLOCKER for a brand-new TA — `rising_score.py` (stage 9) is MAP-DRIVEN, not config-driven.**
  It probes for a `rising_model` / `scoring_model` column on `therapeutic_areas` and
  `therapeutic_area_ingestion_config` — **those columns do not exist**, so every probe fails silently and it
  falls back to a hardcoded map in the script:
  `RISING_MODEL = {"nsclc": "momentum", "atopic-dermatitis": "emergence_composite"}`.
  **A TA that is not in that map hits "Refusing to guess" and ERRORS at stage 9.** So before your first
  full run: either add your TA to that map (quick), or — better — add + populate the DB config column and
  retire the map (the real fix; log it in TA_BUILD_DEBT). Decide which rising model your TA should use
  (`momentum` vs `emergence_composite`) deliberately; they are different scoring chains.

### Path B — the canonical manual sequence (source of truth for what each stage does)
If the orchestrator isn't yet wired for your TA, run the stages in this exact order. **HCP identity is
resolved OpenAlex-first, AFTER publication ingestion — publication ingestion does NOT create HCPs. This
is the single most important architectural rule in v2.**
```
1.  ingest_publications.py --ta <slug> --target-version v2
        → pubs only, writes pubmed_authorships (JSONB). Tags from the ESearch PMID set. NO HCP creation.
2.  openalex_pipeline.py --target-version v2
        → DOI enrichment → populates publications_v2.authorships (the durable asset Step C reads).
        ⚠️ WATCH: a stale `SKIP_DOI_ENRICHMENT=true` in .env silently DISABLES this — the phase that
        writes authorships. If enrichment finishes in ~1s and writes nothing, that env var is the cause.
3.  inventory_openalex_authors.py --target-version v2        (threshold --min-pubs, default 3)
        → builds openalex_author_inventory from authorships. Incremental + identity-preserving.
4.  run_step_c_create_hcps.py --target-version v2 --dry-run --limit 20   (then real)
        → creates HCPs from inventory clusters, OpenAlex-first, deduped. Does NOT tag TAs.
5.  career_enrichment_from_clusters.py --target-version v2   → first_pub_year / total_career_pubs.
6.  ta_tagging_rebuild_v2.py --ta <slug> ... --execute --yes
        → tags HCPs from publication evidence (≥3 pubs/TA) via curated_ta_concepts.
        ⚠️ --execute PROMPTS for confirmation; pass --yes for unattended/orchestrated runs or it HANGS.
7.  run_step_b_matching.py --target-version v2   → ONLY for Workstream B (NPPES community) HCPs, AFTER C.
8.  dedup: dedup_detect.py (read-only → CSV) → review → dedup_merge.py --dry-run → --execute.
        ⚠️ Merge BEFORE deriving career metrics. Required especially for international TAs.
9.  rebuild_publication_authors_v2.py (Step F) — links pubs↔HCPs.
        ⚠️ CANONICAL INVOCATION: scope to ALL HCPs tagged to the TA, not just newly-created.
        Export SELECT hcp_id FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id=<TA> to a file,
        run with --hcp-ids-file <file> --execute. DO NOT use --only-new-hcps — it under-links
        pre-existing cross-TA HCPs (this silently buried ~34% of AD's established cohort).
9b. Derive authorship position (is_first_author / is_senior_author) from the authorships JSON, right
        after Step F. REQUIRED — the scientific scorer's senior/first signals are all-zero without it.
10. NPPES / Open Payments / Medicare aggregators --target-version v2.
        ⚠️ Open Payments: verify the top_companies write path populates hcp_open_payments_top_companies_v2,
        not just summary/by_ta (it was missed in a prior first pass).
11. career-metric re-derivation ON MERGED identities (total_career_pubs + career_first_pub_year_v2,
        sustained-onset). MUST run AFTER dedup, not before.
11b. cohort_classification_v2.py --ta <slug> --execute → established / rising_eligible / too_young /
        community. CLASSIFY before cohort-scoring.
12. scoring: rising (scoring_pipeline) + established (publication_leadership/network/pharma) + community.
13. generate_narratives_v2.py --target-version v2   (⚠️ --target-version v2 REQUIRED — default writes v1).
14. Frontend cutover / TA enablement (is_visible_in_ui = true) — only after validation.
```
Runtime: inventory ~30 min; Step C ~1–2 h; career enrichment ~hours; scoring/centrality ~30–40 min.
Plan a long window.

---

## STEP 3 — Validate against known KOLs (the acceptance test)
Pick 8–12 canonical KOLs for your disease BEFORE you build (your "Heymach/Guttman-Yassky" anchors). After
scoring, they must surface as top Established. **If your known #1 KOL is not top-ranked Established,
something upstream is wrong — stop and trace, don't ship.**
- Confirm cohort distribution is sane (e.g. NSCLC landed ~21% established / ~21% rising / ~56% community).
- Confirm each cohort assignment carries a legible `cohort_reason`.
- Spot-check that top network-influence / rising-star names are real, recognizable disease KOLs.

---

## STEP 4 — Frontend parity (get it rendering like the reference TA)
- Cohort data flows through **RPCs, not table names** — repoint the RPCs, don't just swap tables.
- ⚠️ Expect ~3–4 **TA-scoping bugs** per TA (a query path that drops the TA filter → shows wrong-TA or
  zero data). The recurring pattern: a `taSlug`/`ta_id` not propagated down a nav path.
- **The only real confirmation is verify-in-browser-logged-in.** SQL being right ≠ UI being right.
- Backward-compat guardrail: every change must leave the reference TA (NSCLC) rendering byte-for-byte.

---

## Non-negotiable operating discipline (every hard lesson, condensed)
1. **Read the actual script/schema before running or proposing anything.** Nearly every failure traced
   to acting on an assumption about what a script did or a table contained.
2. **Verify every state claim with SQL — including claims in handoff docs.** (A handoff's "zero OpenAlex
   linkage" was actually 172 real HCPs; a blind delete would have destroyed them.)
3. **Confirm column names via `information_schema` before writing any query.**
   `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='<t>' ORDER BY ordinal_position;`
4. **Inspect JSONB structure before parsing.** OpenAlex author id is nested at
   `authorships[i].author.id` (a URL), not a flat `author_id`. Wrong assumption = silent empty result.
5. **Snapshot before any delete. Trace FKs before any delete. Dry-run the predicate as a COUNT first.**
   Delete child-first, batched, over the direct `run_sql.py` psycopg connection (honors
   `SET statement_timeout`) — NOT the Supabase dashboard (short HTTP timeout rolls back big deletes).
6. **A surprising number is a thread to pull, not a nuisance to dismiss.** ("21,779 authors in both AD and
   NSCLC" was outlandish → pulling it uncovered the whole corpus contamination.)
7. **One step at a time. Verify it worked. Then the next.** Fail-fast beats a long plan on a wrong premise.
8. **`--dry-run` is mandatory; never write on the first run of anything.**

---

## Known footguns (quick reference)
| Footgun | What bites | Guard |
|---|---|---|
| Legacy `hcps` table | Stale; a known false-diagnostic trap | Use `hcps_v2`. Treat legacy as historical. |
| `_v2` vs `_v3` tables | Two authoritative docs disagreed on table names | `information_schema` settles it; the DB wins. |
| `SKIP_DOI_ENRICHMENT=true` in .env | Silently disables authorship enrichment (1s no-op) | Ensure it's off / overridden for the enrich stage. |
| DROP+CREATE loses indexes AND grants | `author_pub_flat` rebuild → permission-denied + full-scan slowness | The build SQL must recreate indexes + `GRANT SELECT ... TO service_role` after CREATE. |
| PostgREST `.neq()` on NULL columns | Excludes ALL rows where the column IS NULL | Handle NULL explicitly. |
| Supabase multi-statement `BEGIN/COMMIT` | Blocks don't reliably persist in the SQL editor | Run each UPDATE/DELETE standalone; verify separately. |
| Insert-only `ingested_at` (default now()) | NOT bumped on upsert → time-scoped purges are safe | Use `ingested_at >= '<date>'` to scope "today's residue." |
| `--execute` interactive prompts | Unattended runs HANG on `input()` | Pass `--yes`; orchestrator sets `stdin=DEVNULL`. |
| Step F `--only-new-hcps` | Under-links pre-existing cross-TA HCPs (~34% of a cohort) | Scope Step F to ALL TA-tagged HCPs via `--hcp-ids-file`. |
| `generate_narratives_v2` default | Writes v1 | Always `--target-version v2`. |
| Stage 1c is CROSS-TA, not TA-scoped | `build_author_flat.sql` DROP+CREATEs `author_pub_flat` over the WHOLE corpus — any TA's cycle transiently rebuilds the shared table for EVERY TA | Never run two TA cycles concurrently. Schedule TA crons sequentially, not in parallel. |
| Running a cycle on an already-built TA | The orchestrator IS TA-agnostic — it will RUN, not fail. It rewrites that TA's cohort rows + rising board and can perform irreversible dedup merges | Treat `--execute` on a live TA as a production mutation. Pre-snapshot `hcp_cohort_classification_v2` + the rising-board table first. |

---

## The end-state you're building toward
A config-driven, gated, orchestrated pipeline where a TA is built from its config row by
`reingest_cycle.py --ta <slug>` with verification gates as code. We're partway there (the orchestrator
works for NSCLC; per-TA parameterization is in progress). Your build both USES the pipeline and helps
prove which pieces still need generalizing — log anything TA-hardcoded you hit into `TA_BUILD_DEBT.md`.

**Sequence to trust an automated run:** manual-verified → parameterized/config-driven → gated →
orchestrated. *Automation without verification gates is not automation; it's an unattended way to corrupt
the database faster.* (The AD build created 191,551 wrong HCPs the manual way once — the automated way
would do it at 3am with no one watching. Gates first.)

---
*Full detail: `TA_NEW_PLAYBOOK.md` (§0–§10, canonical). Work log / open debt: `TA_BUILD_DEBT.md`.
Scoring definitions: `FEATURE_DEFINITIONS_CURRENT.md`. When in doubt, read the live script.*
