# docs/canonical — the documentation that is true today

Carved out **2026-08-31**. Everything in this folder was checked against the code and the live
database on that date. Everything left in `docs/` was not, and most of it is a record of a moment
rather than a description of the system.

**The rule for this folder:** a file belongs here only if someone could act on it today and be
right. History, session logs, before/after reports and audits are valuable and are *not* canonical
— they stayed behind. A file that is correct but stale is the most expensive kind of wrong, because
it reads exactly like a file that is correct.

---

## What is here

### Procedural — build and run a TA
| File | What it is |
|---|---|
| `TA_BUILD_GUIDE.md` | The short path: what to run, in order, for a new TA. |
| `TA_NEW_PLAYBOOK.md` | The long form — stage-by-stage with the reasoning. |
| `TA_NEW_PLAYBOOK_COMPLETE.md` | The playbook plus the full appendices. |
| `TA_GENERATION_LAYER.md` | The generation (billed) stages and what each writes. |
| `GENERATE_CYCLE_DESIGN.md` | Why `generate_cycle.py` is shaped the way it is. |
| `COMMUNITY_ROSTER_BUILD.md` | The community roster build, tier-grouped and not ranked. |

### Reference — how it works
| File | What it is |
|---|---|
| `fieldmark-score-canonical.md` | The scoring definitions of record. |
| `fieldmark-methodology-page.md` | The public methodology copy. |
| `FEATURE_DEFINITIONS_CURRENT.md` | Feature-by-feature definitions. |
| `PERCENTILE_CONVENTION.md` | The Weibull convention across nine scorers. |
| `TOTAL_CAREER_PUBS.md` | `total_career_pubs` vs `in_corpus_pub_count`. |
| `TA_GENERALIZATION_INVENTORY.md` | What is still TA-hardcoded, per script. Moved from `docs/design/`. |
| `FIELDMARK_DESIGN_SYSTEM.md` | The design system. Referenced from code. |
| `DESIGN_SYSTEM_AUDIT.md` | The audit behind it, still cited by section number from `App.tsx`. Moved from `docs/design/`. |

### Debt — known defects, actively consulted
| File | What it is |
|---|---|
| `ORCHESTRATOR_DEBT.md` | `ta_cycle.py`'s outstanding debt. Its fixed items are struck through and dated — the model to copy. |
| `RISING_EXCLUSIVE_GATE_DEBT.md` | What the OR-15 removal left behind. Cited from `ProfileDispatch.tsx`. |
| `TA_NEUTRAL_DB_LAYER.md` | The TA-neutrality design: inventory, phases, and the validator contract. Cited from `lib/cohortLedger.ts`. |

### `CRC_VALIDATION_ANCHORS.md` — read this for its shape, not its content
Classified a DATED SNAPSHOT in the 08-31 inventory, and that is still the right classification:
**its numbers are colorectal-specific and will not be true of any other TA.** It is here for one
reason — it is the only artifact showing what a *pre-registered acceptance test* looks like: the
expected counts written down **before** the build ran, so the build could be judged rather than
admired.

Copy the structure for TA #4. Do not copy the numbers, and do not update this file with another
TA's — write a new one.

### `examples/` — the machine-readable build contract
Two real files from the CRC build. No prose substitutes for them; they are what the orchestrators
actually write and re-read.

- **`crc_run_state.json`** — what `ta_cycle.py` persists so a resume knows what it is resuming.
  Three keys: `hcp_run_id`, `pub_run_id`, `ta_id`. The two run ids are the reason a resume can
  re-enter a batch instead of redefining it. (A live file also carries the `operation` and
  `stop_after` fields added 2026-08-29; this capture predates them.)
- **`crc_generate_state.json`** — what `generate_cycle.py` writes per stage, `G1`–`G8`. Each record
  holds `command`, `exit`, `duration_s`, `expected`, `actual`, `status`, `log` and a `tail`.
  **`expected` vs `actual` with `status: "short"` is the whole point** — G1 planned 140 HCPs and
  processed 115, and the run recorded that rather than reporting success. A stage that finishes
  with exit 0 and does less than it planned is the failure mode these files exist to make visible.

---

## The six claims checked on 2026-08-31

Every file in this folder was checked against these. Four were already clean; two were wrong and
were fixed before the carve-out.

