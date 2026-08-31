"""
FieldMark - Stage 9b: derive authorship position into publication_authors_v2 (read+update).

Populates, per publication_authors_v2 row:
  - is_first_author  = (OpenAlex author_position == 'first')
  - is_senior_author = (OpenAlex author_position == 'last')
  - author_position  = the OpenAlex position label/index (see AUTHOR_POSITION COLUMN below)

WHY THIS EXISTS: Step F (rebuild_publication_authors_v2.py) hardcodes these three columns to
NULL, so the scientific scorer's first/senior-author signals are DEAD without this step. It
was previously only ever run as manual ad-hoc SQL (TA_BUILD_DEBT sec 29m) and never committed.
This is the committed implementation of ROADMAP sec 9b.

*** ORDERING: THIS MUST RUN RIGHT AFTER STEP F. ***
Step F (rebuild_publication_authors_v2.py) is what CREATES the publication_authors_v2 rows
this step UPDATEs. Run 9b immediately after Step F links the batch's new pubs; running it
before Step F would find no rows to update for the new pubs.

JOIN PATH (same id-normalization discipline as the rest of the pipeline):
  publication_authors_v2 (publication_id, hcp_id)
    -> the HCP's OpenAlex author ids via hcp_openalex_authors_v2 (openalex_author_id)
    -> match against publications_v2.authorships[].author.id for that publication_id
    -> read that entry's authorships[].author_position ('first' | 'middle' | 'last')
OpenAlex ids are normalized to the full-URL form (bare vs URL folded) on both sides.
An HCP may have multiple OpenAlex shards; if any shard matches an authorship entry, its
position is used. If several entries match with DIFFERENT positions (should not happen on one
pub), 'first'/'last' win over 'middle' and the anomaly is logged.

AUTHOR_POSITION COLUMN - schema conflict, read this:
  phase1_schema.sql declares author_position TEXT; the later
  phase1_addendum_3_publications_v2_correction.sql declares it INTEGER. CONFIRM the LIVE type
  before --execute. --author-position-mode controls what is written there:
    label (default) : the 'first'/'middle'/'last' STRING  -> requires a TEXT column
    index           : the 0-based author index (INTEGER)  -> for an INTEGER column
    skip            : do not touch author_position (write only the two booleans)
  The is_first_author / is_senior_author BOOLEANS - the actual scorer signal - are always
  derived from the OpenAlex position LABEL and are written regardless of this mode. They are
  written in a SEPARATE update from author_position, so an author_position type mismatch can
  never block the booleans from landing.

SCOPING (incremental-ready): --pub-ids-file (the batch's new pubs - the natural minimal scope
for 9b, since Step F just created exactly those rows) and/or --candidate-hcp-ids-file /
--hcp-ids-file (affected.txt). Both given => AND (rows on those pubs authored by those HCPs).
No flag => whole corpus (backward compatible).

IDEMPOTENT: re-running overwrites the same derived values (UPDATE ... SET, never append). A
pub whose authorships JSON is null/missing (e.g. the too-new-for-OpenAlex pubs) leaves its
rows' positions NULL, counted and reported, never crashing.

Flags: --dry-run (default) / --execute, --pub-ids-file, --candidate-hcp-ids-file / --hcp-ids-file,
       --author-position-mode {label,index,skip}, --target-version v2.

Env: SUPABASE_URL, SUPABASE_KEY (via python-dotenv).
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

READ_PAGE_SIZE = 1000
IN_CHUNK_SIZE = 100
MAX_RETRIES = 5


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


def env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing env var: {name}")
    return v


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


# ============================================================
# Set-based write path (stage 6's 13.3-hour problem)
# ============================================================
#
# THE PER-ROW PATH IS ONE HTTP UPDATE PER ROW. Measured: 583 rows / 28.7s weekly (~20 rows/s),
# and 631,928 rows on the 2026-08-25 CRC first build at 13 rows/s = 13.3 HOURS. It was killed
# mid-run and finished by hand with chunked SQL in minutes. Every input already lives in
# Postgres, so the whole derivation collapses to one UPDATE ... FROM and no round-trip is
# warranted at all. See docs/canonical/ORCHESTRATOR_DEBT.md section 1.
#
# FIDELITY -- WHERE THE RECORDED SQL WAS WRONG. That doc says "bool_or reproduces the Python
# priority rule for free". It does not, in one case, and the case is real:
#
#   derive_position() ranks an HCP's matching authorship entries by
#       (0 if label in ('first','last') else 1, array_index)
#   and takes exactly ONE winner, so is_first and is_senior are MUTUALLY EXCLUSIVE by
#   construction. bool_or(pos='first') / bool_or(pos='last') computed independently sets BOTH
#   true when an HCP matches a 'first' entry AND a 'last' entry on the same publication.
#
#   Measured 2026-08-29: 40 such (pub, hcp) pairs in CRC, 11 in NSCLC -- rare, but exactly the
#   rows the script's own `anomaly` branch exists to flag. bool_or would have written a
#   simultaneously-first-and-senior author on every one of them.
#
# DISTINCT ON with that ORDER BY reproduces the ranking exactly: priority class first, array
# ordinal as the tiebreak, one row out. Two further fidelity points the recorded SQL missed:
#
#   * COALESCE on the comparisons. Python writes False for a matched entry whose
#     author_position is missing; `pos = 'first'` yields NULL, not false. (0 such entries in
#     CRC today, but the column is nullable and the loop's behaviour is defined.)
#   * WITH ORDINALITY. The ranking needs the array index; the recorded SQL had no ordinal and
#     so could not have implemented the tiebreak even in principle.
#
# Rows whose HCP matches no authorship entry stay absent from `resolved` and keep
# is_first_author = NULL -- the existing unresolved behaviour, matching the loop's `label is
# None` branch.

#: Statement timeout per chunk. A chunk that exceeds it is SPLIT, not failed -- see
#: run_set_based_update. Deliberately short: discovering a too-big chunk quickly is cheaper
#: than waiting out a slow one.
SET_BASED_CHUNK_TIMEOUT = "180s"
#: Stop splitting here. 2^6 = 64 slices of the uuid space; the hand-run needed 6.
MAX_CHUNK_DEPTH = 6
#: Below this many target rows the per-row path is left alone -- see choose_write_path.
SET_BASED_MIN_ROWS = 5000

_UUID_MAX = (1 << 128) - 1


def _int_to_uuid(n: int) -> str:
    h = f"{n:032x}"
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _pg_connect():
    """Direct Postgres connection. Local import so the per-row path needs neither psycopg
    nor DATABASE_URL -- that is the whole reason the per-row path stays available."""
    import psycopg
    return psycopg.connect(env("DATABASE_URL"))


#: The derivation, as one statement. `{scope}` is an optional extra predicate; lo/hi bound the
#: publication_id range so a chunk can be split without changing the logic.
DERIVE_SQL = """
WITH matched AS (
  SELECT pa.publication_id,
         pa.hcp_id,
         lower(trim(ae.elem->>'author_position')) AS pos,
         ae.ord                                   AS ord
  FROM publication_authors_v2 pa
  JOIN publications_v2 p ON p.id = pa.publication_id
  CROSS JOIN LATERAL jsonb_array_elements(p.authorships) WITH ORDINALITY AS ae(elem, ord)
  JOIN hcp_openalex_authors_v2 hoa
    ON hoa.hcp_id = pa.hcp_id
   AND regexp_replace(ae.elem->'author'->>'id', '^.*/', '')
     = regexp_replace(hoa.openalex_author_id,   '^.*/', '')
  WHERE jsonb_typeof(p.authorships) = 'array'
    AND pa.publication_id >= %(lo)s::uuid
    AND pa.publication_id <= %(hi)s::uuid
    {scope}
),
resolved AS (
  -- EXACTLY derive_position()'s rank(): priority class, then array ordinal, take one.
  SELECT DISTINCT ON (publication_id, hcp_id)
         publication_id, hcp_id, pos, ord
  FROM matched
  ORDER BY publication_id, hcp_id,
           (CASE WHEN pos IN ('first', 'last') THEN 0 ELSE 1 END),
           ord
)
"""

UPDATE_TAIL = """
UPDATE publication_authors_v2 pa
SET is_first_author  = COALESCE(r.pos = 'first', false),
    is_senior_author = COALESCE(r.pos = 'last',  false){extra}
