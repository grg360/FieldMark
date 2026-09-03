# State provenance — run sheet

## Just run this

```powershell
cd C:\Users\garre\Desktop\FieldMark
.\scripts\run_state_provenance.ps1 -StartAt 3
```

That runs steps 3 through 12 in order, stops on the first error, and writes a
log to `docs/state_provenance/run_<timestamp>.log`. Steps 1 and 2 are already
done. Add `-WhatIf` to see the plan without running anything.

Steps 13, 13b and 14 are not in the script on purpose — they run after the
frontend ships and you have eyes on the live site.

To run one file by hand:

```powershell
$env:PYTHONIOENCODING = "utf-8"
python scripts/utilities/run_sql.py --file docs/state_provenance/03_boards.sql
```

Note `--file`. Without it, run_sql.py treats the path as SQL.

## Part 1 — the readers

| # | File | Expect |
|---|------|--------|
| 1 | `01_grant_snapshot_BEFORE.sql` | **18 rows.** Keep the output. |
| 2 | `02_null_artifacts.sql` | `UPDATE 54` |
| 3 | `03_boards.sql` | `GRANT`. No error is the pass. |
| 4 | `04_filtered_family.sql` | `GRANT`. No error is the pass. |
| 5 | `05_verify_filtered.sql` | 7 rows, `has_institution_state` and `has_state_basis` **true on all 7**. Send me this. |
| 6 | `06_merge_invariant.sql` | `CREATE FUNCTION`. No error is the pass. |
| 7 | `07_roster_view.sql` | `GRANT`. No error is the pass. |
| 8 | `08_grant_check_AFTER.sql` | 18 rows, all three boolean columns **true on all 18**. Send me this. |
| 9 | `09_verify_data.sql` | Numbers. Send me this. |

If 3, 4, 6 or 7 errors: nothing partial applied. `run_sql.py` sends the whole
file as one statement, so Postgres wraps it in one transaction and rolls the
whole thing back. Send me the error and re-run nothing.

## Part 2 — the constraints

| # | File | Expect |
|---|------|--------|
| 10 | `10_constraint_npi.sql` | `ALTER TABLE` |
| 11 | `11_constraint_source.sql` | `ALTER TABLE`. **Can legitimately fail** if a row has a state with no source. If it errors, stop and send it. Do not add `NOT VALID` to get past it. |
| 12 | `12_verify_constraints.sql` | Both constraints listed |

## Part 3 — ship the frontend

Commit and push the modified frontend files. Wait for the Cloudflare build.
Then on the live site confirm **both**:

- CRC Cohort Ledger — states showing
- People feed — states showing

Both must render before Part 4. Last cheap rollback point.

## Part 4 — the clear

| # | File | Expect |
|---|------|--------|
| 13 | `13_clear_state.sql` | ~14,676 rows |
| 13b | `13b_clear_city.sql` | ~2,436 rows |
| 14 | `14_verify_clear.sql` | `state_without_npi` = **2**. Any other number, roll back. |

## Rollback

Block 9 of `docs/2026_09_02_state_provenance_separation.sql`. Restores from the
snapshot table created by block 1. **Do not drop that snapshot table.**

## Source

Split from `docs/2026_09_02_state_provenance_readers.sql`, which stays the
canonical document. These are the same statements, one per file, so a paste
can't pick up the wrong span. `S1b` has no SQL — it is a written decision about
`institution_city` — which is why there is no file for it.
