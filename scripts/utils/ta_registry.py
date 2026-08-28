"""
ta_registry.py — one therapeutic-area resolver for every script that takes --ta.

WHY THIS EXISTS. Thirty-eight scripts accept --ta and, before this module, twenty-nine of
them resolved the slug themselves. A 2026-08-27 audit found NINE distinct implementations of
`resolve_ta_id` across sixteen scripts, plus a dozen more ad-hoc Supabase lookups. They agree
on the query and disagree on everything else: some return `str(row[0])`, some the raw `row[0]`,
some `row["id"]`; some raise `ValueError`, some `RuntimeError`, some `SystemExit`. Fifteen of
the sixteen say only "TA slug not found: <slug>" and leave the operator to guess what IS valid.

WHAT THIS FIXES: one query, one cache, one error message that names every valid slug, so a
typo is answered with the eight real options instead of a bare repetition of the typo.

WHAT IT DOES NOT FIX: a wrong-but-real slug. `therapeutic_areas` holds `oncology` and
`immunology` alongside the four built TAs, and `--ta oncology` resolves happily to a TA whose
downstream counts are all zero. Nothing here can tell a typo from a deliberate choice; listing
the alternatives at the point of failure is the mitigation, not a guarantee.

(Verified 2026-08-27: `therapeutic_areas` has no `is_active` column and holds exactly eight
rows, so the `colorectal`-beside-`colorectal-cancer` hazard recorded in TA_BUILD_GUIDE is not
in this table. known_slugs() still probes for is_active and degrades if absent, because the
column is referenced in the build docs and may exist elsewhere or later.)

TRANSPORT. Scripts here speak three dialects: psycopg2 (tuple rows), psycopg3 (dict rows via
dict_row), and the Supabase PostgREST client. `resolve_ta_id(conn, slug)` handles the first
two by inspecting the row type; `resolve_ta_supabase(client, slug)` handles the third. Passing
no connection opens one from DATABASE_URL.

USAGE, from any script directory:

    import os, sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "utils"))
    from ta_registry import resolve_ta_id            # drop-in for the local def

    ta_id = resolve_ta_id(conn, args.ta)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


@dataclass(frozen=True)
class TA:
    """The three forms a therapeutic area is keyed by. Carry all three; pass none as a bare
    string. See docs/GENERATE_CYCLE_DESIGN.md on the slug/name/id resolution trap."""
    id: str
    slug: str
    name: str

    def __str__(self) -> str:
        return f"{self.name} ({self.slug})"


class TANotFound(SystemExit):
    """SystemExit, deliberately.

    A bad --ta is an operator error at startup, not a recoverable condition: every caller
    would otherwise print a traceback for what is really a typo. SystemExit exits non-zero
    with the message and no stack noise, and -- because it inherits BaseException, not
    Exception -- it is not swallowed by the broad `except Exception` handlers several of
    these scripts wrap their main loops in.
    """


# Cache is per-process and keyed by slug. Scripts resolve the same TA repeatedly (per stage,
# per batch, per retry); the lookup is tiny but the connection round-trip is not free, and a
# few of these scripts run tens of thousands of iterations.
_CACHE: Dict[str, TA] = {}
_SLUGS_CACHE: Optional[List[Tuple[str, str, Optional[bool]]]] = None


def _open_conn():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise TANotFound(
            "DATABASE_URL is not set, so the therapeutic area cannot be resolved. "
            "Use the direct 5432 connection, not the 6543 pooler."
        )
    import psycopg2  # imported lazily so Supabase-only callers need not have it
    return psycopg2.connect(url)


def _row_get(row: Any, key: str, idx: int) -> Any:
    """One accessor for psycopg2 tuples, psycopg3 dict_row mappings and Supabase dicts."""
    if row is None:
        return None
    if isinstance(row, dict):
        return row.get(key)
    try:
        return row[idx]
    except (TypeError, KeyError, IndexError):
        return getattr(row, key, None)


def known_slugs(conn=None) -> List[Tuple[str, str, Optional[bool]]]:
    """[(slug, name, is_active)] for every therapeutic area, for error messages."""
    global _SLUGS_CACHE
    if _SLUGS_CACHE is not None:
        return _SLUGS_CACHE
    owns = conn is None
    c = conn or _open_conn()
    try:
        with c.cursor() as cur:
            try:
                cur.execute(
                    "SELECT slug, name, is_active FROM therapeutic_areas ORDER BY slug"
                )
                rows = cur.fetchall()
            except Exception:
                # is_active is not guaranteed to exist in every environment; the slug list is
                # the load-bearing part of the message, so degrade rather than fail.
                c.rollback()
                with c.cursor() as cur2:
                    cur2.execute("SELECT slug, name FROM therapeutic_areas ORDER BY slug")
                    rows = [(r[0], r[1], None) if not isinstance(r, dict)
                            else (r.get("slug"), r.get("name"), None)
                            for r in cur2.fetchall()]
    finally:
        if owns:
            c.close()
    out = []
    for r in rows:
        out.append((
            _row_get(r, "slug", 0), _row_get(r, "name", 1), _row_get(r, "is_active", 2)
        ))
    _SLUGS_CACHE = out
    return out


def _not_found(slug: str, conn=None) -> TANotFound:
    try:
        listing = known_slugs(conn)
    except Exception:  # noqa: BLE001 -- never let the error path itself fail
        listing = []
    lines = []
    for s, n, active in listing:
        mark = "" if active in (True, None) else "   [INACTIVE]"
        lines.append(f"    {s:<24} {n or ''}{mark}")
    body = "\n".join(lines) or "    (could not list therapeutic_areas)"
    return TANotFound(
        f"\nTherapeutic area slug not found: {slug!r}\n\n"
        f"Valid slugs:\n{body}\n\n"
        f"Note: an INACTIVE slug still resolves. If a run produced zero rows everywhere, "
        f"check you did not use one.\n"
    )


def resolve_ta(slug: str, conn=None) -> TA:
    """slug -> TA(id, slug, name). Cached per process. Raises TANotFound listing valid slugs."""
    if not slug:
        raise _not_found(slug, conn)
    hit = _CACHE.get(slug)
    if hit is not None:
        return hit
    owns = conn is None
    c = conn or _open_conn()
    try:
        with c.cursor() as cur:
            cur.execute(
                "SELECT id::text AS id, slug, name FROM therapeutic_areas WHERE slug = %s",
                (slug,),
            )
            row = cur.fetchone()
    finally:
        if owns:
            c.close()
    if not row:
        raise _not_found(slug, conn)
    ta = TA(
        id=str(_row_get(row, "id", 0)),
        slug=str(_row_get(row, "slug", 1)),
        name=str(_row_get(row, "name", 2) or ""),
    )
    _CACHE[slug] = ta
    return ta


def resolve_ta_id(conn, slug: str) -> str:
    """Drop-in for the nine local `resolve_ta_id` variants. Always returns a str uuid.

    The variants disagreed on return type -- `str(row[0])`, bare `row[0]`, `row["id"]`. A str
    is correct for every observed call site: all of them pass it straight back as a query
    parameter against a uuid column, which accepts a string.
    """
    return resolve_ta(slug, conn).id


def resolve_ta_supabase(client, slug: str) -> TA:
    """PostgREST equivalent, for the scripts holding a Supabase client and no DB connection."""
    if not slug:
        raise TANotFound(f"Therapeutic area slug not found: {slug!r}")
    hit = _CACHE.get(slug)
    if hit is not None:
        return hit
    rows = (
        client.table("therapeutic_areas")
        .select("id,slug,name")
        .eq("slug", slug)
        .limit(1)
        .execute()
        .data
    ) or []
    if not rows:
        listing = (
            client.table("therapeutic_areas").select("slug,name").order("slug").execute().data
        ) or []
        body = "\n".join(f"    {r.get('slug'):<24} {r.get('name') or ''}" for r in listing)
        raise TANotFound(
            f"\nTherapeutic area slug not found: {slug!r}\n\nValid slugs:\n"
            f"{body or '    (could not list therapeutic_areas)'}\n"
        )
    ta = TA(id=str(rows[0]["id"]), slug=str(rows[0]["slug"]), name=str(rows[0].get("name") or ""))
    _CACHE[slug] = ta
    return ta


def resolve_ta_id_supabase(client, slug: str) -> str:
    return resolve_ta_supabase(client, slug).id


def clear_cache() -> None:
    """For tests, and for the rare long-lived process that edits therapeutic_areas."""
    _CACHE.clear()
    global _SLUGS_CACHE
    _SLUGS_CACHE = None
