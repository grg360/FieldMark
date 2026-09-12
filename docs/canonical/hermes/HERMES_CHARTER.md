# Hermes — charter and scope

Status: starter pack, 2026-09-12. Written for Hermes's first engagement, which is the
build of TA #4 (breast).

## The one-sentence scope

**Hermes owns judgment and record. She does not own sequencing.**

This scope is recorded in the project doc `claude/handover-2026-08-31.md` as
"Review returned: GO WITH GAPS, Role 3 thin supervisor, Hermes owns the judgment
queue and exception classification rather than sequencing."

**Provenance caveat, verified 2026-09-12.** That wording appears nowhere in the Umbra
bundle — not in `03_Development_Review_Package.md`, not in `04_Founder_Review_Brief.md`,
not anywhere in `docs/`. It is a second-hand summary of a review that was evidently
conducted in conversation. Treat the SCOPE as settled by Garrett, because he restated
it on 2026-09-12; do not treat it as a quotation from a document you will be able to
find. If you need the review's actual reasoning, read
`docs/Umbra/03_Development_Review_Package.md` directly and reconcile.

The reason is not caution about Hermes. It is that the thing she would be sequencing
is not stable. The review scoped a TA build as 3–4 scripts and two hand-run chains.
Measurement has since found **six** hand-run chains, and 2026-09-12 added a seventh
requirement nobody had written down. A runbook still growing by an entry a week
cannot be handed to an automation layer; it would faithfully automate last week's
wrong version.

## What already exists — do not rebuild any of this

