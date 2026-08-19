# emergence_scoring crashes before its write, and the chain still reports success

**Status:** open, worked around rather than fixed. Logged 2026-08-18.
**File:** `scripts/score/emergence_scoring.py`
**Table left behind:** `hcp_scientific_emergence_v1`

## The shape of the defect

`main()` prints a diagnostic top-N table and *then* writes:

```
:376   print(f"{i:<4} {name[:23]:<24} ...")      ← debug table, one line per HCP
:387   if write:
:388       written = upsert_results(conn, ta_id, results, run_id)
```

Any failure in that print aborts the process **before** `upsert_results` is reached. The
scoring itself has already completed correctly and is discarded.

The trigger today is an encoding one — a name containing U+2010 (non-breaking hyphen), the
`Yi‑Long Wu` family, printed to a cp1252 console:

```
UnicodeEncodeError: 'charmap' codec can't encode character '‐' in position 16
  emergence_scoring.py:376, in main
```

**The encoding is not the defect worth recording.** The defect is the ordering: a diagnostic
print stands between the computation and the write, so a cosmetic failure in output
formatting silently costs a table its update. Run inside a chain of scorers, the other seven
succeed, the operator sees a chain that completed, and `hcp_scientific_emergence_v1` is left
holding the previous run's values with nothing to indicate it.

That happened to matter on 2026-08-18: the eight-script percentile-convention rescore would
have left this one table on the old convention while every other table moved to the new one,
and the chain would have reported success.

## Verified pre-existing

`HEAD`'s copy of the file, run unmodified, fails identically. The 2026-08-18 percentile edit
touches only `compute_percentile_ranks` (`@@ -131,14 +131,25 @@`) and is order-preserving, so
the same names reach the same debug table either way.

## Worked around, not fixed

The rescore runs step 5 as:

```bash
PYTHONIOENCODING=utf-8 python scripts/score/emergence_scoring.py --ta nsclc
```

This was a deliberate choice: the script belongs to a different line of work, and changing
another agent's file to fix a print was the wrong intervention mid-sequence.

## Fix, when taken

Move the write above the diagnostic print, or wrap the print. The write is the load-bearing
half and should not be reachable only by getting console formatting right. A `try/except`
around the debug block would be enough; moving `upsert_results` ahead of it is better, because
it makes the ordering intentional rather than lucky.

Worth checking the sibling scorers for the same shape — several print a debug top-N in `main()`
and the position of that print relative to the write has not been audited.
