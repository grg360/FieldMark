# Hermes — exception taxonomy and instrumentation

Every class below was hit in production on FieldMark between 2026-08-26 and
2026-09-12. None is hypothetical. Hermes classifies each exception into one of these
or reports a new class, which is then added here.

The ordering is by how expensive the class has actually been.

---

## E1 — STALE, NOT MISSING

**Signature.** The artifact exists, the coverage query is green, and the content
predates an upstream change. Nothing errors.

**Instance.** 2026-09-10. The colorectal community board held 116 members. The cause
was not the board SQL, the tier model, the `qualifies` predicate, or the country
filter — all four were investigated first. `cohort_classification_v2.py` had not run
for colorectal since workstream B added 19,043 NPI-native records, so 867 of 872
claims-evidenced physicians were never classified `community` and could not be
scored. Re-running classification then scoring took the board to 4,794 and moved
`established` by one person.

**Detection.** Compare each artifact's last-write time against the last-write time of
every artifact it `depends_on`. The manifest already has the edges.

**Rule.** *Presence is not freshness.* A green coverage query on an artifact whose
upstream moved later is an E1 until proven otherwise.

---

## E2 — SILENT DEGRADE

**Signature.** A missing input does not stop the consumer. The stage exits 0 and a
surface renders empty, which is indistinguishable from a true zero.

**Instance.** `ta_hcpcs_codes` is empty for colorectal. Three RPCs INNER JOIN it and
`hcp_administered_volume` returns `no_set_activity` on the empty join — the app tells
users that *every* colorectal HCP has no administered activity.

**Detection.** The manifest records `on_missing: silent_degrade` with file:line for
every such consumer. Hermes holds those open until the coverage query proves content,
regardless of exit codes.

**Rule.** *Exit code 0 is not an answer.*

---

## E3 — GATE AND PRODUCER DISAGREE

**Signature.** A reader asks a question the writer made unanswerable. No error at
either end.

**Instances.** `build_hcp_payload` selected records on NPPES taxonomy and then
discarded the taxonomy, so 19,043 records could not be asked the question that
created them; the evidence gate read 183 where the truth was 506. Separately,
`nppes_state_has_nppes_provenance` could never validate against `dedup_merge.py:643`,
which nulled `npi_number` while `nppes_practice_state` still held a value.

**Rule.** *When a script selects on a field, it must persist that field.*

---

## E4 — ONE VALUE, TWO SPELLINGS

**Signature.** A column holds more than one encoding of the same fact. Some readers
know one, some know the other, and a tolerant reader hides the split.

**Instances.** `hcps_v2.country` holds both `US` (92,611) and `USA` (19,304); the
board views test `= 'US'` while `scholar_enrichment.py`, `bluesky_enrichment.py`,
`twitter_enrichment.py` and `npi_gap_audit.py` query `.eq("country","USA")` exactly.
526 claims-evidenced colorectal physicians are excluded by that alone.
`hcp_nppes_detail_v2.nppes_taxonomies` held 41,674 object-form and 19,043
bare-string rows. `themes_tag` had four spellings. `hcp_research_themes_v2
.therapeutic_area` holds `'NSCLC'`, `'COLORECTAL-CANCER'` and `'Atopic Dermatitis'`,
so `lower(col) = slug` fails for AD.

**Rule.** *The fix is one spelling, not a reader that knows all four.* A
shape-tolerant reader survives the split and leaves every future reader to
rediscover it.

---

## E5 — TA PINNED INSIDE PYTHON

**Signature.** A TA uuid or slug literal in a producer script. The database-level
neutrality validator cannot see it.

**Instance, verified 2026-09-12.** `scripts/congress/ingest_asco_abstracts.py:17`
declares `NSCLC = "c0065b03-a25e-4e9a-bde4-4b4d0db7827d"` and passes it as a bound
parameter at `:62` and `:68` — both board lookups. `congress_confirmed_presenters` is
lung-only by construction; `congress_abstracts` at 65 NSCLC / 0 CRC is the matcher
never looking, not a coverage gap.

**Detection — and note what the example teaches.** The uuid is NOT inline in a SQL
string. It is a module-level constant on its own line, reaching the query as `%s`.
A sweep that greps for uuid literals inside SQL text finds nothing here. Search for:

    a uuid-shaped literal ANYWHERE in the file, assignment included
    a slug literal ('nsclc', 'colorectal-cancer', ...) in any string
    a constant whose name is a TA name, and every use of it
    a TA resolved once at import and closed over

`validate_ta_neutrality.py` reads the live database catalog and cannot see any of
this; the manifest tracks artifacts, not scripts. **This is Hermes's to find** on
every producer in the breast plan, before it runs.

---

