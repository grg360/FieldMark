# Building a New Therapeutic Area — Step-by-Step Guide
**Audience:** a team standing up a new TA on an isolated branch.
**What this is:** the operational runbook — commands, order, and what to watch for. Distilled from
`TA_NEW_PLAYBOOK_COMPLETE.md` (the canonical deep reference) + `TA_BUILD_DEBT_COMPLETE.md` + the working
reingest pipeline. When this guide and an older doc conflict, the full playbook wins; when the playbook and
the live code conflict, **the code wins — read it first.**

> **`[VERIFY]`** marks a handful of exact flag/column names to confirm against the live scripts before
> running. They're flagged rather than guessed because a wrong command is worse than a checked one.

> **Revision 2026-08-24.** Sections 0.1, 0.5, and Path B were factually wrong and are corrected below.
> The prior revision stated the DB table was canonical for the retrieval query; it is not. Every claim
> in this revision marked **[verified 2026-08-24]** was read out of the live scripts, not inferred.

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

### 0.1 Create the TA row — FIRST, and read the UUID back
**Order matters. The DB row must exist before the JSON is written**, because the JSON carries the TA's
UUID as a hardcoded literal, not as a slug lookup. [verified 2026-08-24: `pubmed_pipeline.py:1188`,
`therapeutic_area_id = cfg["ta_uuid"]`.] A wrong or invented UUID does not error — it tags every ingested
publication to whichever TA that UUID belongs to, silently.

