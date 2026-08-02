"""
hcp_industry_classifier.py — Classify HCPs by institution affiliation type.

Assigns every HCP in hcps_v2 a classification (ACADEMIC / INDUSTRY /
GOVERNMENT / UNKNOWN) for Rising Star eligibility filtering.

Usage:
    python hcp_industry_classifier.py
    python hcp_industry_classifier.py --dry-run
    python hcp_industry_classifier.py --verbose
    python hcp_industry_classifier.py --batch-size 5000
    python hcp_industry_classifier.py --hcp-ids-file affected.txt

--hcp-ids-file scopes the run to the ids listed (one uuid per line), matching the
stage-8 affected-set pattern used elsewhere in the reingest cycle. Omit it to
classify all of hcps_v2 (a full reclassify) -- which is how the cycle runs it.

Required environment variables (.env):
    DATABASE_URL (port 5432 direct connection, not pooler 6543)

Dependencies:
    pip install psycopg2-binary python-dotenv click
"""

from __future__ import annotations

import os
import re
from collections import Counter, defaultdict
from uuid import uuid4

import click
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

INDUSTRY_HIGH = [
    "AstraZeneca",
    "Pfizer (",
    "Genentech",
    "Novartis (",
    "Bristol-Myers Squibb",
    "Bristol Myers Squibb",
    "Merck & Co",
    "Merck KGaA",
    "Merck Serono",
    "Merck (Germany)",
    "Merck (Singapore)",
    "Merck Canada",
    "AbbVie (",
    "Amgen (",
    "GlaxoSmithKline",
    "GSK (",
    "Sanofi (",
    "Regeneron (",
    "Takeda (",
    "Boehringer Ingelheim",
    "Eli Lilly",
    "Loxo Oncology",
    "Johnson & Johnson",
    "Janssen",
    "Vertex Pharmaceuticals",
    "Blueprint Medicines",
    "Moderna Therapeutics",
    "BioNTech",
    "Bayer (",
    "Astellas (",
    "Daiichi (",
    "Seagen (",
    "Mirati (",
    "Incyte (",
    "Foundation Medicine",
    "Tempus (",
    "Guardant Health",
    "Caris Life Sciences",
    "Natera (",
    "Roche (Switzerland)",
    "Roche (China)",
    "Roche (United States)",
    "Roche (United Kingdom)",
    "Roche (France)",
    "Roche (Spain)",
    "Roche (Italy)",
    "Roche (Canada)",
    "Roche (Denmark)",
    "Roche Pharma",
]

INDUSTRY_LOW = [
    "Genomics Institute of the Novartis Research Foundation",
    "Pfizer-University of Granada",
    "PamGene",
    "Yves Rocher",
]

GOVERNMENT_REGEX_HIGH = [
    r"\bNational Cancer Institute\b",
    r"\bNational Institutes of Health\b",
    r"\bNIAID\b",
    r"\bNHLBI\b",
    r"\bNIDDK\b",
    r"\bNCATS\b",
    r"\bHRSA\b",
    r"\bAHRQ\b",
]

GOVERNMENT_HIGH = [
    "Centers for Disease Control and Prevention",
    "United States Food and Drug Administration",
    "United States Department of Veterans Affairs",
    "VA Medical Center",
    "VA Health Care System",
    "VA Healthcare System",
    "National Cancer Institute of Thailand",
    "Taiwan Centers for Disease Control",
    "China CDC",
    "Tianjin Centers for Disease Control",
    "Taiwan Food and Drug Administration",
    "Department of Defense",
]

GOVERNMENT_MEDIUM = [
    "Foundation for the National Institutes of Health",
    "CDC Foundation",
]

LILLY_REGEX = re.compile(r"Lilly \(", re.IGNORECASE)


def get_conn():
    if not DATABASE_URL:
        raise EnvironmentError("Missing DATABASE_URL")
    return psycopg2.connect(DATABASE_URL)


