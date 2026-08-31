# Orchestrator debt — `ta_cycle.py` execution and operator experience

Scope: how the cycle *runs* — per-stage cost, progress visibility, partial-completion guards and
stop control. Distinct from `TA_GENERATION_LAYER.md`, which covers what the cycle does **not
produce**. Findings below were all observed or measured on the **CRC first build, 2026-08-25**.

---

## THE CLASS — network round-trips where bulk work belongs

**Three separate stages, one defect.** Recorded as a class because fixing them one at a time has
already happened twice and the third is still open. Each does per-record network I/O for work that
the underlying system can do in bulk. Each was invisible at incremental scale and pathological on a
first build.

| Stage | Shape | Incremental | First build | Status |
|---|---|---|---:|---|
| **6** `derive_authorship_position_v2` | 631,928 HTTP UPDATEs for a **set-based SQL operation** | 583 rows / 29s | **13.3 h** | **fixed** — one `UPDATE … FROM`, minutes |
| **8b** `openalex_author_enrichment` | 192,571 **singleton GETs** where the API accepts 50 ids per call | 641 fetches / 194s | **~16 h** | **fixed** — 50:1 batching, ~17 min (50×) |
| **8a** `career_enrichment_from_clusters` | one OpenAlex GET **per author id**, `time.sleep(0.05)` per HCP | 69 HCPs / 64s | **~6 h** | **OPEN** |

The magnitudes are the point: **1,078×, 2,670× and 1,343×** the incremental row count
respectively. Nothing in the code changed between the weekly cycle and the first build — only the
size of the input — and in all three cases the per-record shape was chosen when the input was a few
hundred rows and was never revisited.

### The general test

**Before any first-build stage runs, ask: is it doing per-record I/O for work that could be done in
bulk?** Three sub-questions resolve it in about a minute:

1. **Does the data already live in the database?** If yes, it is a set-based `UPDATE`/`INSERT … FROM`
   and no round-trip is warranted at all. That was stage 6 — every input was already in Postgres.
2. **If it is an external API, does it accept batched lookups?** OpenAlex takes 50 ids per list
   request. That was 8b: a 50:1 collapse that also dropped the request rate from ~9/s (throttling
   territory) to ~1/s. **8a has the same answer available and has not taken it.**
3. **What is the first-build multiple?** Compute work-set ÷ last incremental run *before* starting.
   Any three-digit multiple on a per-record stage is the signature. The orchestrator could warn on
   this for free: `gen_batch_pubs_file` (`:740`) already **returns** its row count and the callsite
   (`:1082`) discards it, and `run_stage` computes each stage's elapsed time (`:549`) and drops it
   rather than recording it in the completion marker. With those two values persisted, a
   scale-delta warning is arithmetic. Until then, ask by hand.

### 8a is the open one

`career_enrichment_from_clusters.py` still issues one `GET /authors/{id}` per author id in each
cluster, plus one Supabase UPDATE per HCP, plus a fixed `SLEEP_SECONDS = 0.05` — measured at
4.2 HCP/s against 92,638 clusters, ~5h51m. It is the **same shape as 8b**, against the **same API**,
and the same 50:1 batching applies. It was killed on the CRC build rather than fixed, on the
narrower grounds that `total_career_pubs` was already populated and the momentum gate reads 8c's
column instead — a scoping argument, not a repair.

Two things make it worth fixing rather than skipping again:

- Its work-set is **date-scoped, not TA-scoped** (`linked_at >= today`), so it silently includes
  other TAs' HCPs — 19,316 of 92,638 (20.9%) on the CRC run were not CRC.
- Unlike 8b's singleton calls, which were free, batching here would also be billed — but at
  1 credit per 50 authors the arithmetic is the same as 8b's: cents, not dollars.

Batching 8a is also option (b) in [`TOTAL_CAREER_PUBS.md`](TOTAL_CAREER_PUBS.md) — 8a is the only
writer that refreshes that column, and it is too slow to run every cycle, which is one of the four
reasons the column is unreliable. Read that decision before transplanting the 8b implementation:
making the refresh cheap means writer 2 overwrites writer 1 everywhere, which is only correct once
someone has decided what the column is supposed to mean.

---