`[VERIFY]` the exact columns, then insert and read the generated id back:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='therapeutic_areas' ORDER BY ordinal_position;
```
Set `ta_level = 'indication'` for a disease-level TA. Only `indication` is currently consistent between
the JSON and the DB; `specialty`, `broad_ta` and `cross_ta` have already drifted between the two sources
for the TAs that don't run (hepatology, rare-disease). Whatever you choose, set it **identically in both
places**.

Parent for an oncology indication is the Oncology row (`095bc902…`); for immunology, `4cf07827…`.

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

### 0.2b Verify every MeSH anchor by COUNT ARITHMETIC — never by tree diagram
**Added 2026-08-24 during the CRC build. This is the single cheapest defect-prevention step in STEP 0
and it should run for every TA.**

A MeSH term in a query explodes to its descendants by default. That explosion is **silent** — there is no
warning, no log line, and the resulting corpus looks entirely plausible. A single unverified `[Mesh]`
anchor can ingest the exact disease you spent an afternoon deciding to exclude.

**Do not trust a tree diagram, a doc, an advisor, or an LLM for tree positions.** MeSH is re-versioned
annually; branches move. Verify against the live index every build. It costs ten ESearch calls with
`retmax=0`, writes nothing, and takes a minute.

**The instrument: `child[Mesh] AND parent[Mesh]`, as a FRACTION of `child[Mesh]`.**

```
"C"[Mesh]                 → C
"P"[Mesh] AND "C"[Mesh]   → D
```
- **C is a descendant of P** when `D / C ≈ 100%`. Containment is total — a true child returns every one
  of its papers inside the parent, not most of them.
- **C is outside P's branch** when `D / C` is a small fraction. Measured CRC examples: anal/rectal
  returned 7,872/7,872 = 100% (descendant); cecal/colorectal returned 1,173/6,603 = 17.8% (sibling).
- **Always run a positive control** on a pair you have already proven nested, to show the probe detects
  containment when it is present. Without one, a negative result is indistinguishable from a broken test.

**Two tests that look right and fail. Both were tried on the CRC build; neither works.**

| Failed test | Why it fails | Measured |
|---|---|---|
| `parent[Mesh] − parent[NoExp] ≈ child` | Undercounts whenever a lineage is **dual-indexed**. Papers carrying both descriptors sit inside the NoExp set, so the subtraction silently drops them. | Anal/rectal: subtraction gave 6,550 against a true 7,872 — short by 1,322, exactly the dual-tagged count. |
| `parent[NoExp] AND child[NoExp] ≈ 0` means "outside" | **Inert — no discriminating power in either direction.** MeSH indexers assign the most specific applicable descriptor, so a broad+narrow pair from one lineage is rare whether or not they are nested. | Returned 68 for a sibling pair and 92 for a *proven parent-child* pair. Indistinguishable. |

A threshold of "materially non-zero means contamination" is also wrong. Co-indexing produces small
non-zero intersections routinely — exploded Colonic∩Anus returned 256 against anal's 7,872 (3.3%), which
is co-mention, not a branch. **Containment is ~100% or it is not containment.**

**Check BOTH directions. The second one is invisible.**

| Direction | Question | Failure if unchecked |
|---|---|---|
| **Explodes IN** | Does this anchor pull a disease I excluded? | Corpus contamination. Loud once you look — contaminant authors appear on the board. |
| **Sits OUTSIDE** | Is a subsite I need on a *different* branch? | **Silent recall loss.** A whole subsite never ingests. Nothing on any surface tells you it is missing. |

The outside case is why this section exists. Reviewing a query for what it wrongly *includes* is natural;
nobody reviews a query for a branch that was never there. Enumerate the anatomical or clinical subsites the
TA must cover, then prove each one is reachable from at least one anchor — by count, not by assumption.

> **CRC worked example (2026-08-24).** `"Colorectal Neoplasms"[Mesh]` explodes to include hereditary
> syndromes and, via `Rectal Neoplasms`, reportedly to `Anus Neoplasms` — a disease explicitly excluded
> from scope. Separately, `Cecal Neoplasms` reportedly sits on a *different* branch (under intestinal
> neoplasms, not colorectal), so a query anchored only on Colorectal + Colonic + Rectal would silently
> drop cecal papers — and right-sided disease is a live clinical axis in CRC. Both claims were verified by
> the count method above before the query was locked; neither was taken on the strength of a tree diagram.

**Record the verification.** Put the counts and the conclusion in the TA's `pubmed._query_note` field, with
the date. The next person to touch that query — including you in six months — needs to know the tree was
checked and when, or they will re-derive it or, worse, assume it.

### 0.2c Scope by WHO THE RANKING SURFACES, not by taxonomy
When deciding whether an adjacent disease belongs in the TA, the taxonomic question ("is this the same
disease?") is the wrong one. The operative question is: **would the specialists this disease brings in be
correct answers for the user who bought this TA?**

A disease can be biologically adjacent and still be the wrong inclusion, because the investigator graph it
drags in is a different population. Run the test explicitly:

1. Name the specialist types the candidate disease would introduce.
2. Ask whether a Medical Affairs user buying *this* TA would expect those people to rank.
3. If not, exclude — however close the biology.

> **CRC worked example.** Appendiceal cancer borrows heavily from colorectal oncology and shares real
> investigators, so the taxonomic case for inclusion is respectable. It was excluded anyway: it would
> disproportionately surface CRS/HIPEC surgeons, peritoneal-surface specialists and pseudomyxoma
> researchers — genuine experts, wrong answers for a colorectal buyer. Conversely, rectal surgical and
> radiation-oncology literature was *kept*, even though it surfaces surgeons and radiation oncologists
> rather than medical oncologists, because those people are publishing about rectal cancer itself. The
> distinction is the disease the paper is about, not the specialty of its author.

Write the scope decision and its reasoning into the TA's validation-anchors doc before building. A scope
call reconstructed after the board exists is a rationalisation of whatever the board produced.

### 0.2d Architectural constraint — there is no "in the corpus but not ranked" tier
`[verified 2026-08-24]` A publication is in `publications_v2` and TA-tagged, or it is not. If it is in, its
authors become HCPs and are scored. **There is no flag that admits a paper to the corpus while excluding it
from influence.**

This matters because the natural design instinct — "ingest the screening and epidemiology literature but
weight it down" — describes a feature that does not exist. Anything you do not want driving the board must
be excluded **at retrieval**. Do not design a three-tier corpus and discover at stage 12 that the tiers
were never real.

If a TA genuinely needs contextual literature that does not confer influence, that is a schema change
(a `contributes_to_ranking` flag on `publication_therapeutic_areas_v2`) — log it as debt, do not assume it.

### 0.2e Validate every author string BEFORE using it as a measurement
`[added 2026-08-24]` Any test keyed on an author name — a recall proof, a contamination baseline, a
negative control — is worthless until the string itself is proven to resolve. Author-string errors fail in
**both directions** and both look like clean results.

| Failure | What it looks like | Real example |
|---|---|---|
| **False zero** | A malformed string returns 0 and reads as "no contamination" | `Eng CA[au]` matched **1 record in all of PubMed** — Cathy Eng is not indexed with a middle initial. Recording 0 as a baseline would have left a probe watching a term that can never fire. |
| **False pass** | A common name is namesake-inflated, so a `> 0` recall proof passes even if the query missed the real person | `Yoshino T[au]` returns 2,132 lifetime papers. That is not one investigator. |

**The procedure:**
1. Run the string **standalone** first. A count of 0 or 1 means the format is wrong, not that the answer
   is zero.
2. For common surnames, use `[Full Author Name]` (`"Yoshino, Takayuki"[Full Author Name]`). It cut
   Yoshino's pool from 2,132 to 530 and Tie's from 352 to 160.
3. `[Full Author Name]` only covers records from **2002 onward**. Measure that cost rather than carrying
   it as a caveat — for CRC it was 0 papers for Tie and 12 for Yoshino, i.e. nothing.
4. Record both forms in the results table so a zero stays interpretable.

**A recall proof needs a distinctive identifier or it proves nothing.** `> 0` on a common `[au]` string
can be satisfied entirely by a namesake.

### 0.2f The gates test the BOUNDARY. Sample the INTERIOR after ingest, not before.
`[added 2026-08-24]` Decomposition, contamination shed and recall proof all measure what sits near the
edges of the query. A query can pass every one of them and still carry junk in the middle — the CRC shed
sample incidentally found 2 of 25 papers that were not colorectal cancer at all.

**Do not try to sample PubMed's interior pre-ingest.** It cost half a day on the CRC build and was
abandoned. Post-ingest the same question is one SQL query over the corpus in seconds, with a tighter
interval and no pagination problems.

If you ever must sample PubMed directly, the mechanics are unforgiving and all three obvious approaches
fail:

| Approach | Result |
|---|---|
| `retstart` past ~10k | **Capped.** Fails against plain ESearch *and* against the history server, even though the stored set size is exact. EFetch `uilist` returns HTTP 400 at 50k/200k/320k. |
| `datetype=pdat` partition | **Overcounts.** Records carry both electronic and print dates and match two windows — 418,746 against a true 329,274, 27% inflation. |
| `datetype=edat` partition | **Undercounts.** `edat` has a time component, so day-boundary `maxdate` values drop part of each boundary day — 317,613 against 329,274. |
| **PMID-range partition** | **Works.** `({Q}) AND <lo>:<hi>[uid]`, recursively halved until each slice is under the cap. |

Both date failures are **silent** — plausible numbers, no error. The guard that caught them: **assert the
slice sum equals the live count before drawing anything.** Reuse that on any future sampling.

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

### 0.5 Write the config — TWO artifacts, and they do DIFFERENT jobs
**This section was inverted in the prior revision. Read it carefully.**

There are two config surfaces and neither replaced the other. [verified 2026-08-24.]

**`config/therapeutic_areas/<slug>.json` is canonical for RETRIEVAL.** It is the only source the live
orchestrator reads. `reingest_cycle.py:127` maps stage 1 to `scripts/ingest/pubmed_pipeline.py`, which
loads `config/therapeutic_areas/<slug>.json` (`load_ta_config`, :61-71) and takes its query from
`pubmed.global_query` (:1184). **If your query is not in this file, it is not what gets ingested.**

**`therapeutic_area_ingestion_config` (DB) is canonical for VISIBILITY and ENTITLEMENTS.** Its
`is_visible_in_ui` column drives `generate_narratives_v2.py:200-216` and the `live_therapeutic_areas`
view the frontend reads. You still need a row here or the TA gets no narratives and never appears in the
UI.

**The DB `pubmed_query` column is vestigial.** It is not read by any live code path, and it is already
stale for both running TAs — nsclc's DB row is 1,532 chars against the JSON's 2,202 and diverges from the
first term; AD's is 1,432 against 3,507. Editing it changes nothing about what gets ingested. Put a stub
there, or paste the real query with a comment noting it is not authoritative — but never treat it as the
source.

**The JSON keys** (structure is identical across all four existing TAs):
`slug`, `name`, `ta_uuid`, `parent_uuid`, `ta_level`, `pubmed.global_query`, `pubmed.us_query`,
`pubmed.years_back`, `pubmed.max_results`, `pubmed.retrieval.{recall,source,include_reviews,include_letters}`,
optional `pubmed._query_note`, `nppes.taxonomies`, `nppes.description`.

- `pubmed.us_query` is present in every JSON and **read by nothing** — the pipeline prints
  "Ingestion mode: global (geographic filtering deferred to enrichment)". Populate it or don't; it is dead.
- `pubmed.years_back` is in **years**, and it is a **product decision, not a default to copy.** Ten years
  is the shipped precedent: the NSCLC corpus was built at `pubmed_days_back = 3650` and CRC matches it.
  Note the unit differs from the DB's `pubmed_days_back` (days).

> **⚠️ A config value that has never executed is not a precedent.** `nsclc.json` records
> `years_back: null`, which reads like a decision to ingest full history. That path has never run — the
> NSCLC corpus came from the DB config in May 2026, on a ten-year window. Copying `null` onto a new TA
> would have quadrupled the ingest against a precedent that does not exist. **Check what actually
> executed, not what the config says.** `[learned the hard way, 2026-08-24]`
- `pubmed._query_note` is optional and worth writing — nsclc uses it to record the anchor-list rationale.

Now the DB row. `[VERIFY]` current column names, then:
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
  author them before those stages run. Note both running TAs currently hold **empty arrays** here, so
  whatever consumes them is either tolerating empty or not running.

### 0.6 The complete registration checklist
A TA is registered when all six exist. Miss one and the failure is usually silent, not loud.
[verified 2026-08-24.]

| # | Artifact | Where | Notes |
|---|---|---|---|
| 1 | `therapeutic_areas` row | DB | **Create first.** Read the UUID back. |
| 2 | `therapeutic_area_ingestion_config` row | DB | Visibility + narratives. `is_visible_in_ui = false` until validated. |
| 3 | `config/therapeutic_areas/<slug>.json` | repo | **The retrieval query lives here.** `ta_uuid` must match #1 exactly. |
| 4 | `frontend/src/lib/routeSlugs.ts` | repo | `ONCOLOGY_SLUG_TO_LABEL` (or the parent area's map). Parent-area derivation needs no second edit — `parentTaLabelForIndicationSlug()` scans the maps and returns whichever owns the slug. |
| 5 | `frontend/src/lib/taLabels.ts` | repo | `TA_DISPLAY_NAME_BY_SLUG` |
| 6 | `frontend/src/lib/api.ts` | repo | `TA_ID_MAP`. **Not `TAContext.tsx`** — that file only consumes it via `taIdForApiSlug`. |
| 7 | `scripts/score/rising_score.py` | repo | `RISING_MODEL`. **Hard blocker** — stage 9 exits with "Refusing to guess" if the slug is absent. Mature solid tumours take `momentum`; see §34 of the playbook. |

`[paths verified against live code 2026-08-24 — the prior revision named two files that do not hold
these maps.]` Frontend registration is hand-maintained across three files with no single source. All must
agree with each other and with the DB slug.

**Also check for a stale placeholder slug.** `ONCOLOGY_SLUG_TO_LABEL` and `IndicationFilter.tsx` often
already carry an inactive entry for the disease under a *different* slug (CRC found `colorectal` sitting
beside the real `colorectal-cancer`). Two slugs for one disease is the silent-fallthrough pattern this
file's own header warns about: the stale one resolves to a label but misses `TA_ID_MAP`, so it looks valid
and carries no TA id. **Retire the placeholder while it is still inactive** — not at visibility time, when
you will be looking at something else.

**Not TA-keyed, so a new TA needs nothing here:** `config/assets.json` has no TA field at all (its only
TA-shaped column is the NSCLC-specific `nsclc_indication_count`), and `config/congresses.json` keys
`ta_relevance` by slug but currently holds only `nsclc` values across all 15 congresses. Both will need
generalizing if the new TA is to carry assets or congresses — log it rather than assume it works.

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

### THE FIRST BUILD IS NOT A CYCLE — use `--build-mode new`
`[added 2026-08-24]` The orchestrator was written for **incremental** cycles and defaults to a 7-day
window. On a TA with zero papers that silently produces a one-week corpus, then runs eleven downstream
stages against it — HCPs from a handful of papers, tagging on nothing, scoring on nothing, all reporting
SUCCESS.

```powershell
python scripts/reingest_cycle.py --ta <slug> --build-mode new --dry-run
python scripts/reingest_cycle.py --ta <slug> --build-mode new --execute *>&1 | Tee-Object -FilePath logs/<slug>-build-<date>.log
```

What build mode does that a normal run does not:

| Gate | Behaviour |
|---|---|
| **A — window** | Stage 1's window comes from the TA's `pubmed.years_back`, not `--days`. Refuses if `years_back` is null. |
| **B — ceiling** | **Stops after stage 12.** Stage 13 (narratives) is billed, uncapped on rising and community, and must not run against an unvalidated board. Prints the deferred command. |
| **C — confirmation** | Prints the resolved window, a live ESearch projection, the existing publication count, the not-resumable warning and the cross-TA blast radius. Requires an interactive `y`. |
| **D — populated TA** | Refuses if the TA already holds publications. `--force-rebuild` overrides. |

**Deferred narratives run afterwards, WITHOUT the flag:**
`python scripts/reingest_cycle.py --ta <slug> --execute --resume-from 13`
Passing `--build-mode new` there would suppress the very stage you are resuming for.

### ⚠️ Stage 1 is NOT resumable. Budget for one uninterrupted run.
`run_state.json` is written only *after* stage 1 completes, and `cmd_ingest` always passes
`--reset-checkpoint`. A death at any point means restarting from zero. The CRC build lost two runs to two
different single-point failures before completing — both were real bugs, both are now fixed, but the
pattern will recur. Before starting:

- **Disable the weekly cron.** Two TA cycles must never overlap: stage 1c DROP+CREATEs `author_pub_flat`
  corpus-wide. `Disable-ScheduledTask -TaskName "FieldMark Weekly Reingest (NSCLC)"`.
- **Check sleep settings.** `powercfg /change standby-timeout-ac 0`.
- **Snapshot the tables in the blast radius**, one statement at a time — 7b merges globally and 8e
  reclassifies all of `hcps_v2`, so the *existing* TAs are exposed:
  `create table hcp_rising_star_ranks_v3_pre_<slug> as select * from hcp_rising_star_ranks_v3`
  Then **verify each snapshot returned rows.** Multi-statement blocks do not reliably persist in the
  Supabase editor.
- **Tee the output**, and know the log will lag — Python block-buffers to a pipe. Use CPU time and an
  established connection to distinguish "buffering" from "hung":
  `Get-Process python | Select-Object Id, CPU, StartTime` twice, thirty seconds apart.

### Cross-TA blast radius — four stages are NOT scoped to your TA
`1b` bills OpenAlex for every `openalex_enriched_at IS NULL` DOI publication across **all** TAs (18,553 at
CRC build time, ~12% of the run's own 1b work). `7b` merges globally. `8e` reclassifies all of `hcps_v2`.
`11` refreshes trials globally.

### Path A — the orchestrator (preferred if your TA is wired into it)
`reingest_cycle.py` runs the whole chain (ingest → OpenAlex enrich → flatten → inventory → create HCPs →
affected → tag → Step F → authorship → dedup → career → cohort → score). **Always `--dry-run` first.**

> Stage 1 of the orchestrator is `scripts/ingest/pubmed_pipeline.py` [verified 2026-08-24:
> `reingest_cycle.py:127`], reading its query from `config/therapeutic_areas/<slug>.json`. It persists
> **publications only** (`publications_v2` + `publication_therapeutic_areas_v2` +
> `source_therapeutic_area_id` + raw `pubmed_authorships`). It does NOT create `hcps_v2` or write
> `hcp_therapeutic_areas_v2` (:15-17).
>
> **Stage 2 creates HCPs** — `scripts/classify/create_hcps_v2.py --ta <slug> --incremental`, writing
> `hcps_v2` + `hcp_openalex_authors_v2`, and NOT tagging TAs [verified 2026-08-24]. Clusters come from
> OpenAlex, not PubMed names, which is why stage 1 grew the 1b/1c/1d OpenAlex sub-sequence that populates
> stage 2's prerequisites. TA tags come later, from `ta_tagging_rebuild_v2.py`.
>
> The orchestrator always passes `--reset-checkpoint` so stage 1 re-writes every cycle (resuming a stale
> checkpoint dropped the batch — 23 vs 368 pubs, proven A/B).
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

### Path B — the manual sequence (READ FOR STAGE SEMANTICS, NOT AS COMMANDS)
⚠️ **This sequence is documentation, not a runbook.** Its entry point,
`scripts/ingest/ingest_publications.py`, is **orphaned** — [verified 2026-08-24] grepping the repo returns
zero references from any `.py`, `.ps1` or orchestrator file. Only docs mention it. It still reads the DB
table's `pubmed_query`, which is why the prior revision of this guide named the wrong config source: the
guide was describing a script nothing calls.

Several other script names below are also stale (`run_step_c_create_hcps.py` is now
`scripts/classify/create_hcps_v2.py`). **Read this list to understand what each stage DOES and in what
order; get the actual commands from `reingest_cycle.py`'s stage map.**

**HCP identity is resolved OpenAlex-first, AFTER publication ingestion — publication ingestion does NOT
create HCPs. This is the single most important architectural rule in v2.**
```
1.  [ORPHANED — see reingest stage 1: scripts/ingest/pubmed_pipeline.py]
        → pubs only, writes pubmed_authorships (JSONB). Tags from the ESearch PMID set. NO HCP creation.
