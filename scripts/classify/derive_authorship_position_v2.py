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


if __name__ == "__main__":
    main()
