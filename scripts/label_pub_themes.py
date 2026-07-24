"""
Pulse pub->theme labeler.

Assigns publications to canonical themes using per-theme signature types:
concept signatures (theme_concept_signature_v1) and keyword signatures
(theme_keyword_signature_v1). Writes publication_theme_v1.

Resume is DB-state based: a chunk is skipped only if publication_theme_v1 already
holds rows for those publication_ids at this labeler_version. It never trusts a
processed-counter. This is deliberate -- counter-based checkpointing caused the
July ingest outage.

Usage:
  python scripts/label_pub_themes.py --ta-id <uuid> --ta-label NSCLC --dry-run
  python scripts/label_pub_themes.py --ta-id <uuid> --ta-label NSCLC --execute
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict

import psycopg
from dotenv import load_dotenv

LABELER_VERSION = "v1.0"

CONCEPT_MIN_LEVEL = 2
CONCEPT_MIN_SCORE = 0.4
CONCEPT_MAX_CORPUS_SHARE = 0.40

MIN_LABEL_SCORE = 0.8
KEYWORD_PRECEDENCE = 1.5

CHUNK_SIZE = 5000


def log(msg):
    print(msg, flush=True)
    sys.stdout.flush()


def load_blocklist(cur):
    cur.execute("SELECT concept_name FROM pulse_concept_blocklist_v1")
    return {r[0] for r in cur.fetchall()}


def load_signatures(cur, ta_label):
    cur.execute(
        """
        SELECT tc.id, tc.canonical_name, s.concept_name, s.weight, s.can_set_primary
        FROM theme_concept_signature_v1 s
        JOIN theme_canonical_v1 tc ON tc.id = s.canonical_id
        WHERE tc.therapeutic_area = %s
        """,
        (ta_label,),
    )
    concept_sig = defaultdict(list)
    names = {}
    for cid, cname, concept, weight, can_primary in cur.fetchall():
        concept_sig[concept].append((cid, float(weight), can_primary))
        names[cid] = cname

    cur.execute(
        """
        SELECT tc.id, tc.canonical_name, s.term, s.match_mode, s.field_scope,
               s.weight, s.can_set_primary
        FROM theme_keyword_signature_v1 s
        JOIN theme_canonical_v1 tc ON tc.id = s.canonical_id
        WHERE tc.therapeutic_area = %s
        """,
        (ta_label,),
    )
    keyword_sig = []
    for cid, cname, term, mode, scope, weight, can_primary in cur.fetchall():
        names[cid] = cname
        if mode == "word":
            pattern = re.compile(r"\b" + re.escape(term) + r"\b", re.IGNORECASE)
        else:
            pattern = re.compile(re.escape(term), re.IGNORECASE)
        keyword_sig.append(
            {
                "canonical_id": cid,
                "term": term,
                "pattern": pattern,
                "scope": scope,
                "weight": float(weight),
                "can_primary": can_primary,
            }
        )

    return concept_sig, keyword_sig, names


def compute_corpus_shares(cur, ta_id, blocklist):
    """Corpus frequency per concept, used for the share < 0.40 filter."""
    log("Computing corpus concept shares...")
    cur.execute(
        """
        SELECT count(DISTINCT p.id)
        FROM publications_v2 p
        JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = p.id
        WHERE pta.therapeutic_area_id = %s
        """,
        (ta_id,),
    )
    total = cur.fetchone()[0]
    if not total:
        raise SystemExit("No publications found for that therapeutic_area_id.")

    cur.execute(
        """
        SELECT c ->> 'display_name', count(DISTINCT p.id)
        FROM publications_v2 p
        JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = p.id
        CROSS JOIN LATERAL jsonb_array_elements(p.openalex_concepts) AS c
        WHERE pta.therapeutic_area_id = %s
          AND p.openalex_concepts IS NOT NULL
        GROUP BY 1
        """,
        (ta_id,),
    )
    shares = {}
    for name, n in cur.fetchall():
        if name and name not in blocklist:
            shares[name] = n / total
    log(f"  corpus = {total:,} pubs, {len(shares):,} concepts after blocklist")
    return shares, total


def eligible_concepts(concepts_json, shares, blocklist):
    """Apply the pre-flight rule: level >= 2, score >= 0.4, share < 0.40."""
    out = []
    if not concepts_json:
        return out
    for c in concepts_json:
        name = c.get("display_name")
        if not name or name in blocklist:
            continue
        try:
            if int(c.get("level", -1)) < CONCEPT_MIN_LEVEL:
                continue
            if float(c.get("score", 0.0)) < CONCEPT_MIN_SCORE:
                continue
        except (TypeError, ValueError):
            continue
        if shares.get(name, 1.0) >= CONCEPT_MAX_CORPUS_SHARE:
            continue
        out.append(name)
    return out


def score_publication(title, abstract, concepts_json, concept_sig, keyword_sig,
                      shares, blocklist):
    """Return {canonical_id: (score, method, can_primary, primary_weight)}."""
    scores = defaultdict(float)
    primary_weight = defaultdict(float)
    methods = defaultdict(set)

    for name in eligible_concepts(concepts_json, shares, blocklist):
        for cid, weight, can_primary in concept_sig.get(name, ()):
            scores[cid] += weight
            methods[cid].add("concept")
            if can_primary:
                primary_weight[cid] = max(primary_weight[cid], weight)

    title = title or ""
    abstract = abstract or ""
    for sig in keyword_sig:
        haystack = title if sig["scope"] == "title" else f"{title} {abstract}"
        if not haystack:
            continue
        if sig["pattern"].search(haystack):
            cid = sig["canonical_id"]
            scores[cid] += sig["weight"] * KEYWORD_PRECEDENCE
            methods[cid].add("keyword")
            if sig["can_primary"]:
                primary_weight[cid] = max(
                    primary_weight[cid], sig["weight"] * KEYWORD_PRECEDENCE
                )

    result = {}
    for cid, score in scores.items():
        if score < MIN_LABEL_SCORE:
            continue
        ms = methods[cid]
        method = "hybrid" if len(ms) > 1 else next(iter(ms))
        result[cid] = (score, method, primary_weight[cid] > 0, primary_weight[cid])
    return result


def already_labeled(cur, pub_ids, version):
    cur.execute(
        """
        SELECT DISTINCT publication_id
        FROM publication_theme_v1
        WHERE publication_id = ANY(%s) AND labeler_version = %s
        """,
        (pub_ids, version),
    )
    return {r[0] for r in cur.fetchall()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ta-id", required=True, help="therapeutic_area_id (uuid)")
    ap.add_argument("--ta-label", required=True, help="therapeutic_area text, e.g. NSCLC")
    ap.add_argument("--execute", action="store_true", help="write to DB")
    ap.add_argument("--dry-run", action="store_true", help="score only, report distribution")
    ap.add_argument("--limit", type=int, default=None, help="cap pubs processed")
    ap.add_argument("--version", default=LABELER_VERSION)
    args = ap.parse_args()

    if not args.execute and not args.dry_run:
        raise SystemExit("Pass --dry-run or --execute.")
    if args.execute and args.dry_run:
        raise SystemExit("Pass one of --dry-run or --execute, not both.")

    load_dotenv()
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL not set.")

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            blocklist = load_blocklist(cur)
            concept_sig, keyword_sig, names = load_signatures(cur, args.ta_label)
            log(f"Signatures: {len(concept_sig)} concept terms, "
                f"{len(keyword_sig)} keyword terms, {len(names)} themes")
            if not names:
                raise SystemExit(f"No signatures found for ta_label={args.ta_label!r}")

            shares, corpus_total = compute_corpus_shares(cur, args.ta_id, blocklist)

            cur.execute(
                """
                SELECT p.id
                FROM publications_v2 p
                JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = p.id
                WHERE pta.therapeutic_area_id = %s
                ORDER BY p.id
                """,
                (args.ta_id,),
            )
            all_ids = [r[0] for r in cur.fetchall()]
            if args.limit:
                all_ids = all_ids[: args.limit]
            log(f"Publications to consider: {len(all_ids):,}")

            theme_counts = defaultdict(int)
            primary_counts = defaultdict(int)
            labeled = 0
            unlabeled = 0
            skipped = 0
            rows_written = 0

            for start in range(0, len(all_ids), CHUNK_SIZE):
                chunk = all_ids[start : start + CHUNK_SIZE]

                done = already_labeled(cur, chunk, args.version) if args.execute else set()
                todo = [pid for pid in chunk if pid not in done]
                skipped += len(chunk) - len(todo)
                if not todo:
                    continue

                cur.execute(
                    """
                    SELECT id, title, abstract, openalex_concepts
                    FROM publications_v2
                    WHERE id = ANY(%s)
                    """,
                    (todo,),
                )
                batch = cur.fetchall()

                payload = []
                for pub_id, title, abstract, concepts_json in batch:
                    if isinstance(concepts_json, str):
                        try:
                            concepts_json = json.loads(concepts_json)
                        except ValueError:
                            concepts_json = None

                    scored = score_publication(
                        title, abstract, concepts_json,
                        concept_sig, keyword_sig, shares, blocklist,
                    )
                    if not scored:
                        unlabeled += 1
                        continue
                    labeled += 1

                    primary_cid = None
                    best = -1.0
                    for cid, (score, _m, can_primary, pweight) in scored.items():
                        if can_primary and (pweight, score) > (best, best):
                            best = pweight
                            primary_cid = cid
                    if primary_cid is None:
                        primary_cid = max(scored.items(), key=lambda kv: kv[1][0])[0]

                    for cid, (score, method, _cp, _pw) in scored.items():
                        theme_counts[cid] += 1
                        if cid == primary_cid:
                            primary_counts[cid] += 1
                        payload.append(
                            (pub_id, cid, args.ta_id, round(score, 4), method,
                             cid == primary_cid, args.version)
                        )

                if args.execute and payload:
                    cur.executemany(
                        """
                        INSERT INTO publication_theme_v1
                          (publication_id, canonical_id, therapeutic_area_id,
                           score, method, is_primary, labeler_version)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (publication_id, canonical_id) DO UPDATE SET
                          score = EXCLUDED.score,
                          method = EXCLUDED.method,
                          is_primary = EXCLUDED.is_primary,
                          labeler_version = EXCLUDED.labeler_version,
                          labeled_at = now()
                        """,
                        payload,
                    )
                    conn.commit()
                    rows_written += len(payload)

                log(f"  {min(start + CHUNK_SIZE, len(all_ids)):,}/{len(all_ids):,} "
                    f"labeled={labeled:,} unlabeled={unlabeled:,} rows={rows_written:,}")

            log("")
            log("=" * 72)
            log(f"corpus                {corpus_total:,}")
            log(f"considered            {len(all_ids):,}")
            log(f"skipped (already)     {skipped:,}")
            log(f"labeled               {labeled:,}")
            log(f"unlabeled             {unlabeled:,}  "
                f"({unlabeled / max(len(all_ids) - skipped, 1):.1%} of processed)")
            log(f"rows written          {rows_written:,}")
            log("=" * 72)
            log(f"{'theme':<56}{'any':>8}{'primary':>9}")
            for cid, name in sorted(names.items(), key=lambda kv: -theme_counts[kv[0]]):
                log(f"{name[:54]:<56}{theme_counts[cid]:>8,}{primary_counts[cid]:>9,}")

            if args.dry_run:
                log("")
                log("DRY RUN - nothing written.")


if __name__ == "__main__":
    main()