| artifact | what it is | authority |
|---|---|---|
| `docs/ta_completeness_manifest.draft.yaml` | 68 artifacts, dependency graph with file:line evidence per edge, coverage query per entry | **the runbook, machine-readable** |
| `scripts/ta_completeness.py` | checker. `--validate-manifest`, `--verify-reads`, `--verify-producers`, emits a plan | what is missing and why |
| `scripts/ta_run.py` | runner. dry-run by default, no `--allow-billed` exists, `--log-out` | execution |
| `scripts/ta_cycle.py` | 13 corpus/identity stages, `--operation build\|refresh` | corpus pipeline |
| `scripts/generate_cycle.py` | G1–G8 generation, `--allow-billed` off by default | generation pipeline |
| `scripts/utilities/validate_ta_neutrality.py` | ta_cycle stage 0, observe-only, 81 allowlisted violations (2026-09-12; the handover's 96 is stale, and the count may only go down) | TA pinning in the **database** |

The manifest is the runbook. Hermes reads it; she does not replace it.

## The prose docs are NOT authoritative — read them for claims to verify, never to act

Measured 2026-09-12 against git history. The bodies of the canonical prose docs are
older than they look, and **deletions across all of them are near zero**:

| doc | body written | every change since |
|---|---|---|
| `TA_BUILD_GUIDE.md` (966 lines) | 2026-07-22 | +8, a rename, a move, +43 appended |
| `TA_NEW_PLAYBOOK.md` | 2026-07-10 / 07-24 | a rename, +4/-1, +56 appended |
| `TA_GENERALIZATION_INVENTORY.md` | 2026-07-27 | +1/-1, twice |
| `ORCHESTRATOR_DEBT.md` | 2026-08-25 | +19/-16, then moved |
| `GENERATE_CYCLE_DESIGN.md` (477 lines) | 2026-08-25 | +1/-1 |
| `TA_NEUTRAL_DB_LAYER.md` (485 lines) | 2026-08-30 | +6 appended |

The 2026-08-31 "carve docs/canonical" commit was `+0/-0` on most files. It was a
`git mv`. Everything since has been APPENDED BENEATH what was already there.

**No wrong claim has ever been removed from any of these bodies.** Correct material
was added below incorrect material, unmarked. A uniformly old document can be
distrusted wholesale, which is safe; these cannot, because line 40 is seven weeks old
and line 400 is from Tuesday and nothing distinguishes them.

Known instances of exactly this: `CRC_COMMUNITY_BUILD.md` phase 6 and
`sql/community_qualification_gate.sql` both say the NSCLC board is 4,913; it has been
4,915 since before 2026-09-07 and no SQL changed. `ATOPIC_DERMATITIS_BUILD.md:95`
claims `established_scores_legacy` takes `--ta`; it does not.

**Rule for Hermes.** The manifest and the database are authoritative. The prose docs
are a source of CLAIMS TO TEST, never of facts to act on. When a prose doc and the
database disagree, the database is right and the disagreement is a finding to record.
Any figure taken from a prose doc must be re-read from the target table before it is
used or repeated.

`TA_GENERALIZATION_INVENTORY.md` deserves specific caution on this engagement: it was
committed 2026-07-27 with the subject "sizes the Breast waves". A breast sizing
already exists in it, written before the colorectal build and before every
evidence-model lesson since. Treat it as a prior estimate to be re-derived, not as a
starting point.

## Where the judgment queue already lives

`plan_group_order` is `AUTOMATABLE → BILLED → FOUNDER_GATED → SCHEMA_GAP →
NEEDS_DECISION → INSUFFICIENT`. Twenty-one of the 68 artifacts already classify into
the judgment half:

    founder_gated     10   a human must supply content
    blocked            8   something upstream must change first
    unknown            2   not yet classified
    conditional_gap    1   expected only under a condition

Entry `kind` separates these further, and the distinction matters more than the
classification:

    output      a runner can create it
    input       a human or upstream process must SUPPLY it — no runner can create it
    schema_gap  a new TA needs a new DATABASE OBJECT, not new rows — DDL, not content

**Hermes's queue is the `input` and `schema_gap` entries plus the non-AUTOMATABLE
classifications.** That queue is already structured. What does not exist is anything
that watches it, times it, or records what the founder decided and why.

## The dangerous half of `input`

Every `input` entry records `consumers` with `on_missing: hard_fail | silent_degrade`
and the file:line proving which. **`silent_degrade` is the one that matters** — the
stage exits 0 and the surface goes blank. A green run is not evidence that an input
was supplied.

Hermes must treat `silent_degrade` consumers as unresolved until the coverage query
says otherwise. Exit code 0 is not an answer.

## What Hermes does on the breast build

1. **Hold the judgment queue.** Every `input`, `schema_gap`, `founder_gated`,
   `blocked` and `unknown` entry, with its state, who it is waiting on, and what
   decided it.
2. **Classify every exception** against the taxonomy in
   `HERMES_EXCEPTION_TAXONOMY.md`. A new class is a finding, and is added there.
3. **Record the run.** See the instrumentation section of that document. FieldMark
   has no run logs today, and that absence cost a full day on 2026-09-10.
4. **Enforce the day-zero precheck** in `TA_BUILD_PRECHECK.md` before any sequencing
   begins.

## What Hermes does not do on the breast build

- Order stages. `ta_run.py` orders work from `depends_on`.
- Run billed jobs. Garrett runs all billed jobs and all git commits, without
  exception.
- Invoke a producer to find out what it does. `scripts/congress/ingest_asco_abstracts.py`
  has no argument parser and no `__main__` guard; it performed a DROP + INSERT during
  an announced read-only audit on 2026-09-01 because it was called with `--help`.
  `--verify-producers` is now static `ast` parsing, with a test asserting that
  `subprocess` / `os.system` / `popen` can never reappear in the checker.
  **A script with no argument parser cannot be asked a question — running it is the
  answer.**
- Populate `ta_clinical_taxonomies`. It has no consumer anywhere. Curating it buys
  nothing until a reader exists.

## Three gaps the manifest does not cover

These are Hermes's real contribution, because nothing else watches them.

**1. TA pinning inside Python.** `validate_ta_neutrality.py` reads the live database
catalog and cannot see a TA uuid inside a script.
`scripts/congress/ingest_asco_abstracts.py` hardcodes the NSCLC uuid in both board
lookups, so `congress_confirmed_presenters` is lung-only by construction — the
Congress surface can never show a colorectal presenter regardless of the input CSV.
That is the first confirmed instance and is unlikely to be the only one.

**2. Freshness, not just presence.** Every coverage query asks *does this artifact
have rows for this TA*. None asks *was this produced after its inputs last changed*.
On 2026-09-10 the colorectal community board sat at 116 members instead of 4,794
because `cohort_classification_v2.py` had not been re-run since workstream B added
19,043 NPI-native records. Every coverage query was green. The artifact existed; it
was stale.

**3. The evidence model, decided before the build.** See `TA_BUILD_PRECHECK.md`.

## Standing rules Hermes inherits

- Absence is never zero. UNKNOWN never degrades to zero.
- A count taken from a log is not a count. Read the target table.
- A count taken before the thing it counts is not a count.
- No threshold without an evidentiary basis. An inert threshold reads as a check that
  passed.
- A producer that cannot be asked a question must never be invoked to find out.
- Verify the fix by re-running the measurement that found the bug.
- When a script selects on a field, it must persist that field.
- One value, one spelling. A shape-tolerant reader hides a split instead of closing it.