FROM resolved r
WHERE pa.publication_id = r.publication_id
  AND pa.hcp_id         = r.hcp_id
"""

COUNT_TAIL = """
SELECT count(*)                                                  AS resolved,
       count(*) FILTER (WHERE pos = 'first')                     AS is_first_true,
       count(*) FILTER (WHERE pos = 'last')                      AS is_senior_true,
       count(*) FILTER (WHERE pos IS DISTINCT FROM 'first'
                          AND pos IS DISTINCT FROM 'last')       AS middle
FROM resolved
"""


def _scope_clause(pub_ids: Set[str], hcp_ids: Set[str]) -> str:
    """Extra predicates for the temp scope tables. Empty when the run is whole-corpus."""
    parts = []
    if pub_ids:
        parts.append("AND pa.publication_id IN (SELECT id FROM _s6_pubs)")
    if hcp_ids:
        parts.append("AND pa.hcp_id IN (SELECT id FROM _s6_hcps)")
    return ("\n    ").join(parts)


def _load_scope_tables(cur, pub_ids: Set[str], hcp_ids: Set[str]) -> None:
    """Materialise the id filters ONCE as indexed temp tables rather than shipping a 147k-element
    array into every chunk. Same scope semantics as the per-row path's read_ids_file sets."""
    for name, ids in (("_s6_pubs", pub_ids), ("_s6_hcps", hcp_ids)):
        if not ids:
            continue
        cur.execute(f"CREATE TEMP TABLE {name} (id uuid PRIMARY KEY) ON COMMIT DROP")
        with cur.copy(f"COPY {name} (id) FROM STDIN") as cp:
            for i in sorted(ids):
                cp.write_row((i,))
        cur.execute(f"ANALYZE {name}")