def classify(institution_normalized: str | None) -> tuple[str, str, str, str | None, str | None]:
    if institution_normalized is None:
        return ("UNKNOWN", "low", "null_institution", None, None)

    inst_lower = institution_normalized.lower()

    for pattern in INDUSTRY_HIGH:
        if pattern.lower() in inst_lower:
            return (
                "INDUSTRY",
                "high",
                "pattern_industry_high",
                pattern,
                institution_normalized,
            )

    if LILLY_REGEX.search(institution_normalized):
        return (
            "INDUSTRY",
            "high",
            "pattern_industry_high",
            "Lilly (country-suffixed)",
            institution_normalized,
        )

    for pattern in INDUSTRY_LOW:
        if pattern.lower() in inst_lower:
            return (
                "INDUSTRY",
                "low",
                "pattern_industry_low",
                pattern,
                institution_normalized,
            )

    for regex_pattern in GOVERNMENT_REGEX_HIGH:
        if re.search(regex_pattern, institution_normalized, re.IGNORECASE):
            return (
                "GOVERNMENT",
                "high",
                "pattern_government_high",
                regex_pattern,
                institution_normalized,
            )

    for pattern in GOVERNMENT_HIGH:
        if pattern.lower() in inst_lower:
            return (
                "GOVERNMENT",
                "high",
                "pattern_government_high",
                pattern,
                institution_normalized,
            )

    for pattern in GOVERNMENT_MEDIUM:
        if pattern.lower() in inst_lower:
            return (
                "GOVERNMENT",
                "medium",
                "pattern_government_medium",
                pattern,
                institution_normalized,
            )

    return ("ACADEMIC", "medium", "default_academic", None, institution_normalized)


def read_hcp_ids_file(path: str) -> list[str]:
    """One HCP uuid per line; blanks ignored. Mirrors the affected-set files the
    stage-8 scripts consume (compute_affected_hcps.py --out)."""
    ids: list[str] = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            s = line.strip()
            if s:
                ids.append(s)
    return ids


def fetch_hcps(conn, hcp_ids: list[str] | None = None) -> list[tuple[str, str | None]]:
    """All of hcps_v2 (hcp_ids is None -> full reclassify), or just the given ids.
    id::text = ANY(%s) matches the text uuids read from an --hcp-ids-file."""
    with conn.cursor() as cur:
        if hcp_ids:
            cur.execute(
                "SELECT id::text, institution_normalized FROM hcps_v2 "
                "WHERE id::text = ANY(%s)",
                (hcp_ids,),
            )
        else:
            cur.execute("SELECT id::text, institution_normalized FROM hcps_v2")
        return [(row[0], row[1]) for row in cur.fetchall()]


def upsert_classifications(
    conn,
    rows: list[tuple],
    batch_size: int,
) -> int:
    if not rows:
        return 0

    sql = """
        INSERT INTO hcp_industry_classification_v1
          (hcp_id, classification, confidence, match_method,
           matched_pattern, matched_institution, run_id)
        VALUES %s
        ON CONFLICT (hcp_id) DO UPDATE SET
          classification = EXCLUDED.classification,
          confidence = EXCLUDED.confidence,
          match_method = EXCLUDED.match_method,
          matched_pattern = EXCLUDED.matched_pattern,
          matched_institution = EXCLUDED.matched_institution,
          classified_at = now(),
          run_id = EXCLUDED.run_id
    """

    written = 0
    try:
        with conn.cursor() as cur:
            for start in range(0, len(rows), batch_size):
                chunk = rows[start : start + batch_size]
                execute_values(cur, sql, chunk)
                written += len(chunk)
        conn.commit()
        return written
    except Exception:
        conn.rollback()
        raise


