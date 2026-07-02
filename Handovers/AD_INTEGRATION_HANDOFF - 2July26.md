# AD Integration — Handoff to Fresh Session

**Created:** July 2, 2026
**Purpose:** Resume Atopic Dermatitis (AD) integration into FieldMark v2 cleanly, after a two-day session that got the raw data in but discovered a fundamental architectural mismatch at the end.
**How to use:** Read this whole doc, then read the authoritative source docs (Section 0). Do NOT start executing pipeline steps until the core architectural decision (Section 4) is made. Verify all state claims below against the database yourself — some are from a long, error-prone session.

---

## 0. Authoritative source docs — read these first, in this order

The pipeline/backend was effectively **frozen after late May 2026**; work moved to the frontend after that. This means the late-May docs are not stale — they are the *current* description of the pipeline. Read, in order:

1. **`day_2_launch_-_21May26.md`** — the authoritative v2 build handoff. Contains the 5 final architectural decisions, the exact launch sequence, and the Day-1 bug lessons. This is the keystone.
2. **`HANDOVER - 28May26.md`** — one week later; likely the true end-of-pipeline-work state. NEWEST dated handover. Read for anything that supersedes the Day 2 doc.
3. **`SCRIPT_CATALOG - 28May26.md`** — authoritative "which scripts exist and what they do" as of May 28. Use to confirm whether a script exists before running it.
4. **`TECH_DEBT - 28May26.md`** — known gaps as of end-of-pipeline. May already list the AD-relevant holes.
5. Supporting: `INGESTION_README.md`, `hcp_dedup_prevention_addendum.md`, `hcps_schema_notes.md`, `TA_Expansion_Playbook.md`.

**The `28May26` HANDOVER / SCRIPT_CATALOG / TECH_DEBT trio is the real "end of pipeline work" marker.** Nothing dated in June exists among the pipeline docs. After that, everything is frontend.

### Verify the freeze from version control (don't trust filesystem timestamps)

The laptop's file `LastWriteTime` stamps are synthetic — everything shows the clone time (5/29/2026), not real authoring dates. Use git for the truth:

```powershell
# Last real commit that touched the pipeline scripts — should be late May if frozen
git log -1 --format="%ai %s" -- scripts/ingest/ scripts/enrich/

# Real authoring dates of the docs
git log --diff-filter=A --format="%ai %H" -- "**/*.md" | Sort-Object
```

