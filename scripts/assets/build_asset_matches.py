"""
build_asset_matches.py — populate asset_publication_v1 from config/assets.json.

The vocabulary is the file; this derives the asset↔publication edges by matching
each asset's terms against the lung-cancer corpus (publications_v2 where source TA
is 'nsclc', which includes SCLC). Matching mirrors the validation:
  - names / brands: case-insensitive substring
  - development codes: word-boundary regex

One edge per (publication, asset). Terms are applied in priority order
name -> code -> brand, with ON CONFLICT DO NOTHING, so the strongest signal wins
matched_via. Idempotent: full rebuild each run.

SWAP-IN: the ~95s of matching runs against a TEMP staging table, so the live
asset_publication_v1 is never locked for the compute. Only the final swap
(TRUNCATE + copy of the precomputed rows) briefly locks the live table (~2s) --
keeping its OID so the asset_mention_v1 view / RLS / grants survive. This is the
same fix build_author_flat needed; asset_publication_v1 has a reader (the asset
page), so it must not be locked for the whole build. Run on reingest (weekly).

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

    import time
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

        # Swap-in build: the ~95s matching runs against a STAGING table so the live
        # asset_publication_v1 is never locked for the compute. Only the final swap
        # (truncate + copy of precomputed rows) briefly locks the live table — the
        # same fix build_author_flat needed.
        cur.execute("""
            CREATE TEMP TABLE staging (
              publication_id uuid NOT NULL,
              asset_generic  text NOT NULL,
              matched_via    text NOT NULL,
              match_term     text NOT NULL,
              PRIMARY KEY (publication_id, asset_generic)
            )
        """)

        total_edges = 0
        for a in assets:
            gen = a["generic"]
            m = a["match"]
            # priority order: names, then codes, then brands (first match wins matched_via)
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
                    f"""INSERT INTO staging (publication_id, asset_generic, matched_via, match_term)
                        SELECT id, %s, %s, %s FROM corpus WHERE {where}
                        ON CONFLICT (publication_id, asset_generic) DO NOTHING""",
                    (gen, via, term, param),
                )
                asset_edges += cur.rowcount
            total_edges += asset_edges
            print(f"  {gen:<28} +{asset_edges} edges")

        if args.dry_run:
            print(f"[dry-run] corpus={corpus_n}; matched {total_edges} edges into staging; wrote nothing")
            return 0

        conn.commit()  # end the long compute txn; staging (temp) persists in-session

        # ── swap: short transaction, the only time the live table is locked ──
        t0 = time.time()
        cur.execute("BEGIN")
        cur.execute("TRUNCATE public.asset_publication_v1")
        cur.execute("""INSERT INTO public.asset_publication_v1
                         (publication_id, asset_generic, matched_via, match_term)
                       SELECT publication_id, asset_generic, matched_via, match_term FROM staging""")
        conn.commit()
        swap_s = time.time() - t0

        cur.execute("SELECT count(DISTINCT publication_id) FROM public.asset_publication_v1")
        distinct_pubs = cur.fetchone()[0]
        print(f"\ncorpus={corpus_n}  edges={total_edges}  distinct publications={distinct_pubs} "
              f"({100*distinct_pubs/corpus_n:.1f}% of corpus)")
        print(f"live-table lock window (swap only): {swap_s:.2f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