## 1. Stage 6 is one PostgREST UPDATE per row — 13.3 hours on a first build

*(Instance of the class above — the fixed one. Kept in full because the replacement SQL is here.)*

`scripts/classify/derive_authorship_position_v2.py:400` writes row-by-row, batch size 1:

```python
if execute:
    print(f"\nApplying updates to {len(planned):,} resolved rows...")
    for n, (pub_id, hcp_id, is_first, is_senior, label, idx) in enumerate(planned, 1):
        ok, err = update_booleans(client, pa_table, pub_id, hcp_id, is_first, is_senior)
        ...
        if n % 500 == 0:
            print(f"  {n:,}/{len(planned):,} updated...")
```

and the write itself (`:281`) is a single-row PostgREST call:

```python
client.table(pa_table).update(
    {"is_first_author": is_first, "is_senior_author": is_senior}
).eq("publication_id", pub_id).eq("hcp_id", hcp_id).execute()
```

`--author-position-mode skip` (what the orchestrator passes) suppresses the second
`update_author_position` call, so it is one HTTP round-trip per row rather than two.

**Measured cost:**

| Run | Scope | Rows | Wall time | Rate |
|---|---|---|---|---|
| NSCLC incremental, `logs/reingest-nsclc-20260817-030001.log` | `pubs=162` | 583 written | 28.7s | ~20 rows/s |
| CRC first build, 2026-08-25 | `pubs=147,218` | 631,928 target | ~13.3h projected | 13 rows/s measured |

**1,078× the incremental row count with no warning that the scale was unusual.** The stage had only
ever been exercised at incremental size, so the per-row cost never surfaced. The rate was measured
live by sampling `COUNT(*) FILTER (WHERE is_first_author IS NULL)` 90 seconds apart: 1,169 rows /
90s = 13.0 rows/s against 621,354 remaining.

Note the first ~90 minutes of the run produced **no writes at all** — `fetch_target_rows`
(1,473 chunked reads at `IN_CHUNK_SIZE=100`) plus `fetch_pub_authorships` across 119,309 pubs
must complete before the write loop starts. Elapsed time is not a proxy for progress here.

### Replaced by hand with a set-based UPDATE (ran in minutes)

Every input already lives in Postgres, so the whole stage collapses to one statement:

```sql
WITH matched AS (
  SELECT pa.publication_id, pa.hcp_id,
         lower(trim(ae->>'author_position')) AS pos
  FROM publication_authors_v2 pa
  JOIN publications_v2 p ON p.id = pa.publication_id
  CROSS JOIN LATERAL jsonb_array_elements(p.authorships) AS ae
  JOIN hcp_openalex_authors_v2 hoa
    ON hoa.hcp_id = pa.hcp_id
   AND regexp_replace(ae->'author'->>'id',    '^.*/', '')
     = regexp_replace(hoa.openalex_author_id, '^.*/', '')
  WHERE p.source_therapeutic_area_id = 'a2b28e54-0e0e-48a7-98e1-504f48e45d81'
    AND jsonb_typeof(p.authorships) = 'array'
),
resolved AS (
  SELECT publication_id, hcp_id,
         bool_or(pos = 'first') AS is_first,
         bool_or(pos = 'last')  AS is_senior
  FROM matched
  GROUP BY publication_id, hcp_id
)
UPDATE publication_authors_v2 pa
SET is_first_author  = r.is_first,
    is_senior_author = r.is_senior
FROM resolved r
WHERE pa.publication_id = r.publication_id
  AND pa.hcp_id         = r.hcp_id;
```

Fidelity notes, so a future rewrite does not lose behaviour:

- `bool_or` reproduces the Python priority rule for free — where an HCP matches several authorship
  entries on one pub, `first`/`last` win over `middle` (`derive_position`, `:262`).
- Rows with no matching authorship entry are absent from `resolved` and keep
  `is_first_author = NULL` — the existing unresolved behaviour, not a regression.
- The `regexp_replace` pair reproduces `normalize_oa_id`'s bare-vs-URL folding on **both** sides.
- The script is documented idempotent (`UPDATE ... SET`, never append), so a killed row-by-row run
  leaves a partial-but-valid state that the set-based statement simply overwrites.

