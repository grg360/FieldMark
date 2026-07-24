# Umbra — FieldMark Repo Audit Brief
**Phase 1: read-only audit. Phase 2 (later, on a branch): build Alzheimer's disease as a new therapeutic area.**

---

## What FieldMark is
A B2B SaaS platform that identifies rising-star HCPs and digital opinion leaders for pharmaceutical Medical
Science Liaison teams. It ingests scientific literature (PubMed), enriches author identity and career data
(OpenAlex), resolves canonical HCP identities, tags them to therapeutic areas from publication evidence, and
scores them into four cohorts: **Established**, **Rising Star**, **Too Young**, **Community**.

Stack: Python pipelines · Supabase Postgres · React/Vite/TypeScript frontend · Claude API for narrative
synthesis. Repo `grg360/FieldMark`, branch `foundation-rebuild`.

**Your eventual job:** stand up Alzheimer's disease as a new TA, in isolation, without altering the existing
TAs. This audit is the preparation for that.

---

## SCOPE OF THIS PHASE — READ-ONLY
- **No writes to the repository.** No commits, no branches yet.
- **No writes to the database.** No `--execute`, no migrations, no inserts, no deletes. Read-only queries only.
- **Do not run any pipeline stage**, even a "harmless" one. Several stages mutate shared cross-TA tables.
- If a `--dry-run` would help you understand a script, ask before running it.

Audit against tag **`umbra-audit-base`** (commit `ad27ade`) so your findings anchor to a fixed state — the
repo is under active development and `foundation-rebuild` will move beneath you.

---

## Read these, in this order
1. **`docs/TA_BUILD_GUIDE.md`** — the condensed, command-driven runbook for standing up a TA. **Start here.**
   This is your primary reference.
2. **`docs/TA_NEW_PLAYBOOK_COMPLETE.md`** — the full canonical reference the guide was distilled from
   (~113KB, with a table of contents). Contains the Atopic Dermatitis build post-mortem, the corpus-
   contamination investigation, and the retrieval-query authoring methodology in depth. Go here when the
   guide's one-line answer isn't enough. **Read section 0z first** — it documents a live trap about which
   ingest script is canonical.
3. **`FEATURE_DEFINITIONS_CURRENT.md`** — ground truth for scoring definitions and UI strings.
4. **`INCREMENTAL_REINGEST_SEQUENCE.md`** — how the weekly incremental cycle works. Note the distinction
   the playbook draws between the from-scratch BUILD (its section 1) and the incremental reingest cycle —
   you will be doing the former; the production cron does the latter.
5. **`SCRIPT_CATALOG`** (in `Latest Documentation/`) — script inventory.

**Background, not reference — read only if you need archaeology:** `docs/TA_BUILD_DEBT_COMPLETE.md` is a
~800KB *chronological session log* — decisions, findings, corrections and deferrals as they happened across
the whole TA build history. It is working notes, not documentation, and it is far too long to read
end-to-end. The durable rules were already extracted from it into the playbook. Use it to answer "why is
this the way it is," not "how should I do this," and navigate by its table of contents or by section
reference from the playbook.

Where docs disagree with each other, **the live code wins** — say so in your findings rather than guessing.
Several docs predate a major refactor on 2026-07-23 (see below).

---

## What changed very recently — do not audit against stale assumptions
On **2026-07-23** the ingest layer was refactored (commit `ad27ade`, +290/−996):

- **`pubmed_pipeline.py` is now publications-only.** It persists `publications_v2` unconditionally, keyed by
  `pubmed_id`, plus `publication_therapeutic_areas_v2` and `source_therapeutic_area_id`. It also populates
  `pub_date` and raw `pubmed_authorships`.
- **It no longer creates HCPs.** All name-based identity minting, the attribution gate, and the second-pass
  author enrichment were removed. `create_hcps_v2.py` is now the sole identity authority, resolving
  OpenAlex-first at stage 2; `rebuild_publication_authors_v2.py` (Step F) links pubs to HCPs at stage 5.
- **Why:** the previous design minted HCPs from PubMed names whose `identity_hash` did not match the
  OpenAlex-derived hash used by `create_hcps_v2`. On any checkpoint-resumed run the identity map collapsed,
  the attribution gate dropped ~94% of retrieved publications, and **the run reported SUCCESS**. Proven A/B:
  371 candidates → 23 persisted resumed, versus 368 with the checkpoint reset.

**Take the lesson, not just the fact:** this pipeline has a history of failures that are *silent* — stages
that consume N inputs, persist ~0, and report success. When you audit, look for places where completion is
asserted from a counter rather than verified against actual state.

**Current state:** the refactor has been validated end-to-end. A single-week acceptance cycle and a
three-week catch-up re-ingest both completed successfully, with the ingest funnel showing exact pass-through
(candidates = articles = extracted = persisted) and identity creation working with `create_hcps_v2` as the
sole authority. The publication loss is repaired. So you are auditing a codebase that has just been fixed,
not one mid-outage — but the instrumentation that now makes such a loss loud is new, and worth examining.

