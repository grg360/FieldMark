"""
FieldMark — Map clinical_trials_v2 rows to therapeutic areas (Hepatology, NSCLC).

Uses conditions and interventions keyword matching. Writes (trial_id, ta_id)
pairs to clinical_trials_ta_v2 with match_signal.

Requires: SUPABASE_URL, SUPABASE_KEY (python-dotenv loads .env).
clinical_trials_ta_v2 must already exist in Supabase (create manually).

Examples:
  python trial_ta_mapping.py --dry-run
  python trial_ta_mapping.py --execute
"""

from __future__ import annotations

import argparse
import random
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from supabase import Client, create_client

# ---------------------------------------------------------------------------
# Therapeutic area IDs
# ---------------------------------------------------------------------------

HEP_TA_ID = "9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e"
NSCLC_TA_ID = "c0065b03-a25e-4e9a-bde4-4b4d0db7827d"

HEP_CONDITION_KEYWORDS = [
    "liver",
    "hepatic",
    "hepatitis",
    "cirrhosis",
    "cholestasis",
    "cholangi",
    "steatohepat",
    "hepatocellular",
    "hepatorenal",
    "nash",
    "mash",
    "nafld",
    "mafld",
    "masld",
    "pbc",
    "psc",
    "hcc",
    "icc",
    "hbv",
    "hcv",
    "aclf",
    "aih",
    "dili",
    "wilson disease",
    "hemochromatosis",
    "alpha 1-antitrypsin",
    "end stage liver",
    "esophageal varices",
    "biliary tract",
    "bile duct",
]

HEP_DRUG_KEYWORDS = [
    "resmetirom",
    "rezdiffra",
    "obeticholic",
    "ocaliva",
    "seladelpar",
    "elafibranor",
    "lanifibranor",
    "efinopegdutide",
    "pegozafermin",
    "aldafermin",
    "linerixibat",
]

NSCLC_CONDITION_KEYWORDS = [
    "non-small cell lung",
    "non small cell lung",
    "nsclc",
    "lung adenocarcinoma",
    "pulmonary adenocarcinoma",
    "lung squamous",
    "squamous nsclc",
    "luad",
    "lusc",
    "lcnec",
    "large cell neuroendocrine",
    "non-small-cell lung",
    "carcinoma non-small-cell lung",
    "lung neoplasm",
]

NSCLC_DRUG_KEYWORDS_STRICT = [
    "osimertinib",
    "tagrisso",
    "amivantamab",
    "rybrevant",
    "lazertinib",
    "sotorasib",
    "lumakras",
    "adagrasib",
    "krazati",
    "alectinib",
    "alecensa",
    "lorlatinib",
    "lorbrena",
    "trastuzumab deruxtecan",
    "t-dxd",
    "enhertu",
    "selpercatinib",
    "capmatinib",
    "tabrecta",
    "brigatinib",
    "crizotinib",
    "xalkori",
]

NSCLC_DRUG_KEYWORDS_GATED = [
    "pembrolizumab",
    "keytruda",
    "nivolumab",
    "opdivo",
    "durvalumab",
    "imfinzi",
    "atezolizumab",
    "tecentriq",
]

TA_LABELS = {
    HEP_TA_ID: "Hepatology",
    NSCLC_TA_ID: "NSCLC",
}