**Recurrence:** this hits every future first-build TA, not just CRC.

---

## 2. Children run without `-u` — the operator flies blind by construction

`py()` (`ta_cycle.py:235`) builds `[sys.executable, str(REPO_ROOT / SCRIPTS[key])]` with **no
`-u`**. `run_stage` gives every child `stdout=subprocess.PIPE`. Python block-buffers into a pipe at
8KB, and no stage sets `flush=True` or `reconfigure(line_buffering=True)`.

Stage 6 prints one progress line per 500 rows at roughly 30 bytes. **~270 lines — about 135,000
rows — must accumulate before a single line reaches the operator.**

The orchestrator's own `bufsize=1` on `Popen` does not help: it governs the *parent's read* side,
not the child's write side. `PYTHONIOENCODING=utf-8` in `child_env` sets encoding, not buffering.

Observed: `logs/crc-build-20260825.log` was last written at 10:33 and stayed frozen for 1h42m while
the stage was healthy and working. **Two hours were spent believing a working stage was hung.**

---

## 3. Stage 6 can half-complete with no guard, and NULL feeds the Established score

`run_stage` reports OK on exit status. Stage 6 has no post-stage assertion that the rows it targeted
are actually populated, so a killed or partially-failed run leaves `is_first_author` /
`is_senior_author` NULL on an arbitrary subset with the cycle continuing normally.

Those columns are read by `scripts/score/established_scoring.py:370` and `:519`:

```python
"hcp_id,publication_id,is_first_author,is_senior_author",
...
if auth.get("is_first_author") or auth.get("is_senior_author"):
```

A NULL is falsy in Python. An HCP whose rows were never written **silently loses first/senior-author
credit** — no error, no warning, a quietly lower Established score. This is the same silent-
degradation class as the `hcp_industry_classification_v1` INNER JOIN noted at `:1139`.

---

## 4. Stage 8f is executed but absent from the plan

Already recorded in `TA_GENERATION_LAYER.md` § *Open defects found during this audit*. Restated here
only for cross-reference: `ta_cycle.py:1145` runs
`run_stage(8, "in_corpus_pub_count(8f)", ...)`, while `print_plan` (`:824`) lists 8a–8e and jumps to
stage 9. Confirmed still present at 2026-08-25. Same omission class as the 12/13/13.5 gap fixed in
`234b5bf`, which patched only the stages named in that task and did not re-audit the 8-series.

---

## 5. No `--stop-after` (build ceiling on resume: FIXED 2026-08-29)

There is no `--stop-after` flag. The only early stop is the build ceiling
(`BUILD_MAX_STAGE = 12`), applied via
`max_stage = BUILD_MAX_STAGE if operation == "build" else MAX_STAGE`.

**~~That ceiling is unreachable on a resume.~~ FIXED 2026-08-29 by `--operation`.** As recorded,
`--build-mode new` ran Gate D on every invocation, so after stage 1 — when the TA is populated by
definition — `--resume-from N --build-mode new` always tripped it, and the only way through was
`--force-rebuild`: the wrong instrument, and a flag that stops being read once it is passed
routinely.

Gate D and the blast-radius confirmation are now **start-of-run only** (`resume_from is None`).
They are decisions about *starting* a multi-hour destructive build, not about continuing one, and
skipping them on a resume is safe precisely because `--operation` is persisted to
`run_state.json` and re-read — a resume can no longer change the operation, so there is nothing
for the gates to re-verify. `--resume-from 6 --operation build` now correctly stops at 12.

**Still open: there is no `--stop-after`.** The ceiling is the only early stop, and it is fixed at
12. An operator cannot resume into stage 6 and halt at, say, 8 — the CRC build's actual need.

---

*Recorded 2026-08-25 from the CRC first build. Evidence: live process inspection (PID 59832),
`publication_authors_v2` row counts against `.reingest_work/colorectal-cancer/batch_pubs.txt`,
90-second NULL-count sampling for the live write rate, and
`logs/reingest-nsclc-20260817-030001.log` for the incremental baseline. Note that log is
mixed-encoding — UTF-8 header, UTF-16 child output — and plain `grep` finds nothing in it; strip
null bytes before reading.*