If the first command returns a late-May date (ignoring this session's AD commits), "pipeline frozen after May" is proven, and the Day 2 / May 28 docs are authoritative-current.

---

## 1. The headline

AD raw data is ingested and OpenAlex-enriched. But the AD HCPs were created the **wrong way** — via a PubMed-first path (`pubmed_pipeline.py`) that creates HCP rows during ingestion. The v2 architecture explicitly forbids this. Its single most important design decision (Decision 2 in the Day 2 launch doc) is that **publication ingestion must NOT create HCP rows**; HCP identity is resolved afterward, OpenAlex-first, via Step C from the author inventory.

**This is now CONFIRMED from git, not suspected** (see Section 0a). The pipeline was finished in late May, was pure-frontend work through June, and was formally archived June 30. A canonical, v2-ready, publication-only ingester — **`ingest_publications.py` (commit `ca0fd77` added its `--target-version v2` flag)** — already existed. `pubmed_pipeline.py`, built/hardened during this session (July 1–2), was a **detour**: a parallel script that reintroduces the exact v1 HCP-conflation pattern v2 was built to eliminate.

**The fix is therefore simpler than a re-architecture: get back on the road that already existed.** Use `ingest_publications.py` for publications, then Step C for HCP creation. Do not keep building on `pubmed_pipeline.py`.

---

## 0a. Git evidence (the freeze and the detour are proven)

Ran on July 2, 2026:

```
git log --format="%ai %s" --after="2026-05-28" --before="2026-07-01"
```
Result: all of June 26–30 is frontend work (demo page, narrative rendering, chart hit-targets, tooltips, copy). The only pipeline-related June commit is **June 30: "Archive superseded scripts... and completed hepatology workstream"** — i.e., putting the finished pipeline to bed. → **Pipeline frozen late May; frontend June; archived June 30.**

```
git log --oneline --all -- "*ingest_publications.py"
```
Result includes **`ca0fd77 ingest_publications.py: add --target-version flag for v2 routing`**. → The canonical v2 publication-only ingester already exists and is v2-ready.

Conclusion: `pubmed_pipeline.py` (this session's July 1–2 work) is a wrong turn. The paved road is `ingest_publications.py` → inventory → Step C.

---

## 2. What is actually DONE and good (verify each)

- **AD publications in `publications_v2`:** ~47,850 rows tagged with AD's `source_therapeutic_area_id`.
  - Verify: `SELECT COUNT(*) FROM publications_v2 WHERE source_therapeutic_area_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1';`
- **AD publication↔TA links in `publication_therapeutic_areas_v2`:** ~47,850.
- **OpenAlex DOI enrichment done:** 46,279 of the AD publications have `authorships` JSONB populated (1,571 without — likely no DOI). This is the data Step A/inventory reads.
  - Verify: `SELECT COUNT(*) FILTER (WHERE authorships IS NOT NULL) FROM publications_v2 WHERE source_therapeutic_area_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1';`

**No re-ingestion of PubMed or OpenAlex is needed.** The expensive external pulls are complete and correct.

AD UUID: `9e4139d2-e062-4a58-8728-cdabb2d7dca1`
Immunology parent UUID: `4cf07827-ff1c-451e-832e-0e0a14ea9c86`

---

## 3. What is WRONG

### 3a. AD HCPs were created PubMed-first (the v1 anti-pattern)

**Strongly suspected root cause of the whole detour:** the pipeline was frozen after late May with `ingest_publications.py` as the canonical, publication-ONLY ingester (it explicitly does not create HCP rows). This session instead used/built `pubmed_pipeline.py`, which **creates ~191,000 HCP rows in `hcps_v2` during ingestion** from PubMed author strings. That is very likely a wrong turn — a script that either duplicates `ingest_publications.py` or reintroduces the exact v1 pattern v2 was built to kill.

**First thing to check in the fresh session:** does `ingest_publications.py` already handle AD ingestion correctly (publication-only, `--target-version v2`, TA-tagged)? If so, `pubmed_pipeline.py` should probably be abandoned entirely, AD re-ingested via `ingest_publications.py`, and HCPs created via Step C — the paved road that already existed. Confirm against `SCRIPT_CATALOG - 28May26.md`.

Per the Day 2 launch doc, Decision 2:

> "V2's ingest_publications.py does NOT create HCP rows... HCP identity resolution happens AFTER ingestion via OpenAlex-driven Step B/C. This is the single most important architectural shift in v2 and it solves the Gulley/Shoji/Hwu duplication problems systemically."

PubMed-first HCP creation is exactly the conflation problem (Shoji, Zhang Wei, etc.) that v2 was built to eliminate. These 191K AD HCPs are:
- Not linked to OpenAlex authors (no rows in `hcp_openalex_authors_v2`)
- Likely heavily duplicated / conflated
- Created without the at-write-time dedup the prevention addendum specifies

Verify the count and linkage gap:
- `SELECT COUNT(*) FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1';` (~191,723 last seen)
- These HCPs have zero rows in `hcp_openalex_authors_v2`.

### 3b. `openalex_author_inventory` is stale

The inventory (239,306 rows) was last built May 2026 and does not include AD's OpenAlex authors — even though those authors are sitting in `publications_v2.authorships` now. Step B matching against this stale inventory is why an earlier match attempt produced ~90% no-match.

### 3c. `run_step_b_matching.py` diverges from the v2 model anyway

Step B *matches existing HCPs* to inventory. But in the correct v2 flow, HCPs are *created from* inventory by Step C — Step B is only meant to run afterward for Workstream B (NPPES community) HCPs needing linkage. Matching PubMed-first HCPs via Step B is not the intended path.

---

## 4. THE DECISION (now largely settled by git evidence)

Section 0a proves `ingest_publications.py` is the canonical v2 ingester and `pubmed_pipeline.py` was a detour. So **Option A is the path** — the only real remaining choice is whether re-ingesting AD publications via `ingest_publications.py` is needed or whether the existing `publications_v2` AD rows are already fine (they were written by the detour script but may be structurally identical — verify).

### Option A — Conform to the v2 model (CONFIRMED correct)
1. Verify AD publications in `publications_v2` are structurally sound (row-per-publication, `authorships` populated). If yes, no publication re-ingest needed. If not, re-ingest via `ingest_publications.py --target-version v2` (NOT `pubmed_pipeline.py`).
2. **Delete the ~191K PubMed-created AD HCPs** from `hcps_v2` (+ their `hcp_therapeutic_areas_v2` / `publication_authors_v2` rows). FK-trace and back up first (Section 8b, step E).
3. Run the **canonical v2 sequence** (from Day 2 launch doc):
   ```
   python inventory_openalex_authors.py --target-version v2 --truncate
   python run_step_c_create_hcps.py --target-version v2 --dry-run --limit 100
   python run_step_c_create_hcps.py --target-version v2
   python career_enrichment_from_clusters.py --target-version v2 --dry-run --limit 10
   python career_enrichment_from_clusters.py --target-version v2
   ```
   Step C creates AD HCPs correctly — OpenAlex-first, clustered, linked, deduped.
4. TA tagging: HCPs created via Step C need AD tags. The Day 2 doc says v2 Step C does NOT tag TAs; a separate `ta_tagging_rebuild.py` was planned — **verify it exists** (Section 8b, step C).

**Retire `pubmed_pipeline.py`** — do not build on it further. Its useful hardening (EFetch pagination, retry logic) could inform `ingest_publications.py` if that script ever needs it, but the HCP-creation behavior is the whole problem.

### Option B — (no longer recommended; kept for record)
Keep the PubMed-first HCPs and retrofit at-write-time dedup + reconciliation. Rejected because git confirms the canonical publication-only path already exists; there's no reason to fight the architecture.

---

## 5. Canonical v2 pipeline order (reference, from Day 2 launch doc)

1. `ingest_publications.py` — publications only, **no HCP creation** (AD used a pipeline that violated this)
2. `openalex_pipeline.py --target-version v2` — DOI enrichment → populates `authorships` (DONE for AD)
3. `inventory_openalex_authors.py --target-version v2 --truncate` — build inventory from authorships
4. `run_step_c_create_hcps.py --target-version v2` — **create HCPs from inventory clusters** (OpenAlex-first)
5. `career_enrichment_from_clusters.py --target-version v2` — total_career_pubs, first_pub_year
6. `run_step_b_matching.py --target-version v2` — only for Workstream B (NPPES) HCPs needing linkage, AFTER Step C
7. `ta_tagging_rebuild.py` — assign TAs by publication evidence (≥3 pubs/TA). **Verify this script exists.**
8. NPPES / Open Payments / Medicare aggregators (`--target-version v2`)
9. `scoring_pipeline.py` — composite/normalized/tier scoring (powers everything downstream)
10. `generate_narratives_v2.py`
11. Frontend cutover / TA enablement

Runtime notes from the doc: inventory ~30 min, Step C ~1–2 h, career enrichment ~6 h. Plan a long window.

---

## 6. Known gotchas (from schema notes + Day 2 doc)

- **HCP↔OpenAlex truth lives in `hcp_openalex_authors_v2`,** not `hcps_v2.openalex_author_id`. Join through the link table. Do not add a UNIQUE constraint on `hcps_v2.openalex_author_id` (one OpenAlex ID can map to multiple HCPs — ~4.6% misattribution; one HCP can have multiple IDs from fragmentation).
- **Case-insensitive lookups:** use `last_name_lower` / `state_lower` generated columns with `.eq()`, never `ILIKE` on raw columns (Supabase statement timeouts — 220x slower).
- **Shared tables stay hardcoded** (not `_v2`-routed): `therapeutic_areas`, `openalex_author_inventory`, `nppes_org_to_ror`, `ror_to_country`, `canonical_hcps_snapshot`, `therapeutic_area_ingestion_config`.
- **Partial-column updates:** use `.update().eq()`, not `.upsert()` (upsert fails NOT NULL on insert path).
- **`table_exists()` in the archived Step scripts** checks `select("id")`, which fails on v2 tables lacking an `id` column (e.g. `hcp_openalex_authors_v2` has composite PK). If reusing archived scripts, this needs fixing.
- **Ingestion-time dedup prevention was never implemented** (INGESTION_README). Any HCP-creating ingestion re-introduces duplicates and requires cleanup passes afterward. This is the core reason Option A (don't create HCPs at PubMed ingestion) is cleaner.

---

## 7. v1 vs v2 orientation (important — a full session was lost to this)

- **v2 is canonical.** Frontend reads v2 (`hcps_v2`, and v3 rank tables downstream). `pubmed_pipeline.py` as used this session wrote to **v1** on the first attempt, then to **v2** on the corrected run. There may be **duplicate AD data in v1** from the failed first attempt — verify and ignore/clean v1 as needed; v1 is legacy.
- `DATABASE_URL` in `.env` gives direct Postgres access (needed a VPN on a hospital guest network — port 6543 was blocked). A `scripts/utilities/run_sql.py` helper was built this session for terminal SQL when the Supabase web dashboard was inaccessible.

---

## 8. Recommended first actions for the fresh session

1. **Verify the state claims in Sections 2–3** with direct SQL. Don't trust this doc blindly; it's from a long, error-prone session.
2. **Read `day_2_launch_-_21May26.md` fully.** It is the authoritative v2 build handoff and contains the exact launch sequence, the 5 architectural decisions, and the Day-1 bug lessons.
3. **Make the Section 4 decision (Option A vs B).** Everything else depends on it.
4. If Option A: back up, then make `pubmed_pipeline.py` publication-only, delete the PubMed-created AD HCPs, and run the canonical inventory→Step C→career sequence.
5. **Confirm `ta_tagging_rebuild.py` exists** (Day 2 doc lists it as "to be written"). Without it, Step C-created HCPs won't get AD tags. This may be a gap to fill.

---

## 8b. Pre-flight verification checklist (run BEFORE executing anything)

Today's session repeatedly ran scripts that crashed on v1-schema assumptions and misread state. Do this verification pass first — it converts "right direction" into "safe to execute." None of these change data.

**A. Confirm the pipeline freeze (proves the docs are current):**
```powershell
git log -1 --format="%ai %s" -- scripts/ingest/ scripts/enrich/
```
Expect a late-May date (ignore this session's AD commits).

**B. Confirm the canonical ingester and whether pubmed_pipeline.py is a detour:**
- Read `SCRIPT_CATALOG - 28May26.md` for `ingest_publications.py` vs `pubmed_pipeline.py`.
- `python scripts/ingest/ingest_publications.py --help` — does it take `--ta` / `--target-version v2` and is it publication-only?

**C. Confirm `ta_tagging_rebuild.py` exists (Day 2 doc listed it as unwritten):**
```powershell
Get-ChildItem -Recurse -File -Filter "ta_tagging_rebuild*.py" | Select-Object FullName
```
If absent, this is a script to write before AD HCPs can be TA-tagged.

**D. Dry-run Step C against current data to surface v1-column landmines early** (the archived Step scripts had `table_exists` checking `id`, plus `openalex_author_id` / `nppes_organization_name` references that don't exist in v2 — Step B needed 4 rounds of fixes for these; Step C likely needs the same):
```powershell
python run_step_c_create_hcps.py --target-version v2 --dry-run --limit 20
```
Fix column issues in dry-run before any real run.

**E. Before deleting the 191K PubMed-created AD HCPs (if choosing Option A), trace what references them:**
```sql
-- Foreign-key references into hcps_v2 (know what cascades / breaks before deleting)
SELECT tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'hcps_v2';
```
Also take a manual Supabase backup point before any delete.

**F. Verify AD state claims** in Sections 2–3 with direct SQL (counts have been misread this session).

Only after A–F come back clean should the fresh session execute the inventory → Step C → career sequence.

---

## 9. Open questions to resolve

- Does `ta_tagging_rebuild.py` exist and work for v2? (Day 2 doc had it as unwritten.)
- Is there duplicate AD data in the v1 tables from the first failed ingestion run? Clean or ignore?
- Does `pubmed_pipeline.py` duplicate `ingest_publications.py`? If `ingest_publications.py` is the canonical publication-only ingester, AD may simply need to be re-run through *that* script's TA path rather than through `pubmed_pipeline.py` at all. Worth checking whether `pubmed_pipeline.py` should exist as a separate script or was a wrong turn.
- Validation targets for AD once scored: Emma Guttman-Yassky, Jonathan Silverberg, Eric Simpson, Lawrence Eichenfield, Amy Paller, Andrew Blauvelt, Robert Bissonnette, Diamant Thaci, Mette Deleuran. If Guttman-Yassky isn't top-ranked AD Established, something upstream is wrong.

---

*End of handoff.*