2.  openalex_pipeline.py --target-version v2
        → DOI enrichment → populates publications_v2.authorships (the durable asset Step C reads).
        ⚠️ WATCH: a stale `SKIP_DOI_ENRICHMENT=true` in .env silently DISABLES this — the phase that
        writes authorships. If enrichment finishes in ~1s and writes nothing, that env var is the cause.
3.  inventory_openalex_authors.py --target-version v2        (threshold --min-pubs, default 3)
        → builds openalex_author_inventory from authorships. Incremental + identity-preserving.
4.  [now scripts/classify/create_hcps_v2.py --ta <slug> --incremental — reingest stage 2]
        → creates HCPs from inventory clusters, OpenAlex-first, deduped. Does NOT tag TAs.
        Writes hcps_v2 + hcp_openalex_authors_v2.
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
Pick your anchors **BEFORE you build** and commit them to `docs/<TA>_VALIDATION_ANCHORS.md`. A list
assembled after the board exists cannot test anything — it becomes a description of whatever the ranking
produced.

**Structure the anchors in FOUR groups.** `[pattern established 2026-08-24, CRC build]` A flat list of
"KOLs who should rank high" only tests the loudest failure. The other three groups test failures that
otherwise ship.

| Group | Purpose | What it catches |
|---|---|---|
| **1 — Pass/fail gate** | 6–8 undisputed leaders who must surface top Established | Corpus, identity-resolution, attribution or scoring failure |
| **2 — Falsifiable prediction** | Names you predict rise on *recent* work, not lifetime mass | Whether the platform beats a citation leaderboard |
| **3 — Contamination probes** | People genuinely in your TA who are *also* major figures in an excluded adjacent disease | Retrieval leaking into excluded scope |
| **4 — Negative controls** | Well-known adjacent-disease figures who should NOT rank | Retrieval pulling the broad field rather than the specific disease |

