"""
FieldMark — Validation harness for affiliation re-derivation (READ-ONLY).

Runs the proposed re-derivation methodology against a named set of HCPs and prints,
per person, the full recency-weighted institution breakdown so the decay constant can
be judged on evidence rather than on the winner alone.

Methodology under test (docs/AFFILIATION_REDERIVATION_SCOPE.md §2):
  window    : pub_year >= current_year - N          (default N=3 -> 2023+)
  weight    : decay ^ (current_year - LEAST(pub_year, current_year))
  winner    : argmax over institution_ror of SUM(weight)
  dominance : weight(winner) / SUM(all weights)
  tie-break : weight desc, then max(pub_year) desc, then ror

WRITES NOTHING. Pure SELECT. Safe to run against the live DB.

Usage:
  python scripts/enrich/validate_affiliation_rederivation.py --last-names garassino,nagasaka
  python scripts/enrich/validate_affiliation_rederivation.py --hcp-ids <uuid>,<uuid> --decay 0.5
  python scripts/enrich/validate_affiliation_rederivation.py --last-names ... --sweep
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import psycopg
from dotenv import load_dotenv

load_dotenv()

BREAKDOWN_SQL = """
WITH target AS (
  SELECT h.id, h.first_name, h.last_name, h.country AS stored_country,
         h.institution_normalized AS stored_inst
  FROM hcps_v2 h
  WHERE h.id = ANY(%(ids)s)
),
recent AS (
  SELECT t.id AS hcp_id,
         regexp_replace(f.institution_ror, '^https?://ror\\.org/', '') AS rid,
         f.institution AS inst_name,
         LEAST(f.pub_year, %(cy)s) AS py
  FROM target t
  JOIN hcp_openalex_authors_v2 l ON l.hcp_id = t.id
  JOIN author_pub_flat f ON f.author_id = l.openalex_author_id
  WHERE f.pub_year >= %(min_year)s
    AND f.institution_ror IS NOT NULL
),
scored AS (
  SELECT hcp_id, rid,
         MODE() WITHIN GROUP (ORDER BY inst_name) AS inst_name,
         SUM(POWER(%(decay)s, %(cy)s - py)) AS w,
         COUNT(*) AS n,
         MAX(py) AS last_year
  FROM recent
  GROUP BY hcp_id, rid
)
SELECT s.hcp_id, s.rid, s.inst_name, rc.country_code, s.w, s.n, s.last_year,
       SUM(s.w) OVER (PARTITION BY s.hcp_id) AS total_w,
       ROW_NUMBER() OVER (PARTITION BY s.hcp_id ORDER BY s.w DESC, s.last_year DESC, s.rid) AS rn
FROM scored s
LEFT JOIN ror_to_country rc ON rc.ror_id = s.rid
ORDER BY s.hcp_id, rn
"""


def resolve_ids(conn, last_names: List[str], min_pubs: int) -> List[str]:
    sql = """
    SELECT id, first_name, last_name, total_career_pubs
    FROM hcps_v2
    WHERE lower(last_name) = ANY(%(names)s) AND COALESCE(total_career_pubs,0) >= %(mp)s
    ORDER BY total_career_pubs DESC NULLS LAST
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"names": [n.strip().lower() for n in last_names], "mp": min_pubs})
        return [r[0] for r in cur.fetchall()]


def run(conn, ids: List[str], decay: float, window: int, cy: int) -> Dict[str, List[tuple]]:
    with conn.cursor() as cur:
        cur.execute(
            BREAKDOWN_SQL,
            {"ids": ids, "decay": decay, "cy": cy, "min_year": cy - window},
        )
        rows = cur.fetchall()
    out: Dict[str, List[tuple]] = {}
    for r in rows:
        out.setdefault(str(r[0]), []).append(r)
    return out


def meta(conn, ids: List[str]) -> Dict[str, tuple]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, first_name, last_name, country, institution_normalized, "
            "total_career_pubs FROM hcps_v2 WHERE id = ANY(%(ids)s)",
            {"ids": ids},
        )
        return {str(r[0]): r for r in cur.fetchall()}


def confidence(n: int, dominance: float, n_insts: int) -> str:
    if n >= 3 and dominance >= 0.6:
        return "high"
    return "medium"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--last-names", help="Comma-separated last names")
    ap.add_argument("--hcp-ids", help="Comma-separated hcp uuids")
    ap.add_argument("--decay", type=float, default=0.65)
    ap.add_argument("--window", type=int, default=3)
    ap.add_argument("--min-pubs", type=int, default=25)
    ap.add_argument("--sweep", action="store_true", help="Compare decay 0.5/0.65/0.8/1.0")
    ap.add_argument("--top", type=int, default=4, help="Institutions shown per person")
    args = ap.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        return 1
    cy = datetime.now(timezone.utc).year

    with psycopg.connect(db_url) as conn:
        if args.hcp_ids:
            ids = [i.strip() for i in args.hcp_ids.split(",") if i.strip()]
        elif args.last_names:
            ids = resolve_ids(conn, args.last_names.split(","), args.min_pubs)
        else:
            print("ERROR: need --last-names or --hcp-ids", file=sys.stderr)
            return 1
        if not ids:
            print("No HCPs matched.")
            return 0

        m = meta(conn, ids)
        decays = [0.5, 0.65, 0.8, 1.0] if args.sweep else [args.decay]

        for d in decays:
            print(f"\n{'=' * 78}")
            print(f"DECAY {d}  |  window {args.window}y (pub_year >= {cy - args.window})  |  clamp <= {cy}")
            print("=" * 78)
            res = run(conn, ids, d, args.window, cy)
            for hid in ids:
                mm = m.get(hid)
                if not mm:
                    continue
                name = f"{mm[1] or ''} {mm[2] or ''}".strip()
                rows = res.get(hid, [])
                print(f"\n{name}   [{mm[5]} career pubs]")
                print(f"  stored : {mm[3] or '(null)'}  |  {mm[4] or '(null)'}")
                if not rows:
                    print("  derived: (no ROR'd papers in window) -> STALE")
                    continue
                total_w = float(rows[0][7])
                win = rows[0]
                dom = float(win[4]) / total_w if total_w else 0.0
                conf = confidence(int(win[5]), dom, len(rows))
                changed = (mm[3] or "").upper() != (win[3] or "").upper()
                print(
                    f"  derived: {win[3] or '(unmapped)'}  |  {win[2]}  "
                    f"[n={win[5]}, as_of={win[6]}, dom={dom:.2f}, conf={conf}]"
                    f"  {'<-- CHANGED' if changed else '(same)'}"
                )
                for r in rows[: args.top]:
                    mark = ">" if r[8] == 1 else " "
                    print(
                        f"    {mark} {float(r[4]):6.2f}w  n={r[5]:<3} last={r[6]}  "
                        f"{r[3] or '??'}  {r[2]}"
                    )
                if len(rows) > args.top:
                    print(f"      ... {len(rows) - args.top} more institution(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