## E6 — THE POPULATION CANNOT ANSWER THE QUESTION

**Signature.** A measurement taken against the ingested population is read as a fact
about the world.

**Instance.** 2026-09-12. Trastuzumab showed 27 billers in `hcp_hcpcs_detail`, read as
evidence that HER2 therapy is rare. `hcp_hcpcs_detail` holds only already-ingested
HCPs, and the ingested population was lung and colorectal — breast specialists were
absent by construction.

**Rule.** *For any question about a TA that does not yet exist, ask the national
source file, never the ingested tables.*

---

## E7 — A PLAUSIBLE MECHANISM THAT FITS THE NUMBER

**Signature.** An explanation is offered, fits the observed figure, and is not the
cause. The most dangerous class, because it closes an investigation.

**Instance.** 2026-09-12. Capecitabine's 4 national Part D prescribers were
attributed to the 11-claim floor and cyclical dosing. The actual cause is a third
payment channel: Medicare pays oral anticancer drugs through the Part B oral drug
benefit via DME MACs (J8520/J8521/J8522), and the Physician & Other Practitioners
file excludes DMEPOS claims. Verified — all eight J8xxx codes return 0 rows in that
file while J9035 returns 1,842.

**Rule.** *A mechanism is a hypothesis until a second measurement discriminates it
from the alternatives.* State the prediction the mechanism makes, then test that.

---

## E8 — THE CATEGORY THAT LOOKS COMPLETE

**Signature.** A filter partitions a population and one class silently falls outside
every bucket.

**Instance.** 2026-09-12. Filtering `Prscrbr_Type` on `Oncology|Hematology` excludes
every nurse practitioner and physician assistant — 6,176 of anastrozole's prescribers
and 704 of palbociclib's. `Prscrbr_Type` carries no specialty for NPs and PAs at all,
so an oncology NP and a primary-care NP are identical in that field. The same blind
spot sits in `hcp_part_d_oncology_v1` and in the taxonomy gate running the live
colorectal board.

**Rule.** *Enumerate the categories before filtering on a subset of them.*

---

## E9 — A PRODUCER THAT CANNOT BE ASKED

**Signature.** A script with no argument parser and no `__main__` guard performs its
work on import or on any invocation.

**Instance.** 2026-09-01. `ingest_asco_abstracts.py` was called with `--help` during
an announced read-only audit and rebuilt `congress_confirmed_presenters` (47 → 51)
and `congress_abstracts` (3,451). The prior state is unrecoverable.

**Rule.** *Running it is the answer.* Producer verification is static `ast` parsing.
Hermes never executes a producer to learn what it does.

---

## E10 — NON-MONOTONIC DERIVATION

**Signature.** An artifact re-derives on every rebuild and can shrink without error
while a document quotes its old number.

**Instance.** Presenter matching is HCP-dependent: corpus growth can remove a
presenter by turning a unique name match into an ambiguous one.

**Instance, verified 2026-09-12.** The NSCLC community board returns 4,915 today.
`docs/canonical/CRC_COMMUNITY_BUILD.md:36`, `:39` and `:233` and
`sql/community_qualification_gate.sql:14` all say 4,913. Line 233 reads "NSCLC is the
regression oracle: its board must still return 4,913, byte-for-byte." That file was
committed 2026-09-10 — two days before this measurement — which is the point:
**recency is not correctness.** No SQL was edited; a view beneath the board moved.

**Rule.** *The oracle is whatever the query returns now, captured before the change —
never a number quoted from a document.*

---

# Instrumentation — what Hermes records

FieldMark has no run logs. `.reingest_work/<slug>/logs/` does not exist for any TA
and `reingest_last_run.json` stores per-stage status only. `ta_run.py` already accepts
`--log-out`; that is the hook.

Per stage invocation, record:

    ta slug, stage, sub-stage
    producer path and the exact argv
    started_at, finished_at
    exit code
    work-set size at plan time
    postcheck: the figure READ BACK FROM THE TARGET TABLE, before and after
    outcome: OK | SHORT | FAILED | WARN
    billed: true|false
    who ran it

Per judgment-queue item, record:

    manifest entry name, kind, classification
    opened_at, the question, who it is waiting on
    resolved_at, the decision, and the reasoning
    what would reopen it

Per exception, record:

    class E1-E10 or NEW
    the artifact and the symptom
    what was investigated and ruled out, in order
    the measurement that discriminated the cause
    whether a rule above should change

The postcheck figure is the load-bearing field. **A count taken from a log is not a
count** — it is read back from the target table, and the log records what the table
said, not what the script believed.

The judgment-queue timing is the deliverable Hermes's own design is blocked on: how
long a TA build actually takes, and how much of that is waiting on a founder
decision rather than on compute.