**Group 1 is a hard gate.** If a Group 1 anchor is missing, stop and trace upstream. **Do not tune the
scorer to make them appear** — a scorer adjusted to rescue a broken corpus hides the defect instead of
fixing it, and the hidden version is worse because it now looks right.

**Group 2 only counts if written down first**, and you must read the *component* scores, not the rank. A
Group 2 name that rises on visibility with flat momentum looks like success and means the opposite: the
board is measuring output volume wearing a different label.

**Group 3 needs a number measured before ingest.** "Her work in the excluded disease shouldn't inflate her
score" is only checkable against a pre-ingest publication count you recorded. Get each probe's
in-scope-only and excluded-disease publication counts from PubMed *before* the first run; after ingest,
their TA-tagged count should approximate the in-scope figure, not the total.

**Structural cautions.** Non-clinical anchors — translational scientists, cooperative-group
biostatisticians — may score oddly for reasons that are not defects (different co-authorship community,
senior-author breadth without a personal research program). Keep them as watch items outside Groups 1 and
2, and **check component scores before concluding the corpus is wrong.**

Then the cohort-level checks:
- Confirm cohort distribution is sane (e.g. NSCLC landed ~21% established / ~21% rising / ~56% community).
- Confirm each cohort assignment carries a legible `cohort_reason`.
- Spot-check that top network-influence / rising-star names are real, recognizable disease KOLs.
- Confirm any subsite you verified as reachable in §0.2b actually produced HCPs.

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
| **`ta_uuid` hardcoded in the JSON** | Not resolved by slug. A wrong UUID does not error — it tags every ingested publication to another TA, silently | Create the `therapeutic_areas` row FIRST, read the generated id back, paste it in. Verify with a count query after the first windowed run. |
| **DB `pubmed_query` is vestigial** | Editing it changes nothing; both running TAs' DB copies are already stale against their JSON | The JSON's `pubmed.global_query` is the only query the orchestrator reads. |
| **`ingest_publications.py` is orphaned** | Still documented as canonical; nothing calls it. It reads the DB query, so following it silently uses a different (stale) query than the pipeline | Use `reingest_cycle.py`'s stage map as the command source of truth. |
| **`pubmed.us_query` in the JSON** | Read by nothing — ingestion is global, geography deferred to enrichment | Don't spend time authoring it; don't expect it to filter anything. |
| **`ta_level` drift** | Already inconsistent between JSON and DB for hepatology and rare-disease | Set it identically in both. Prefer `indication`, the only value consistent today. |
| **PubMed chunk truncation** | `pubmed_pipeline` capped every window at 9,999 with no sub-year chunker, silently discarding the excess. Every CRC year from 2015 on exceeds it — ~66k papers would have vanished, weighted toward recent literature | **Fixed 2026-08-24**: recursive year→month→day subdivision, plus `esearch_available` / `esearch_retrieved` funnel fields and a hard non-zero exit on short fetch. If you see `short_fetch: true`, the stage failed — do not ship the corpus. |
| **Unicode crash on child output** | `tqdm` progress glyphs (U+258F) killed the orchestrator under PowerShell's cp1252 when stdout was a pipe. Hit twice, months apart, from two different launchers | **Fixed 2026-08-24** in the program, not the wrapper. `run_weekly_reingest.ps1` sets `PYTHONUTF8=1`, which is why the cron survived and manual runs did not. |
| **Transient "API key invalid" 400** | NCBI's key service intermittently rejects a *valid* key under sustained load (~1,600 calls in). Fail-fast-on-all-4xx turned a blip into a dead unresumable run | **Fixed 2026-08-24**: classify on the response **body**, not the status. Retry that one case; all other 4xx still fail fast. **Read response bodies on error** — the original failure needed reproducing from scratch because only the status line was retained. |
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
A config-driven, gated, orchestrated pipeline where a TA is built from its config by
`reingest_cycle.py --ta <slug>` with verification gates as code. We're partway there (the orchestrator
works for NSCLC; per-TA parameterization is in progress). Your build both USES the pipeline and helps
prove which pieces still need generalizing — log anything TA-hardcoded you hit into
`TA_BUILD_DEBT_COMPLETE.md`.

