"""capture_percentiles.py -- before/after capture for the percentile convention change.

Snapshots every percentile column written by the nine scorers listed in
docs/PERCENTILE_CONVENTION.md, so the rescore can be verified rather than trusted.

WHY A CAPTURE AND NOT A ROW-IMAGE RESTORE. These tables are DERIVED: the scorers are
deterministic functions of the publication/payment/graph data beneath them, so the revert
is `git checkout` of the nine files plus a re-run of the same chain, not an INSERT script.
What a restore artifact cannot give you and this can is PROOF the revert landed -- and,
before that, a measurement of exactly what the change moved.

Usage:
    python scripts/score/capture_percentiles.py --label before
    python scripts/score/capture_percentiles.py --label after
    python scripts/score/capture_percentiles.py --compare before after

Env: DATABASE_URL
"""

from __future__ import annotations

import argparse
import csv
import gzip
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()

OUT = Path(__file__).resolve().parents[2] / "sql" / "revert" / "captures"

# (table, key columns, percentile columns). Key columns must be enough to line a row up
# across two captures; percentile columns are everything the convention touches.
TABLES = [
    ("hcp_publication_leadership_v2", ["hcp_id", "therapeutic_area_id"], ["percentile_rank"]),
    ("hcp_network_centrality_v2", ["hcp_id", "therapeutic_area_id", "window_type"],
     ["degree_percentile", "eigenvector_percentile", "betweenness_percentile", "network_influence_score"]),
    ("hcp_pharma_engagement_v2", ["hcp_id", "therapeutic_area_id"], ["percentile_rank"]),
    ("hcp_scientific_momentum_v1", ["hcp_id", "therapeutic_area_id"], ["scientific_momentum_percentile"]),
    ("hcp_network_momentum_v1", ["hcp_id", "therapeutic_area_id"], ["network_momentum_percentile"]),
    ("hcp_scientific_emergence_v1", ["hcp_id", "therapeutic_area_id"], ["emergence_percentile"]),
    ("hcp_established_ranks_v3", ["hcp_id", "therapeutic_area_id", "scope_type", "scope_value"],
     ["rank", "cohort_score", "scientific_influence_pctile", "network_influence_pctile", "pharma_engagement_pctile"]),
    ("hcp_rising_star_ranks_v3", ["hcp_id", "therapeutic_area_id"],
     ["rank", "us_rank", "rising_star_percentile", "scientific_momentum_percentile",
      "network_momentum_percentile", "scientific_visibility_percentile", "network_visibility_percentile"]),
    ("hcp_rising_composite_v1", ["hcp_id", "therapeutic_area_id", "scope_type", "scope_value"],
     ["rank", "rising_composite_score"]),
]


def existing_columns(cur, table, wanted):
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = %s", (table,)
    )
    have = {r[0] for r in cur.fetchall()}
    return [c for c in wanted if c in have], sorted(set(wanted) - have)


def capture(conn, label):
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    with conn.cursor() as cur:
        for table, keys, pcts in TABLES:
            cols_k, missing_k = existing_columns(cur, table, keys)
            cols_p, missing_p = existing_columns(cur, table, pcts)
            if not cols_k or not cols_p:
                print(f"  SKIP {table}: table or columns absent")
                continue
            cols = cols_k + cols_p
            cur.execute(f"SELECT {', '.join(cols)} FROM {table} ORDER BY {', '.join(cols_k)}")
            rows = cur.fetchall()
            path = OUT / f"{label}__{table}.csv.gz"
            with gzip.open(path, "wt", newline="", encoding="utf-8") as fh:
                w = csv.writer(fh)
                w.writerow(cols)
                w.writerows(rows)
            # endpoint census: the whole point of the change
            ends = {}
            for i, c in enumerate(cols_p, start=len(cols_k)):
                vals = [r[i] for r in rows if r[i] is not None]
                ends[c] = {
                    "n": len(vals),
                    "exactly_100": sum(1 for v in vals if float(v) == 100.0),
                    "exactly_0": sum(1 for v in vals if float(v) == 0.0),
                }
            manifest.append((table, len(rows), path.name, ends, missing_k + missing_p))
            print(f"  {table:<32} {len(rows):>8,} rows -> {path.name}")
            for c, e in ends.items():
                print(f"      {c:<34} =100: {e['exactly_100']:>6,}  =0: {e['exactly_0']:>7,}  of {e['n']:,}")
            if missing_k or missing_p:
                print(f"      NOTE columns absent from this table: {missing_k + missing_p}")
    return manifest