def run_set_based_update(
    pub_ids: Set[str], hcp_ids: Set[str], author_position_mode: str, execute: bool,
) -> Dict[str, int]:
    """The whole derivation as chunked SQL. Returns the same counters the loop produced.

    CHUNKING IS AUTOMATIC AND ADAPTIVE, not a parameter. The uuid space starts as ONE range;
    any range whose statement exceeds SET_BASED_CHUNK_TIMEOUT is bisected and both halves are
    pushed back onto the queue. That is strictly better than a fixed slice count: the hand-run
    guessed six and got lucky, whereas bisection finds whatever the data and the server need
    today, and needs no tuning when the corpus doubles. The statement is idempotent
    (UPDATE ... SET), so a timed-out chunk that already did partial work is simply redone.
    """
    import psycopg
    from psycopg import errors as pg_errors

    counts: Dict[str, int] = {
        "examined": 0, "resolved": 0, "is_first_true": 0, "is_senior_true": 0,
        "middle": 0, "null_position": 0, "chunks": 0, "splits": 0,
    }
    scope = _scope_clause(pub_ids, hcp_ids)
    # index mode writes the 0-based array position, matching the loop's `idx`.
    extra = (",\n    author_position  = (r.ord - 1)::int"
             if author_position_mode == "index" else "")

    conn = _pg_connect()
    try:
        with conn.cursor() as cur:
            _load_scope_tables(cur, pub_ids, hcp_ids)

            # `examined` is the same population the loop counted: rows in scope, before any
            # derivation. Read from the target table so the number is evidence, not self-report.
            cur.execute(
                "SELECT count(*) FROM publication_authors_v2 pa WHERE true " + scope
            )
            counts["examined"] = int(cur.fetchone()[0])

            queue: List[Tuple[int, int, int]] = [(0, _UUID_MAX, 0)]   # (lo, hi, depth)
            while queue:
                lo, hi, depth = queue.pop()
                params = {"lo": _int_to_uuid(lo), "hi": _int_to_uuid(hi)}
                body = DERIVE_SQL.format(scope=scope)
                try:
                    cur.execute(f"SET statement_timeout = '{SET_BASED_CHUNK_TIMEOUT}'")
                    cur.execute(body + COUNT_TAIL, params)
                    r = cur.fetchone()
                    if execute:
                        cur.execute(body + UPDATE_TAIL.format(extra=extra), params)
                    counts["resolved"] += int(r[0])
                    counts["is_first_true"] += int(r[1])
                    counts["is_senior_true"] += int(r[2])
                    counts["middle"] += int(r[3])
                    counts["chunks"] += 1
                    conn.commit()
                except (pg_errors.QueryCanceled, psycopg.OperationalError):
                    conn.rollback()
                    if depth >= MAX_CHUNK_DEPTH or lo >= hi:
                        raise RuntimeError(
                            f"chunk [{_int_to_uuid(lo)}, {_int_to_uuid(hi)}] still exceeds "
                            f"{SET_BASED_CHUNK_TIMEOUT} at split depth {depth}; refusing to "
                            f"split further. Raise MAX_CHUNK_DEPTH or investigate the plan."
                        )
                    mid = (lo + hi) // 2
                    queue.append((mid + 1, hi, depth + 1))
                    queue.append((lo, mid, depth + 1))
                    counts["splits"] += 1
                    print(f"  chunk too slow at depth {depth}; split into 2 "
                          f"(total splits: {counts['splits']})", flush=True)
        counts["null_position"] = counts["examined"] - counts["resolved"]
        return counts
    finally:
        conn.close()