READ_PAGE_SIZE = 1000
WRITE_BATCH_SIZE = 500
SAMPLE_SIZE = 20

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS clinical_trials_ta_v2 (
    trial_id UUID NOT NULL REFERENCES clinical_trials_v2(id) ON DELETE CASCADE,
    therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id) ON DELETE CASCADE,
    match_signal TEXT NOT NULL,
    tagged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (trial_id, therapeutic_area_id)
);
"""


# ---------------------------------------------------------------------------
# Env / client
# ---------------------------------------------------------------------------


def env(name: str) -> str:
    import os

    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing env var: {name}")
    return v


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


def ensure_clinical_trials_ta_table(client: Client) -> None:
    """Create clinical_trials_ta_v2 if missing (idempotent DDL)."""
    try:
        client.rpc("exec_sql", {"sql": CREATE_TABLE_SQL}).execute()
        print("Ensured clinical_trials_ta_v2 exists (exec_sql).")
    except Exception as exc:
        raise RuntimeError(
            "Failed to create clinical_trials_ta_v2 via exec_sql. "
            "Run CREATE TABLE manually in Supabase SQL editor."
        ) from exc


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------


def classify_trial(conditions_json: Any, interventions_json: Any) -> Dict[str, str]:
    """Returns dict {ta_id: signal_str} for matching TAs."""
    matches: Dict[str, str] = {}

    cond_text = " ".join([str(c).lower() for c in (conditions_json or []) if c])
    intv_text = " ".join(
        [
            str(i.get("name", "")).lower()
            for i in (interventions_json or [])
            if isinstance(i, dict)
        ]
    )

    hep_cond_hit = any(kw in cond_text for kw in HEP_CONDITION_KEYWORDS)
    hep_drug_hit = any(kw in intv_text for kw in HEP_DRUG_KEYWORDS)
    if hep_cond_hit and hep_drug_hit:
        matches[HEP_TA_ID] = "both"
    elif hep_cond_hit:
        matches[HEP_TA_ID] = "conditions"
    elif hep_drug_hit:
        matches[HEP_TA_ID] = "interventions"

    nsclc_cond_hit = any(kw in cond_text for kw in NSCLC_CONDITION_KEYWORDS)
    nsclc_strict_drug_hit = any(kw in intv_text for kw in NSCLC_DRUG_KEYWORDS_STRICT)
    nsclc_gated_drug_hit = any(kw in intv_text for kw in NSCLC_DRUG_KEYWORDS_GATED)

    if nsclc_cond_hit and (nsclc_strict_drug_hit or nsclc_gated_drug_hit):
        matches[NSCLC_TA_ID] = "both"
    elif nsclc_cond_hit:
        matches[NSCLC_TA_ID] = "conditions"
    elif nsclc_strict_drug_hit:
        matches[NSCLC_TA_ID] = "interventions"

    return matches


# ---------------------------------------------------------------------------
# IO
# ---------------------------------------------------------------------------


def fetch_trials_page(client: Client, last_id: Optional[str]) -> List[Dict[str, Any]]:
    q = (
        client.table("clinical_trials_v2")
        .select("id,nct_id,title,conditions,interventions")
        .order("id")
        .limit(READ_PAGE_SIZE)
    )
    if last_id is not None:
        q = q.gt("id", last_id)
    return q.execute().data or []


def upsert_ta_rows(client: Client, rows: List[Dict[str, Any]]) -> int:
    if not rows:
        return 0
    written = 0
    for start in range(0, len(rows), WRITE_BATCH_SIZE):
        batch = rows[start : start + WRITE_BATCH_SIZE]
        response = (
            client.table("clinical_trials_ta_v2")
            .upsert(batch, on_conflict="trial_id,therapeutic_area_id")
            .execute()
        )
        if not response.data:
            raise RuntimeError(
                f"clinical_trials_ta_v2 upsert returned empty data ({len(batch)} rows) - "
                "writes may have been silently dropped"
            )
        written += len(response.data)
    return written


def run_validation(tagged_by_ta: Dict[str, List[Dict[str, Any]]]) -> None:
    print("\n--- Validation ---")
    for ta_id, label in TA_LABELS.items():
        n = len(tagged_by_ta.get(ta_id, []))
        print(f"{label}: {n} trials tagged")

    for ta_id, label in TA_LABELS.items():
        pool = tagged_by_ta.get(ta_id, [])
        if not pool:
            print(f"\nNo {label} samples to show.")
            continue
        sample_n = min(SAMPLE_SIZE, len(pool))
        print(f"\nSample {sample_n} random {label} tagged trials:")
        for row in random.sample(pool, sample_n):
            print(
                f"  nct_id={row.get('nct_id')}  signal={row.get('match_signal')}\n"
                f"    title={row.get('title')!r}\n"
                f"    conditions={row.get('conditions')}"
            )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Map clinical trials to therapeutic areas.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Classify and validate only; no writes.")
    group.add_argument("--execute", action="store_true", help="Classify, validate, and upsert tags.")
    args = parser.parse_args()
    execute = args.execute

    client = sb()
    # clinical_trials_ta_v2 must exist in Supabase before running (DDL applied manually).

    upsert_rows: List[Dict[str, Any]] = []
    tagged_by_ta: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    signal_counts: Counter[str] = Counter()
    trials_scanned = 0
    trials_with_any_tag = 0
    last_id: Optional[str] = None
    now_iso = datetime.now(timezone.utc).isoformat()

    print("Scanning clinical_trials_v2...")
    while True:
        batch = fetch_trials_page(client, last_id)
        if not batch:
            break

        page_tags = 0
        for trial in batch:
            trials_scanned += 1
            trial_id = str(trial["id"])
            ta_matches = classify_trial(trial.get("conditions"), trial.get("interventions"))
            if not ta_matches:
                continue

            trials_with_any_tag += 1
            page_tags += len(ta_matches)
            sample_row = {
                "nct_id": trial.get("nct_id"),
                "title": trial.get("title"),
                "conditions": trial.get("conditions"),
            }
            for ta_id, signal in ta_matches.items():
                signal_counts[f"{TA_LABELS.get(ta_id, ta_id)}:{signal}"] += 1
                tagged_by_ta[ta_id].append({**sample_row, "match_signal": signal})
                upsert_rows.append(
                    {
                        "trial_id": trial_id,
                        "therapeutic_area_id": ta_id,
                        "match_signal": signal,
                        "tagged_at": now_iso,
                    }
                )

        last_id = str(batch[-1]["id"])
        print(
            f"  page: scanned {trials_scanned} trials, "
            f"page_tags={page_tags}, cumulative_pairs={len(upsert_rows)}"
        )
        if len(batch) < READ_PAGE_SIZE:
            break

    print(
        f"\nClassification complete: {trials_scanned} trials scanned, "
        f"{trials_with_any_tag} trials with >=1 TA, {len(upsert_rows)} (trial, TA) pairs."
    )
    if signal_counts:
        print("Signal breakdown:")
        for key, count in sorted(signal_counts.items()):
            print(f"  {key}: {count}")

    if execute:
        print(f"\nUpserting {len(upsert_rows)} rows to clinical_trials_ta_v2...")
        written = upsert_ta_rows(client, upsert_rows)
        print(f"Upserted {written} rows.")
    else:
        print("\nDry run — no database writes.")

    run_validation(tagged_by_ta)


if __name__ == "__main__":
    main()