# Tables the 2026-08-18 rescore chain is expected to move. network_centrality is
# deliberately NOT in the chain -- its three percentile columns are written through
# int(round(...)) so a re-run writes back identical integers at half an hour's cost
# (docs/CENTRALITY_PERCENTILES_STORED_AS_INT.md). Anything else reporting UNCHANGED
# means a step was skipped or died before its write -- which is exactly how
# emergence_scoring fails (docs/EMERGENCE_CRASHES_BEFORE_ITS_WRITE.md).
EXPECTED_TO_MOVE = {t for t, _, _ in TABLES if t != "hcp_network_centrality_v2"}

# Columns where an exact 0.0 is legitimate AFTER the change: the scorers store 0 for a
# MISSING component, and the new formula can no longer emit 0, so a residual zero here
# is an absent source rather than a surviving artifact.
ZERO_MEANS_ABSENT = {
    ("hcp_established_ranks_v3", "pharma_engagement_pctile"),
    ("hcp_established_ranks_v3", "scientific_influence_pctile"),
    ("hcp_established_ranks_v3", "network_influence_pctile"),
}


def compare(a, b):
    verdicts = []
    for table, keys, pcts in TABLES:
        pa, pb = OUT / f"{a}__{table}.csv.gz", OUT / f"{b}__{table}.csv.gz"
        if not pa.exists() or not pb.exists():
            print(f"  SKIP {table}: missing capture")
            continue
        with gzip.open(pa, "rt", encoding="utf-8") as fa, gzip.open(pb, "rt", encoding="utf-8") as fb:
            ra, rb = list(csv.DictReader(fa)), list(csv.DictReader(fb))
        ka = {tuple(r[k] for k in keys if k in r): r for r in ra}
        kb = {tuple(r[k] for k in keys if k in r): r for r in rb}
        common = ka.keys() & kb.keys()
        print(f"\n  {table}: {len(ra):,} -> {len(rb):,} rows "
              f"({len(ka.keys() - kb.keys()):,} gone, {len(kb.keys() - ka.keys()):,} new)")
        moved = False
        for col in pcts:
            if not ra or col not in ra[0]:
                continue
            diffs, mx = 0, 0.0
            for k in common:
                va, vb = ka[k].get(col), kb[k].get(col)
                if va in (None, "") or vb in (None, ""):
                    continue
                d = abs(float(vb) - float(va))
                if d > 1e-9:
                    diffs += 1
                    mx = max(mx, d)
            e100 = sum(1 for r in rb if r.get(col) not in (None, "") and float(r[col]) == 100.0)
            e0 = sum(1 for r in rb if r.get(col) not in (None, "") and float(r[col]) == 0.0)
            flag = ""
            if e100 and table in EXPECTED_TO_MOVE and col not in ("rank", "us_rank"):
                flag += "  <- STILL HAS EXACT 100"
            if e0 and (table, col) not in ZERO_MEANS_ABSENT and table in EXPECTED_TO_MOVE and col not in ("rank", "us_rank"):
                flag += "  <- STILL HAS EXACT 0"
            print(f"      {col:<34} changed {diffs:>7,}  max delta {mx:>8.3f}  now =100: {e100:,}  =0: {e0:,}{flag}")
            moved = moved or diffs > 0
        verdicts.append((table, moved))

    print()
    print("VERDICT -- a table that did not move means a step was skipped or died before its write")
    bad = 0
    for table, moved in verdicts:
        if table in EXPECTED_TO_MOVE:
            ok = moved
            label = "MOVED" if moved else "UNCHANGED  <- INVESTIGATE"
        else:
            ok = True
            label = ("moved" if moved else "unchanged") + "  (excluded from the chain, either is fine)"
        if not ok:
            bad += 1
        print(f"      {table:<34} {label}")
    print()
    print(f"  {len(EXPECTED_TO_MOVE) - bad}/{len(EXPECTED_TO_MOVE)} expected tables moved."
          + ("" if not bad else f"  {bad} DID NOT -- the chain did not fully land."))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--label")
    ap.add_argument("--compare", nargs=2, metavar=("A", "B"))
    args = ap.parse_args()
    if args.compare:
        compare(*args.compare)
        return
    if not args.label:
        raise SystemExit("--label or --compare required")
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set")
    conn = psycopg2.connect(url)
    try:
        print(f"capture: {args.label}")
        capture(conn, args.label)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
