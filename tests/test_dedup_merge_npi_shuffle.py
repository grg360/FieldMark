"""Behavioural test for the NPI shuffle in scripts/dedup/dedup_merge.py.

Runs with pytest, or standalone:  python tests/test_dedup_merge_npi_shuffle.py

WHY THIS EXISTS
---------------
On 2026-09-06 the validated CHECK constraint `nppes_state_has_nppes_provenance`
landed on hcps_v2:

    nppes_practice_state IS NULL OR npi_number IS NOT NULL OR nppes_enriched_at IS NOT NULL

dedup_merge frees the unique NPI slot before moving the number to the survivor:

    UPDATE hcps_v2 SET npi_number = NULL WHERE id = <stub_id>          -- the shuffle
    ...
    DELETE FROM hcps_v2 WHERE id = <stub_id>                           -- much later

Between those two statements the stub holds a state, no NPI and (for registry-minted
rows) no enriched_at. Postgres re-checks the constraint on the row an UPDATE touches,
so the merge aborts. 6,547 rows in hcps_v2 are that exact shape AND are reachable as
merge stubs. Every merge on one of them would have failed, been swallowed by the
per-pair try/except, and left stage 7 exiting 0.

WHY IT COULD NOT BE CAUGHT ANY OTHER WAY
----------------------------------------
`--dry-run` returns before the offending branch: the shuffle is planned into the
`moved` dict and no UPDATE is issued. So the repo's standing "dry-run first"
discipline passes clean on a merge that cannot work. The only way to test this
branch is to execute it -- which this test does, inside a transaction it rolls back.

WHAT IT ASSERTS
---------------
Against a synthetic pair in the exact failing shape:
  1. the merge completes without raising (no constraint fires),
  2. the survivor ends up holding the stub's NPI,
  3. the survivor ends up holding the stub's state AND city -- the values are NOT
     lost by the clear, because the payload is read out of an in-memory dict before
     the clear runs,
  4. the stub row is gone.

DATABASE
--------
Needs DATABASE_URL. Writes NOTHING: every statement runs inside one transaction that
is unconditionally rolled back, including on assertion failure. The synthetic rows use
a reserved NPI outside the real registry's issued range and are asserted absent before
insert, so a leaked row would be obvious rather than plausible.
"""
import os
import sys
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts" / "dedup"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO_ROOT / ".env")

import dedup_merge as dm  # noqa: E402

# NPPES has never issued an NPI beginning 0; the check digit scheme starts them at 1.
# So this cannot collide with a real record even if one leaked.
SYNTHETIC_NPI = "0000000001"
SYNTHETIC_STATE = "TX"
SYNTHETIC_CITY = "HOUSTON"


def _insert_pair(cur):
    """A publication-derived survivor with no NPI, and a registry-shaped stub with one.

    The stub is the 6,547-row shape: npi_number set, nppes_practice_state set,
    nppes_enriched_at NULL. That combination is legal at rest and illegal the moment
    the NPI is removed, which is the whole defect.
    """
    survivor_id = str(uuid.uuid4())
    stub_id = str(uuid.uuid4())

    cur.execute(
        "INSERT INTO hcps_v2 (id, first_name, last_name, npi_number, "
        "nppes_practice_state, nppes_practice_city, nppes_enriched_at, total_career_pubs) "
        "VALUES (%s, %s, %s, NULL, NULL, NULL, NULL, %s)",
        (survivor_id, "Testcase", "Npishuffle", 250),
    )
    cur.execute(
        "INSERT INTO hcps_v2 (id, first_name, last_name, npi_number, "
        "nppes_practice_state, nppes_practice_city, nppes_enriched_at, total_career_pubs) "
        "VALUES (%s, %s, %s, %s, %s, %s, NULL, %s)",
        (stub_id, "Testcase", "Npishuffle", SYNTHETIC_NPI, SYNTHETIC_STATE, SYNTHETIC_CITY, 0),
    )
    return survivor_id, stub_id


def test_npi_shuffle_moves_npi_state_and_city_without_violating_provenance():
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(dm.get_db_url(), row_factory=dict_row) as conn:
        conn.autocommit = False
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT count(*) AS n FROM hcps_v2 WHERE npi_number = %s",
                    (SYNTHETIC_NPI,),
                )
                assert cur.fetchone()["n"] == 0, (
                    f"synthetic NPI {SYNTHETIC_NPI} already present -- a previous run leaked. "
                    "Investigate before trusting this test."
                )

                survivor_id, stub_id = _insert_pair(cur)

                # THE BRANCH UNDER TEST. dry_run=False deliberately: dry_run=True returns
                # before the UPDATE and would pass against the broken code.
                dm.merge_record_into_survivor(cur, survivor_id, stub_id, dry_run=False)

                cur.execute(
                    "SELECT npi_number, nppes_practice_state, nppes_practice_city "
                    "FROM hcps_v2 WHERE id = %s",
                    (survivor_id,),
                )
                survivor = cur.fetchone()
                assert survivor is not None, "survivor row vanished"
                assert survivor["npi_number"] == SYNTHETIC_NPI, (
                    f"survivor did not take the NPI: {survivor['npi_number']!r}"
                )
                assert survivor["nppes_practice_state"] == SYNTHETIC_STATE, (
                    "survivor lost the state -- the clear ran before the payload was read, "
                    f"got {survivor['nppes_practice_state']!r}"
                )
                assert survivor["nppes_practice_city"] == SYNTHETIC_CITY, (
                    "survivor lost the city -- the clear ran before the payload was read, "
                    f"got {survivor['nppes_practice_city']!r}"
                )

                cur.execute("SELECT count(*) AS n FROM hcps_v2 WHERE id = %s", (stub_id,))
                assert cur.fetchone()["n"] == 0, "stub row was not deleted"
        finally:
            # Unconditional. An assertion failure must leave the database exactly as found.
            conn.rollback()


def test_dry_run_cannot_reach_the_branch():
    """Guard the reason this test has to execute: dry_run plans the shuffle, never runs it.

    If someone later makes dry_run issue the UPDATE, this test fails and tells them the
    test above is no longer the only coverage -- rather than leaving two paths silently
    diverging.
    """
    import inspect

    src = inspect.getsource(dm.merge_record_into_survivor)
    head, _, tail = src.partition("if dry_run:")
    assert tail, "merge_record_into_survivor no longer branches on dry_run"
    planned, _, executed = tail.partition("elif move_npi:")
    assert executed, "the NPI shuffle is no longer on an elif move_npi branch"
    assert "UPDATE hcps_v2" not in planned, (
        "dry_run now issues an UPDATE -- the 'dry-run cannot reach this' premise is stale"
    )


if __name__ == "__main__":
    if not os.getenv("DATABASE_URL"):
        print("SKIP  DATABASE_URL not set; this test needs a database (it rolls back).")
        sys.exit(0)
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS  {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL  {name}\n      {exc}")
            except Exception as exc:  # a constraint violation arrives as an exception, not an assert
                failures += 1
                print(f"FAIL  {name}\n      {type(exc).__name__}: {exc}")
    print(f"\n{'ALL PASS' if not failures else str(failures) + ' FAILED'}")
    sys.exit(1 if failures else 0)