---

## What to produce

### A. Architecture map
The end-to-end flow from PubMed query to scored cohort. Which script owns which stage, what each reads and
writes, and where the orchestrator (`scripts/reingest_cycle.py`) fits versus the standalone scripts.

### B. TA-agnosticism assessment (the core deliverable)
For each stage the orchestrator runs, determine whether it is genuinely parameterized by TA or carries
NSCLC-specific assumptions. Known items to verify and expand on:

- **`rising_score.py` is map-driven, not config-driven.** It probes for a `rising_model`/`scoring_model`
  column on `therapeutic_areas` and `therapeutic_area_ingestion_config` — **those columns do not exist** — and
  falls back to a hardcoded `RISING_MODEL = {"nsclc": "momentum", "atopic-dermatitis": "emergence_composite"}`.
  **A TA absent from that map errors at stage 9.** Alzheimer's will hit this. Confirm, and propose the fix.
- **Two ingest scripts with different config sources** (see playbook §0z): the playbook names
  `ingest_publications.py` as canonical, reading its query from the `therapeutic_area_ingestion_config` DB
  table; the orchestrator runs `pubmed_pipeline.py`, which reads `config/therapeutic_areas/<slug>.json`.
  Determine which is authoritative and what a new TA must populate.
- **Non-orchestrator features still NSCLC-centric:** `trial_ta_mapping.py`, `bucket_themes.py`,
  `extract_research_themes.py`, and the Medicare/Open Payments aggregators. Scope what Alzheimer's would need.
- **Frontend:** roughly 30+ files carry NSCLC references. Count and locate; do not fix.

### C. Alzheimer's readiness checklist
What must exist before a first run: the TA row, the ingestion config (in whichever place is authoritative),
`curated_ta_concepts` (~30–50 concepts, level ≥ 2), a `CANONICALS_BY_TA` entry, a KOL surname map, and a
`rising_model` decision. Say which are missing and who must create them.

### D. Risk register
Anything that could cause an Alzheimer's build to damage existing TA data. Start from these and find more:

- **Stage 1c (`build_author_flat.sql`) is cross-TA** — it DROP+CREATEs `author_pub_flat` over the entire
  corpus, so any TA's cycle transiently rebuilds the shared table for every TA. **Two cycles must never run
  concurrently.**
- `hcps_v2`, `publications_v2`, and `openalex_author_inventory` are **shared and cross-TA by design**. A new
  TA adds rows to them. It must never delete or rewrite another TA's rows.
- `dedup_merge` deletes HCP stubs and repoints foreign keys — hard to reverse.
- The orchestrator is genuinely TA-agnostic, which means running it against an existing TA **will execute for
  real** and rewrite that TA's cohorts and rising board. It does not fail safely.

---

## The single most important thing to understand
From the playbook, and it is not hyperbole:

> The ingestion query is the root of the dependency tree. Get it wrong and you don't get a slightly-off
> result — you get tens of thousands of confidently-wrong HCPs.

The Atopic Dermatitis build proved it: a contaminated retrieval query produced ~47,850 publications of which
only ~24K were real, and would have created ~40,000 wrong HCPs. Two rules follow:

1. **Retrieval = disease identity only.** The query answers exactly one question: *is this paper about the
   disease?* Disease terms only — MeSH anchors, names, historical synonyms, spelling and age and severity
   variants. **Never** drugs, mechanisms, or pathways in the retrieval query: modern drugs are pan-indication
   and will drag in other diseases wholesale. For Alzheimer's that means amyloid, tau, ApoE, lecanemab and
   donanemab belong in *enrichment*, not retrieval.
2. **Tag publications only from the retrieval query's own PMID result — never by author graph.** Tagging a
   paper because a co-author is already TA-tagged is circular and pulls in unrelated literature.

When you reach Phase 2, the retrieval query gets validated *before* any ingest: a count check, a decomposition
check, a contamination-shed test against known in-disease and known-contaminant papers, and a windowed-sum
reconciliation. All four are described in the guide.

---

## Working norms
- **Schema-first.** Confirm column names via `information_schema` before writing any query. Do not assume.
- **Verify claims in documentation against the database.** Docs have been wrong before; one handoff's "zero
  linkage" turned out to be 172 real HCPs, and acting on it would have destroyed them.
- **Read the code when a hypothesis is in doubt.** Grep fragments have overturned confident theories here.
- **A surprising number is a thread to pull, not a nuisance to dismiss.** Every significant defect found in
  this codebase surfaced because someone refused a plausible-sounding answer.
- Flag anything you cannot verify rather than presenting inference as fact.

---

## Deliverable
A written audit covering A–D above, anchored to tag `umbra-audit-base`, with file and line references. Flag
open questions rather than resolving them unilaterally. Phase 2 branching and database isolation will be
decided after this audit is reviewed.