def print_summary(summary: Counter, run_id: str, total: int) -> None:
    lines = [
        ("ACADEMIC", "high"),
        ("ACADEMIC", "medium"),
        ("INDUSTRY", "high"),
        ("INDUSTRY", "low"),
        ("GOVERNMENT", "high"),
        ("GOVERNMENT", "medium"),
        ("UNKNOWN", "low"),
    ]
    print(f"\n=== Classification Summary (run_id={run_id}) ===")
    for classification, confidence in lines:
        count = summary.get((classification, confidence), 0)
        print(f"{classification:<12}  {confidence + ':':<8}  {count:>10,}")
    print("--------")
    print(f"{'Total:':<23}  {total:>10,}")


def print_verbose_samples(
    samples: defaultdict[tuple[str, str], list[tuple]],
) -> None:
    print("\n=== Verbose samples (first 20 per non-ACADEMIC bucket) ===")
    bucket_order = [
        ("INDUSTRY", "high"),
        ("INDUSTRY", "low"),
        ("GOVERNMENT", "high"),
        ("GOVERNMENT", "medium"),
        ("UNKNOWN", "low"),
    ]
    for bucket in bucket_order:
        entries = samples.get(bucket, [])
        if not entries:
            continue
        print(f"\n--- {bucket[0]} / {bucket[1]} ({len(entries)} shown) ---")
        for hcp_id, institution, match_method, matched_pattern in entries:
            inst_display = (institution or "")[:80]
            pattern_display = matched_pattern or "-"
            print(
                f"  {hcp_id}  [{match_method}]  pattern={pattern_display}  "
                f"inst={inst_display}"
            )


@click.command()
@click.option("--dry-run", is_flag=True, help="Compute and print summary without writing to DB")
@click.option(
    "--verbose",
    is_flag=True,
    help="Print first 20 classifications for each non-ACADEMIC bucket",
)
@click.option("--batch-size", default=5000, type=int, help="execute_values chunk size")
@click.option(
    "--hcp-ids-file",
    type=click.Path(exists=True, dir_okay=False),
    default=None,
    help="Classify only the HCP ids in this file (one uuid per line, stage-8 "
         "affected-set pattern). Omit to classify all of hcps_v2 (full reclassify).",
)
def main(dry_run: bool, verbose: bool, batch_size: int, hcp_ids_file: str | None) -> None:
    run_id = str(uuid4())
    conn = get_conn()

    hcp_ids = read_hcp_ids_file(hcp_ids_file) if hcp_ids_file else None
    if hcp_ids is not None:
        print(f"Fetching {len(hcp_ids):,} HCP(s) from hcps_v2 (scoped to {hcp_ids_file})...")
    else:
        print("Fetching HCPs from hcps_v2 (full reclassify)...")
    hcps = fetch_hcps(conn, hcp_ids)
    print(f"Loaded {len(hcps):,} HCPs")

    summary: Counter = Counter()
    verbose_samples: defaultdict[tuple[str, str], list[tuple]] = defaultdict(list)
    upsert_rows: list[tuple] = []

    for hcp_id, institution in hcps:
        classification, confidence, match_method, matched_pattern, matched_institution = (
            classify(institution)
        )
        summary[(classification, confidence)] += 1

        bucket = (classification, confidence)
        if classification != "ACADEMIC" and len(verbose_samples[bucket]) < 20:
            verbose_samples[bucket].append(
                (hcp_id, institution, match_method, matched_pattern)
            )

        upsert_rows.append(
            (
                hcp_id,
                classification,
                confidence,
                match_method,
                matched_pattern,
                matched_institution,
                run_id,
            )
        )

    print_summary(summary, run_id, len(hcps))

    if verbose:
        print_verbose_samples(verbose_samples)

    if dry_run:
        print(f"\n[dry-run] would have written {len(upsert_rows):,} rows")
    else:
        written = upsert_classifications(conn, upsert_rows, batch_size)
        print(f"\nWrote {written:,} rows to hcp_industry_classification_v1")
        print(f"Run ID: {run_id}")

    conn.close()


if __name__ == "__main__":
    main()
