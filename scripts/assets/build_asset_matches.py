"""
build_asset_matches.py — populate asset_publication_v1 from config/assets.json.

The vocabulary is the file; this derives the asset↔publication edges by matching
each asset's terms against the lung-cancer corpus (publications_v2 where source TA
is 'nsclc', which includes SCLC). Matching mirrors the validation:
  - names / brands: case-insensitive substring
  - development codes: word-boundary regex

One edge per (publication, asset). Terms are applied in priority order
name -> code -> brand, with ON CONFLICT DO NOTHING, so the strongest signal wins
matched_via. Idempotent: truncates and rebuilds. Run on reingest.

Usage:  python scripts/assets/build_asset_matches.py [--dry-run]
"""

from __future__ import annotations
import argparse
import json
import os
import re
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "config" / "assets.json"


def code_regex(code: str) -> str:
    # word-boundary via non-alphanumeric edges; internal hyphens/spaces literal
    return r"(^|[^a-z0-9])" + re.escape(code.lower()) + r"([^a-z0-9]|$)"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Report counts, write nothing.")
    args = ap.parse_args()

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    assets = config["assets"]

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL not set", file=sys.stderr)
        return 1

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SET statement_timeout='600s'")
        # Corpus scoped to the lung-cancer TA (includes SCLC), matching validation.
        cur.execute("""
            CREATE TEMP TABLE corpus AS
            SELECT id, lower(coalesce(title,'')||' '||coalesce(abstract,'')) AS txt
            FROM publications_v2
            WHERE source_therapeutic_area_id = (SELECT id FROM therapeutic_areas WHERE slug='nsclc')
        """)
        cur.execute("SELECT count(*) FROM corpus")
        corpus_n = cur.fetchone()[0]

        if not args.dry_run:
            cur.execute("TRUNCATE public.asset_publication_v1")

        total_edges = 0
        for a in assets:
            gen = a["generic"]
            m = a["match"]
            # priority order: names, then codes, then brands
            plan = (
                [("name", n, False) for n in m.get("names", [])]
                + [("code", c, True) for c in m.get("codes", [])]
                + [("brand", b, False) for b in m.get("brands", [])]
            )
            asset_edges = 0
            for via, term, is_code in plan:
                if is_code:
                    where = "txt ~ %s"; param = code_regex(term)
                else:
                    where = "txt LIKE %s"; param = f"%{term.lower()}%"
                if args.dry_run:
                    cur.execute(f"SELECT count(*) FROM corpus WHERE {where}", (param,))
                    continue
                cur.execute(
                    f"""INSERT INTO public.asset_publication_v1 (publication_id, asset_generic, matched_via, match_term)
                        SELECT id, %s, %s, %s FROM corpus WHERE {where}
                        ON CONFLICT (publication_id, asset_generic) DO NOTHING""",
                    (gen, via, term, param),
                )
                asset_edges += cur.rowcount
            total_edges += asset_edges
            print(f"  {gen:<28} +{asset_edges} edges")

        if args.dry_run:
            print(f"[dry-run] corpus={corpus_n}; wrote nothing")
            return 0

        cur.execute("SELECT count(DISTINCT publication_id) FROM public.asset_publication_v1")
        distinct_pubs = cur.fetchone()[0]
        conn.commit()
        print(f"\ncorpus={corpus_n}  edges={total_edges}  distinct publications={distinct_pubs} "
              f"({100*distinct_pubs/corpus_n:.1f}% of corpus)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