**Sequence to trust an automated run:** manual-verified → parameterized/config-driven → gated →
orchestrated. *Automation without verification gates is not automation; it's an unattended way to corrupt
the database faster.* (The AD build created 191,551 wrong HCPs the manual way once — the automated way
would do it at 3am with no one watching. Gates first.)

### The automation backlog, in dependency order
Each item removes a class of manual error rather than saving keystrokes. Do them in this order; each one
is only safe once the one above it is done.

**Done 2026-08-24:** the dry-run plan now prints all stages including the billed ones; `--build-mode new`
exists (window from `years_back`, stage-13 ceiling, blast-radius confirmation, populated-TA refusal);
recursive sub-year chunking with a short-fetch guard; UTF-8 stdio hardening; transient-400 retry.

1. **`scaffold_ta.py` — config generation.** Takes a slug, name, parent UUID and `ta_level`; creates the
   `therapeutic_areas` row, reads the generated id back, writes
   `config/therapeutic_areas/<slug>.json` with that id already in `ta_uuid`, creates the
   `therapeutic_area_ingestion_config` row with `is_visible_in_ui = false`, and prints the three frontend
   registrations as a diff to apply. **This is the highest-value item** — it eliminates the `ta_uuid`
   mismatch by construction, which is currently prevented only by discipline and fails silently.