def count_target_rows_cheap(pub_ids: Set[str], hcp_ids: Set[str]) -> Optional[int]:
    """Target row count via one COUNT, so the path can be chosen before the slow read.

    Best-effort: if this cannot run (no DATABASE_URL, no psycopg, unreachable) the caller gets
    None and falls back to the per-row path, which is the pre-existing behaviour.
    """
    try:
        conn = _pg_connect()
    except Exception:
        return None
    try:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = '60s'")
            _load_scope_tables(cur, pub_ids, hcp_ids)
            cur.execute("SELECT count(*) FROM publication_authors_v2 pa WHERE true "
                        + _scope_clause(pub_ids, hcp_ids))
            return int(cur.fetchone()[0])
    except Exception:
        return None
    finally:
        conn.close()


def report_set_based(counts: Dict[str, int], execute: bool,
                     author_position_mode: str, t0: float) -> None:
    """The same summary block the per-row path prints, from the same counters.

    Deliberately the SAME shape: whichever path ran, the operator reads one report and
    ta_cycle's postcheck reads one target table. The two lines the per-row path cannot produce
    (chunking) are additive, and the two it can that this cannot (per-row anomaly list, sample
    rows) are named as absent rather than silently dropped.
    """
    print("\n" + "=" * 66)
    print("STAGE 9b - SUMMARY (set-based)")
    print("=" * 66)
    print(f"  rows examined:            {counts['examined']:,}")
    print(f"  rows resolved (position): {counts['resolved']:,}")
    print(f"    is_first_author=true:   {counts['is_first_true']:,}")
    print(f"    is_senior_author=true:  {counts['is_senior_true']:,}")
    print(f"    middle (both false):    {counts['middle']:,}")
    print(f"  null-position (unresolved): {counts['null_position']:,}  "
          f"(no matching author entry, or authorships JSON absent)")
    print(f"  chunks executed:          {counts['chunks']:,}"
          + (f"  ({counts['splits']} adaptive split(s))" if counts["splits"] else "  (no splits needed)"))
    print("  NOTE: the per-row path's anomaly list and validation samples are not produced by")
    print("        this path -- the winner is chosen inside the DISTINCT ON, not in Python.")
    if execute:
        pos_note = ("" if author_position_mode == "skip"
                    else f", author_position written as {author_position_mode}")
        print(f"\n  UPDATES: {counts['resolved']:,} rows updated{pos_note}")
    else:
        print(f"\n  *** DRY-RUN: no writes. Would update {counts['resolved']:,} rows. ***")
    print(f"\n  Wall time: {time.time() - t0:.1f}s")


def choose_write_path(
    requested: str, examined: Optional[int], author_position_mode: str,
) -> Tuple[str, str]:
    """(path, reason). AUTOMATIC ON SIZE, with an explicit override -- and the reasoning:

    The set-based path is strictly faster at every size, so 'always use it' was tempting. It is
    NOT the default unconditionally for two reasons that are about capability, not speed:

      1. It needs DATABASE_URL and psycopg. The per-row path needs only SUPABASE_URL/KEY. A
         machine or CI job that has one and not the other must still be able to run the stage.
      2. --author-position-mode label writes a STRING to author_position. The live column is
         INTEGER (measured), so label mode is already the wrong instrument; rather than
         silently reinterpret it, the set-based path declines it and says so.

    The 583-row weekly case takes 29 seconds on the per-row path. That is not worth the risk of
    a rewrite it does not need, which is why the switch is on SIZE and the small case is left
    exactly as it was.
    """
    if requested == "row":
        return "row", "--write-mode row"
    if author_position_mode == "label":
        return "row", ("--author-position-mode label writes a string; the set-based path "
                       "handles skip and index only")
    if not os.getenv("DATABASE_URL"):
        return "row", "DATABASE_URL not set (the set-based path needs a direct connection)"
    if requested == "set":
        return "set", "--write-mode set"
    if examined is not None and examined < SET_BASED_MIN_ROWS:
        return "row", (f"{examined:,} target rows < {SET_BASED_MIN_ROWS:,}; the per-row path "
                       f"costs seconds at this size")
    return "set", (f"{examined:,} target rows >= {SET_BASED_MIN_ROWS:,}"
                   if examined is not None else "work-set size unknown")