| # | Claim checked | Result |
|---|---|---|
| 1 | `reingest_cycle.py` still named that | **Clean.** The 2026-08-29 rename purged it from all five current guides; zero occurrences here. Survives only in `docs/TA_BUILD_GUIDE - {24,25,26}Aug26.md` and the Umbra bundle, all left behind. |
| 2 | `--build-mode new` still the flag | **Clean.** Replaced by `--operation {build,refresh}`. `ORCHESTRATOR_DEBT.md` mentions it only inside a struck-through, dated FIXED note — correct history, not guidance. |
| 3 | `established_scoring.py` described as the blocker | **Clean here, wrong elsewhere.** `TA_GENERATION_LAYER.md` carries an explicit *"CORRECTED 2026-08-26"* block. The script is dead: nothing under `scripts/` invokes it, the sole reference is a comment in `export_telescope_data.py`, and the board comes from `recompute_established_ranks_v3.py --ta`. Still asserted as live in `TA_BUILD_DEBT.md` and `_COMPLETE`, which now carry a SUPERSEDED banner naming this claim. |
| 4 | `publication_leadership_scoring` / `pharma_engagement_scoring` lack `--ta` | **FIXED.** `pharma_engagement_scoring.py:159` has `@click.option("--ta", default="nsclc")`. `TA_NEW_PLAYBOOK.md:608` read `✗ PENDING` while line 645 of the same file already invoked it with `--ta` — corrected. Same stale note fixed at `INCREMENTAL_REINGEST_SEQUENCE.md:529`. `publication_leadership_scoring.py` was already marked ✓ and is. |
| 5 | The four dropped ingest columns are still dropped | **FIXED and backfilled 2026-08-26.** Measured 08-31: colorectal-cancer 147,218/147,218 `publication_types` and `mesh_terms`, 131,905 abstracts (89.6%); nsclc 82,820/88,251 typed, 76,287 abstracts. The stale assertion lived in `TA_BUILD_GUIDE - 26Aug26.md:516` (left behind) **and in `scripts/ingest/pubmed_pipeline.py`**, where one comment said broken and another ninety lines below said fixed — corrected in code. |
| 6 | Rising board described as including established HCPs | **Clean.** The OR-15 clause was removed 2026-08-26; the boards are disjoint by construction. `RISING_EXCLUSIVE_GATE_DEBT.md` is the record. No other doc describes the old gate — the `rising_eligible` mentions elsewhere are historical cohort counts, not gate descriptions. |

---

## What was left behind, and why

**`docs/TA_BUILD_GUIDE - 24Aug26.md`, `- 25Aug26.md`, `- 26Aug26.md`** (657 / 847 / 966 lines) —
three dated copies of a file that is in this folder. They are the only remaining carriers of both
renamed flags outside the sealed bundle. The highest-value deletions in the tree.

**`docs/TA_BUILD_DEBT.md` (6,878), `_COMPLETE` (9,230), `_ch2`, `_ch3`** — the largest body of text
in `docs/` and the largest concentration of stale claims. Session logs, not documentation.
`TA_BUILD_DEBT.md` described *itself* as "FOUNDATIONAL — CANONICAL"; both files now open with a
SUPERSEDED banner. **Their stale `established_scoring.py` claim was deliberately not corrected
inline** — they are chronological records, and rewriting their history would make them a worse
record, not a better one. The banner names the claim and points here.

**`docs/INCREMENTAL_REINGEST_SEQUENCE.md`** (544 lines, 2026-07-21) — genuinely procedural, and the
one real judgement call. Superseded by `ta_cycle.py`'s own staged runbook, so it stayed behind; its
stale `pharma_engagement_scoring` note was fixed anyway, because a wrong claim left in place is
worse than a file in the wrong folder.

**`docs/Umbra/`** (53 files) — a sealed external handoff bundle with `manifest.json` and
`SHA256SUMS`. **Do not edit it.** During this carve-out its internal references were repointed by an
automated pass and then reverted for exactly that reason. (Note: 3 of its 10 checksummed
`evidence/*` files were already absent before today; that is pre-existing, not carve-out damage.)

**Everything else** — the four `AFFILIATION_*` docs, all audits, all before/after reports, every
demo script and walkthrough, the CSVs and payload JSON, the per-TA parity checklists, the Pulse
design set. Correct as history, wrong as guidance. That is the DATED SNAPSHOT category and it is the
bulk of what remains in `docs/`.

**`docs/design/`** keeps its 23 `.dc.html` layout frames and the plans that go with them. Only the
two files cited from code as *documentation* were promoted. The frames are design authority and are
referenced by name from the components that implement them; moving them would break ~15 pointers to
no benefit.

---

## Keeping this true

Moving these files repointed **60 path references across 46 files** — 21 in `frontend/src`, 15 in
`scripts/`, 2 migrations, and the rest inside `docs/` itself. Code cites documentation here by path,
so a future move has the same cost. Before moving anything out of this folder:

```bash
grep -rn "docs/canonical/" frontend/src scripts sql migrations docs
```

When the next carve-out happens, diff against the table above rather than starting over. The six
claims are a baseline, and a baseline with a date on it is the only kind that stays useful — the
same role `scripts/utilities/ta_neutrality_allowlist.tsv` plays for the schema.