2. **`validate_ta_config.py` — a gate, not a script.** Asserts: JSON `ta_uuid` matches the DB row for that
   slug; `ta_level` matches across both; the slug appears in all three frontend files; the TA is present
   in `rising_score.py`'s model map. Run it as reingest stage 0, failing the cycle before anything writes.
   Every one of those four is a real defect already observed in this codebase.
3. **Retire the `rising_score.py` hardcoded map.** Add a `rising_model` column to `therapeutic_areas`,
   populate it, and make the script read it. Today the script probes for a column that does not exist,
   fails silently, and falls back to `{"nsclc": "momentum", "atopic-dermatitis": "emergence_composite"}` —
   so a new TA errors at stage 9 with "Refusing to guess."
4. **Retire the DB `pubmed_query` column.** It is vestigial, stale, and actively misleading — it is the
   direct cause of this guide's prior revision naming the wrong config source. Drop it, or rename it
   `pubmed_query_DEPRECATED` so no one can read it as authoritative.
5. **Add MeSH tree verification (§0.2b) as an automated gate.** The count-arithmetic check is mechanical — a script can take the TA's MeSH anchors plus its declared excluded diseases and assert no anchor explodes into an excluded branch, and that every declared subsite is reachable. Run it as part of `validate_ta_config.py`.
6. **Generalize `config/congresses.json` and `config/assets.json`.** Neither is TA-keyed in a way a new TA
   can use. Both currently hold NSCLC-only values.
7. **Make stage 1 resumable — or at least its retrieval phase.** Retrieval takes ~20 minutes and is
   thrown away by any later failure. The full fix is dangerous (the checkpoint counts batches instead of
   verifying the DB — that cost 345 of 368 publications in a proven A/B, which is why
   `--reset-checkpoint` is unconditional). But a cheap subset is safe: write the retrieved PMID set to
   disk immediately after retrieval, and read it back on restart if it exists and the window matches.
   Touches nothing in the write-phase checkpoint.
8. **Only then, extend orchestration.** Adding stages to an unvalidated config surface multiplies the
   blast radius of a config error rather than reducing it.

---
*Full detail: `TA_NEW_PLAYBOOK_COMPLETE.md` (canonical deep reference). Work log / archaeology: `TA_BUILD_DEBT_COMPLETE.md`.
Scoring definitions: `FEATURE_DEFINITIONS_CURRENT.md`. When in doubt, read the live script.*