def get_table_name(base: str, target_version: str) -> str:
    return f"{base}_v2" if target_version == "v2" else base


def normalize_oa_id(value: Any) -> str:
    """Full-URL OpenAlex author id (matches hcp_openalex_authors_v2 storage). Folds bare/URL."""
    s = str(value or "").strip()
    if not s:
        return ""
    if s.startswith("https://openalex.org/"):
        return s
    tail = s.split("/")[-1]
    return f"https://openalex.org/{tail}" if tail else ""


def read_ids_file(path: str) -> Set[str]:
    out: Set[str] = set()
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if s and not s.startswith("#"):
                out.add(s)
    return out


def _execute_with_retry(build, *, what: str) -> List[Dict[str, Any]]:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return build().execute().data or []
        except Exception as exc:  # noqa: BLE001
            if attempt >= MAX_RETRIES:
                raise RuntimeError(f"{what}: gave up after {attempt} attempts: {exc}") from exc
            wait = min(2.0 ** attempt, 20.0)
            eprint(f"[retry] {what}: attempt {attempt} failed ({type(exc).__name__}: {exc}); "
                   f"retrying in {wait:.0f}s")
            time.sleep(wait)
    return []


def fetch_rows_in(
    client: Client, table: str, columns: str, filter_col: str, values: List[str], order_col: str
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    vals = sorted(set(values))
    for i in range(0, len(vals), IN_CHUNK_SIZE):
        chunk = vals[i : i + IN_CHUNK_SIZE]
        offset = 0
        while True:
            current = offset

            def build(_chunk: List[str] = chunk, _off: int = current) -> Any:
                return (
                    client.table(table).select(columns).in_(filter_col, _chunk)
                    .order(order_col).range(_off, _off + READ_PAGE_SIZE - 1)
                )

            batch = _execute_with_retry(build, what=f"{table}.in_({filter_col})")
            if not batch:
                break
            out.extend(batch)
            if len(batch) < READ_PAGE_SIZE:
                break
            offset += READ_PAGE_SIZE
    return out


def fetch_all_target_rows(client: Client, pa_table: str) -> List[Dict[str, Any]]:
    """Whole-corpus publication_authors_v2 rows via offset pagination (composite PK)."""
    out: List[Dict[str, Any]] = []
    offset = 0
    while True:
        current = offset

        def build(_off: int = current) -> Any:
            return (
                client.table(pa_table).select("publication_id,hcp_id")
                .order("publication_id").range(_off, _off + READ_PAGE_SIZE - 1)
            )

        batch = _execute_with_retry(build, what=f"{pa_table} full scan")
        if not batch:
            break
        out.extend(batch)
        if len(batch) < READ_PAGE_SIZE:
            break
        offset += READ_PAGE_SIZE
    return out


def fetch_target_rows(
    client: Client, pa_table: str, pub_ids: Set[str], hcp_ids: Set[str]
) -> List[Tuple[str, str]]:
    """(publication_id, hcp_id) rows to update, per scope. Both filters => AND."""
    if pub_ids:
        rows = fetch_rows_in(
            client, pa_table, "publication_id,hcp_id", "publication_id", sorted(pub_ids), "hcp_id"
        )
        if hcp_ids:
            rows = [r for r in rows if str(r.get("hcp_id")) in hcp_ids]
    elif hcp_ids:
        rows = fetch_rows_in(
            client, pa_table, "publication_id,hcp_id", "hcp_id", sorted(hcp_ids), "publication_id"
        )
    else:
        rows = fetch_all_target_rows(client, pa_table)
    out: List[Tuple[str, str]] = []
    for r in rows:
        pid = str(r.get("publication_id") or "")
        hid = str(r.get("hcp_id") or "")
        if pid and hid:
            out.append((pid, hid))
    return out


def fetch_pub_authorships(client: Client, pub_ids: Set[str]) -> Dict[str, Any]:
    """{publication_id: authorships JSON (list or None)}."""
    rows = fetch_rows_in(client, "publications_v2", "id,authorships", "id", sorted(pub_ids), "id")
    return {str(r.get("id")): r.get("authorships") for r in rows if r.get("id")}


def fetch_hcp_oa_ids(client: Client, hcp_table: str, hcp_ids: Set[str]) -> Dict[str, Set[str]]:
    """{hcp_id: {normalized openalex_author_id, ...}} from hcp_openalex_authors_v2."""
    rows = fetch_rows_in(
        client, hcp_table, "hcp_id,openalex_author_id", "hcp_id", sorted(hcp_ids), "hcp_id"
    )
    out: Dict[str, Set[str]] = defaultdict(set)
    for r in rows:
        hid = str(r.get("hcp_id") or "")
        oid = normalize_oa_id(r.get("openalex_author_id"))
        if hid and oid:
            out[hid].add(oid)
    return dict(out)


# ============================================================
# Derivation (PURE - unit-testable)
# ============================================================


def derive_position(
    authorships: Any, hcp_oa_ids: Set[str]
) -> Tuple[Optional[str], bool, bool, Optional[int], Optional[str]]:
    """Return (label, is_first, is_senior, index, anomaly).

    label   : 'first'|'middle'|'last' or None if unresolved (null authorships / no match).
    is_first/is_senior derived from the OpenAlex position LABEL (authoritative).
    index   : 0-based position of the matched authorship entry in the array.
    anomaly : set when >1 entries match this HCP with differing positions.
    """
    if not isinstance(authorships, list) or not hcp_oa_ids:
        return (None, False, False, None, None)

    # Fold BOTH sides to the full-URL form (caller normally passes normalized ids, but
    # normalize here too so the match never depends on the caller's id form).
    hcp_norm = {normalize_oa_id(x) for x in hcp_oa_ids}
    hcp_norm.discard("")
    if not hcp_norm:
        return (None, False, False, None, None)

    matches: List[Tuple[int, Optional[str]]] = []
    for idx, a in enumerate(authorships):
        if not isinstance(a, dict):
            continue
        author = a.get("author")
        if not isinstance(author, dict):
            continue
        oid = normalize_oa_id(author.get("id"))
        if oid and oid in hcp_norm:
            raw = a.get("author_position")
            label = str(raw).strip().lower() if raw not in (None, "") else None
            matches.append((idx, label))

    if not matches:
        return (None, False, False, None, None)

    # Prefer first/last over middle when an HCP matches multiple entries on one pub.
    def rank(m: Tuple[int, Optional[str]]) -> Tuple[int, int]:
        return (0 if m[1] in ("first", "last") else 1, m[0])

    chosen_idx, chosen_label = sorted(matches, key=rank)[0]
    distinct = {m[1] for m in matches}
    anomaly = None
    if len(distinct) > 1:
        anomaly = (f"HCP matched {len(matches)} authorship entries with positions "
                   f"{sorted(str(d) for d in distinct)} -> chose '{chosen_label}'")
    return (chosen_label, chosen_label == "first", chosen_label == "last", chosen_idx, anomaly)


# ============================================================
# Writes (idempotent UPDATE ... SET; booleans separate from author_position)
# ============================================================


def update_booleans(client: Client, pa_table: str, pub_id: str, hcp_id: str,
                    is_first: bool, is_senior: bool) -> Tuple[bool, Optional[str]]:
    try:
        client.table(pa_table).update(
            {"is_first_author": is_first, "is_senior_author": is_senior}
        ).eq("publication_id", pub_id).eq("hcp_id", hcp_id).execute()
        return True, None
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def update_author_position(client: Client, pa_table: str, pub_id: str, hcp_id: str,
                          value: Any) -> Tuple[bool, Optional[str]]:
    try:
        client.table(pa_table).update(
            {"author_position": value}
        ).eq("publication_id", pub_id).eq("hcp_id", hcp_id).execute()
        return True, None
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


# ============================================================
# Main
# ============================================================


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Stage 9b: derive authorship position into publication_authors_v2.")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Compute + report, write nothing (default).")
    mode.add_argument("--execute", action="store_true", help="Perform the UPDATEs.")
    p.add_argument("--pub-ids-file", metavar="PATH",
                   help="Scope to publication_authors_v2 rows on these pub ids (the batch's new pubs).")
    p.add_argument("--candidate-hcp-ids-file", "--hcp-ids-file", dest="hcp_ids_file", metavar="PATH",
                   help="Scope to these HCP ids (reuse affected.txt). Both filters given => AND.")
    p.add_argument("--author-position-mode", choices=["label", "index", "skip"], default="label",
                   help="What to write to author_position: label (string, needs TEXT col; default), "
                        "index (0-based int, for INTEGER col), or skip (booleans only). Booleans "
                        "always written regardless.")
    p.add_argument("--write-mode", choices=["auto", "set", "row"], default="auto",
                   help="auto (default): set-based SQL when the work-set is large and "
                        f"the mode allows it (>= {SET_BASED_MIN_ROWS:,} rows, "
                        "--author-position-mode skip|index, DATABASE_URL present); "
                        "otherwise the original per-row PostgREST path. 'set'/'row' "
                        "force one. The per-row path measured 13 rows/s -- 13.3h on the "
                        "2026-08-25 CRC build.")
    p.add_argument("--target-version", choices=["v1", "v2"], default="v2", help="Schema version (default v2).")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    execute = bool(args.execute)  # default (neither / --dry-run) => dry-run
    load_dotenv()
    client = sb()
    tv = args.target_version
    pa_table = get_table_name("publication_authors", tv)
    hcp_oa_table = get_table_name("hcp_openalex_authors", tv)
    t0 = time.time()

    pub_ids = read_ids_file(args.pub_ids_file) if args.pub_ids_file else set()
    hcp_ids = read_ids_file(args.hcp_ids_file) if args.hcp_ids_file else set()
    scope = ("whole-corpus" if not pub_ids and not hcp_ids
             else f"pubs={len(pub_ids)} hcps={len(hcp_ids)} (AND)" if pub_ids and hcp_ids
             else f"pubs={len(pub_ids)}" if pub_ids else f"hcps={len(hcp_ids)}")
    print(f"Stage 9b authorship-position derivation - table={pa_table}, "
          f"mode={'EXECUTE' if execute else 'DRY-RUN'}, scope={scope}, "
          f"author_position_mode={args.author_position_mode}")
    if args.author_position_mode == "label":
        print("[NOTE] author_position_mode=label writes the 'first'/'middle'/'last' STRING; this "
              "requires publication_authors_v2.author_position to be TEXT. If the LIVE column is "
              "INTEGER (per the phase1_addendum_3 correction), use --author-position-mode index "
              "(or skip). The is_first_author/is_senior_author booleans are written either way.")

    # PATH CHOICE BEFORE THE EXPENSIVE READ. fetch_target_rows + fetch_pub_authorships is the
    # phase that produced NO writes for the first ~90 minutes of the CRC run (1,473 chunked
    # reads at IN_CHUNK_SIZE=100, then authorships JSON for 119,309 pubs). The set-based path
    # does none of it -- the join happens in Postgres -- so the decision must happen here,
    # before that cost is paid, not after.
    cheap_examined = (count_target_rows_cheap(pub_ids, hcp_ids)
                      if args.write_mode != "row" and os.getenv("DATABASE_URL") else None)
    path, why = choose_write_path(args.write_mode, cheap_examined, args.author_position_mode)
    print(f"\nWrite path: {path.upper()}  ({why})")

    if path == "set":
        counts_sb = run_set_based_update(pub_ids, hcp_ids, args.author_position_mode, execute)
        report_set_based(counts_sb, execute, args.author_position_mode, t0)
        # ALL-FAILED RULE -- same predicate as the per-row path, so the postcheck and the exit
        # rule behave identically whichever path ran.
        if counts_sb["examined"] and not counts_sb["resolved"]:
            print(f"\n[FAIL] 0 of {counts_sb['examined']:,} examined rows resolved to a "
                  f"position ({counts_sb['null_position']:,} null).", file=sys.stderr)
            raise SystemExit(1)
        return

    print("\nFetching target publication_authors_v2 rows...")
    target = fetch_target_rows(client, pa_table, pub_ids, hcp_ids)
    tgt_pub_ids = {p for p, _ in target}
    tgt_hcp_ids = {h for _, h in target}
    print(f"  Target rows: {len(target):,} over {len(tgt_pub_ids):,} pubs / {len(tgt_hcp_ids):,} HCPs")

    print("Fetching authorships JSON + HCP OpenAlex ids...")
    authorships_by_pub = fetch_pub_authorships(client, tgt_pub_ids)
    oa_by_hcp = fetch_hcp_oa_ids(client, hcp_oa_table, tgt_hcp_ids)

    # Derive
    counts: Counter = Counter()
    pubs_missing_authorships: Set[str] = set()
    anomalies: List[str] = []
    samples: Dict[str, List[Tuple[str, str, Optional[int]]]] = {"first": [], "last": [], "middle": []}
    planned: List[Tuple[str, str, bool, bool, Optional[str], Optional[int]]] = []

    for pub_id, hcp_id in target:
        counts["examined"] += 1
        authorships = authorships_by_pub.get(pub_id)
        if authorships is None:
            pubs_missing_authorships.add(pub_id)
            counts["null_position"] += 1
            continue
        label, is_first, is_senior, idx, anomaly = derive_position(
            authorships, oa_by_hcp.get(hcp_id, set())
        )
        if anomaly:
            anomalies.append(f"pub={pub_id} hcp={hcp_id}: {anomaly}")
        if label is None:
            counts["null_position"] += 1
            counts["null_no_match"] += 1
            continue
        counts["resolved"] += 1
        if is_first:
            counts["is_first_true"] += 1
            if len(samples["first"]) < 5:
                samples["first"].append((hcp_id, pub_id, idx))
        elif is_senior:
            counts["is_senior_true"] += 1
            if len(samples["last"]) < 5:
                samples["last"].append((hcp_id, pub_id, idx))
        else:
            counts["middle"] += 1
            if len(samples["middle"]) < 5:
                samples["middle"].append((hcp_id, pub_id, idx))
        planned.append((pub_id, hcp_id, is_first, is_senior, label, idx))

    # Write (execute only)
    written_bools = 0
    written_pos = 0
    errors: List[str] = []
    if execute:
        print(f"\nApplying updates to {len(planned):,} resolved rows...")
        for n, (pub_id, hcp_id, is_first, is_senior, label, idx) in enumerate(planned, 1):
            ok, err = update_booleans(client, pa_table, pub_id, hcp_id, is_first, is_senior)
            if ok:
                written_bools += 1
            elif err:
                errors.append(f"bools pub={pub_id} hcp={hcp_id}: {err}")
            if args.author_position_mode != "skip":
                value = label if args.author_position_mode == "label" else idx
                okp, errp = update_author_position(client, pa_table, pub_id, hcp_id, value)
                if okp:
                    written_pos += 1
                elif errp:
                    errors.append(f"author_position pub={pub_id} hcp={hcp_id}: {errp}")
            if n % 500 == 0:
                print(f"  {n:,}/{len(planned):,} updated...")

    # Report
    print("\n" + "=" * 66)
    print("STAGE 9b - SUMMARY")
    print("=" * 66)
    print(f"  rows examined:            {counts['examined']:,}")
    print(f"  rows resolved (position): {counts['resolved']:,}")
    print(f"    is_first_author=true:   {counts['is_first_true']:,}")
    print(f"    is_senior_author=true:  {counts['is_senior_true']:,}")
    print(f"    middle (both false):    {counts['middle']:,}")
    print(f"  null-position (unresolved): {counts['null_position']:,}  "
          f"(missing authorships JSON on {len(pubs_missing_authorships):,} pub(s); "
          f"no matching author entry on {counts['null_no_match']:,} row(s))")
    if pubs_missing_authorships:
        sample_missing = sorted(pubs_missing_authorships)[:10]
        print(f"    pubs with NULL/missing authorships (position left NULL): {sample_missing}"
              + (" ..." if len(pubs_missing_authorships) > 10 else ""))
    if anomalies:
        print(f"  anomalies (multi-position matches): {len(anomalies)}")
        for a in anomalies[:10]:
            print(f"    {a}")

    print("\n  Validation samples (hcp_id, pub_id, array_index):")
    for kind, lst in samples.items():
        print(f"    {kind:6s} author -> is_{'first' if kind=='first' else 'senior' if kind=='last' else '(neither)'}"
              f": {lst if lst else '(none in scope)'}")

    if execute:
        print(f"\n  UPDATES: {written_bools:,} boolean-writes, {written_pos:,} author_position-writes, "
              f"{len(errors)} error(s)")
        for e in errors[:10]:
            print(f"    {e}")
    else:
        would_pos = 0 if args.author_position_mode == "skip" else len(planned)
        print(f"\n  *** DRY-RUN: no writes. Would update {len(planned):,} rows' booleans and "
              f"{would_pos:,} author_position value(s). ***")
    print(f"\n  Wall time: {time.time() - t0:.1f}s")

    # ALL-FAILED RULE. `examined` and `resolved` were already counted and printed; nothing
    # consulted them. attempted = examined, succeeded = resolved. null_position alone is NOT a
    # failure -- a pub with no authorships JSON legitimately leaves the position NULL -- so only
    # "every row we examined resolved to nothing" is unambiguous. Not a partial threshold: what
    # share of nulls is acceptable varies with how much of the batch OpenAlex has enriched.
    if counts["examined"] and not counts["resolved"]:
        print(f"\n[FAIL] 0 of {counts['examined']:,} examined rows resolved to a position "
              f"({counts['null_position']:,} null).", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
