"""
FieldMark — Score Established HCPs per therapeutic area (Hepatology, NSCLC).

Reads hcps_v2 where cohort_classification='established' and supporting v2 tables.
Writes per-(hcp_id, ta_id) scores to hcp_established_scores_v2.

Requires: SUPABASE_URL, SUPABASE_KEY (python-dotenv loads .env).
hcp_established_scores_v2 must already exist in Supabase (create manually).

Examples:
  python established_scoring.py --dry-run
  python established_scoring.py --execute
"""

from __future__ import annotations

import argparse
import math
import re
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

from score_ranking import compute_and_write_ranks

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HEP_TA_ID = "9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e"
NSCLC_TA_ID = "c0065b03-a25e-4e9a-bde4-4b4d0db7827d"
TARGET_TA_IDS = [HEP_TA_ID, NSCLC_TA_ID]

CAREER_AGE_CAP = 50
CURRENT_YEAR = 2026
RECENT_PUB_WINDOW = 3
CONCEPT_SCORE_THRESHOLD = 0.4

READ_PAGE_SIZE = 1000
WRITE_BATCH_SIZE = 500
VALIDATION_TOP_N = 20

WEIGHTS = {
    "pub_volume": 0.30,
    "recent_productivity": 0.20,
    "lead_density": 0.15,
    "trial": 0.15,
    "career_length": 0.10,
    "pharma_breadth": 0.10,
}

SIGNAL_KEYS = (
    "pub_volume",
    "recent_productivity",
    "lead_density",
    "trial",
    "career_length",
    "pharma_breadth",
)

CANONICALS = [
    {"label": "Loomba", "hcp_id": "8a5ed89d-df8a-4b7c-a5f7-37f602b63577"},
    {"label": "Sanyal", "hcp_id": "be751618-9371-4ce1-8760-c579599fd30e"},
    {"label": "Chalasani", "hcp_id": "22388b63-dc82-44d7-abaa-24ab8f4ab8eb"},
    {"label": "Kowdley", "hcp_id": "272ff3bc-0464-499b-9ab2-1ceae503e415"},
]

TA_LABELS = {
    HEP_TA_ID: "Hepatology",
    NSCLC_TA_ID: "NSCLC",
}


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


# ---------------------------------------------------------------------------
# Pagination helpers
# ---------------------------------------------------------------------------


def fetch_pages(
    client: Client,
    table: str,
    columns: str,
    *,
    order_column: str = "id",
    page_size: int = READ_PAGE_SIZE,
    filters: Optional[List[Tuple[str, str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Cursor pagination by order_column (surrogate id or leading PK column)."""
    rows: List[Dict[str, Any]] = []
    last_cursor: Optional[str] = None
    while True:
        q = client.table(table).select(columns).order(order_column).limit(page_size)
        if filters:
            for op, col, val in filters:
                if op == "eq":
                    q = q.eq(col, val)
        if last_cursor is not None:
            q = q.gt(order_column, last_cursor)
        batch = q.execute().data or []
        if not batch:
            break
        rows.extend(batch)
        last_cursor = str(batch[-1][order_column])
        if len(batch) < page_size:
            break
    return rows


# ---------------------------------------------------------------------------
# Curated concepts / pub TA relevance (scoring_pipeline.py parity)
# ---------------------------------------------------------------------------


def fetch_curated_concepts_by_ta(client: Client) -> Dict[str, Set[str]]:
    """Return {ta_id: set(openalex_concept_ids)}."""
    raw = (
        client.table("curated_ta_concepts")
        .select("therapeutic_area_id,openalex_concept_id")
        .execute()
        .data
        or []
    )
    by_ta: Dict[str, Set[str]] = {}
    for r in raw:
        ta_id = str(r.get("therapeutic_area_id") or "")
        c_id = str(r.get("openalex_concept_id") or "")
        if ta_id and c_id:
            by_ta.setdefault(ta_id, set()).add(c_id)
    return by_ta


def compute_pub_ta_relevance(
    publications: Sequence[Dict[str, Any]],
    curated_by_ta: Dict[str, Set[str]],
) -> Dict[str, Set[str]]:
    """Return {publication_id: set(ta_ids)} at CONCEPT_SCORE_THRESHOLD."""
    pub_tas: Dict[str, Set[str]] = {}
    for pub in publications:
        pub_id = pub.get("id")
        if not pub_id:
            continue
        concepts = pub.get("openalex_concepts") or []
        if not isinstance(concepts, list):
            continue
        relevant_concept_ids: Set[str] = set()
        for c in concepts:
            if not isinstance(c, dict):
                continue
            c_id = c.get("id")
            try:
                c_score = float(c.get("score") or 0)
            except (TypeError, ValueError):
                continue
            if c_id and c_score >= CONCEPT_SCORE_THRESHOLD:
                relevant_concept_ids.add(str(c_id))
        if not relevant_concept_ids:
            continue
        tas_for_pub: Set[str] = set()
        for ta_id, curated_set in curated_by_ta.items():
            if relevant_concept_ids & curated_set:
                tas_for_pub.add(ta_id)
        if tas_for_pub:
            pub_tas[str(pub_id)] = tas_for_pub
    return pub_tas


# ---------------------------------------------------------------------------
# Trial / normalization helpers
# ---------------------------------------------------------------------------


def phase_bucket(phase_value: Optional[str]) -> Optional[int]:
    if not phase_value:
        return None
    text = str(phase_value).lower()
    if "phase 3" in text or "phase iii" in text:
        return 3
    if "phase 2" in text or "phase ii" in text:
        return 2
    if "phase 1" in text or "phase i" in text:
        return 1
    return None


def role_bucket(role_value: Optional[str]) -> str:
    if not role_value:
        return "other"
    text = str(role_value).lower().replace("_", " ")
    if "principal investigator" in text or re.search(r"\bpi\b", text):
        return "pi"
    if (
        "sub investigator" in text
        or "co-investigator" in text
        or "co investigator" in text
        or "study chair" in text
        or "study director" in text
    ):
        return "coi"
    return "other"


def established_trial_role_phase_weight(role: Optional[str], phase: Optional[str]) -> float:
    p = phase_bucket(phase)
    r = role_bucket(role)
    if p == 3 and r == "pi":
        return 5.0
    if p == 2 and r == "pi":
        return 3.0
    if p == 3 and r == "coi":
        return 2.0
    if p == 2 and r == "coi":
        return 1.0
    return 0.5


def normalize_0_100(values: Dict[Tuple[str, str], float]) -> Dict[Tuple[str, str], float]:
    if not values:
        return {}
    min_v = min(values.values())
    max_v = max(values.values())
    if math.isclose(min_v, max_v):
        return {k: 50.0 for k in values}
    return {
        k: max(0.0, min(100.0, ((v - min_v) / (max_v - min_v)) * 100.0))
        for k, v in values.items()
    }


def safe_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def is_us_country(country: Optional[str]) -> bool:
    c = (country or "").strip().upper()
    return c in ("US", "USA")


# ---------------------------------------------------------------------------
# Score row
# ---------------------------------------------------------------------------


@dataclass
class EstablishedScoreRow:
    hcp_id: str
    therapeutic_area_id: str
    composite_score: float
    normalized_score: float
    pub_volume_score: float
    recent_productivity_score: float
    lead_density_score: float
    trial_score: float
    career_length_score: float
    pharma_breadth_score: float
    pharma_weight_applied: bool
    scored_at: str
    scoring_run_id: str


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def _admitted_industry_ids(client: Client, hcp_ids: List[str]) -> Set[str]:
    """HCP ids the industry/government filter admits -- the SAME predicate that
    recompute_established_ranks_v3.fetch_established_cohort() applies, so the score
    table and the rank table agree on membership: classification='ACADEMIC', OR
    classification='GOVERNMENT' whose matched_pattern is National Cancer Institute /
    National Institutes of Health (engageable NCI/NIH trialists, kept deliberately).
    Everything else -- INDUSTRY, FDA/CDC/VA/DoD, UNKNOWN/unclassified -- is excluded.

    fetch_pages only supports eq filters and PostgREST cannot express the OR/LIKE
    predicate cleanly across a paged scan, so this fetches the classification rows for
    the established ids and applies the identical predicate in Python.
    """
    admitted: Set[str] = set()
    chunk_size = 300
    for start in range(0, len(hcp_ids), chunk_size):
        chunk = hcp_ids[start : start + chunk_size]
        resp = (
            client.table("hcp_industry_classification_v1")
            .select("hcp_id,classification,matched_pattern")
            .in_("hcp_id", chunk)
            .execute()
        )
        for r in resp.data or []:
            cls = r.get("classification")
            mp = r.get("matched_pattern") or ""
            if cls == "ACADEMIC" or (
                cls == "GOVERNMENT"
                and (
                    "National Cancer Institute" in mp
                    or "National Institutes of Health" in mp
                )
            ):
                admitted.add(str(r.get("hcp_id")))
    return admitted


def load_established_hcps(client: Client) -> List[Dict[str, Any]]:
    print("Loading established HCPs from hcps_v2...")
    rows = fetch_pages(
        client,
        "hcps_v2",
        "id,first_name,last_name,country,total_career_pubs,career_first_pub_year,"
        "latest_pub_year,career_age_years,nppes_career_stage_years",
        order_column="id",
        filters=[("eq", "cohort_classification", "established")],
    )
    # Industry/government filter (same predicate as the rank script). NCI/NIH exempted.
    ids = [str(r["id"]) for r in rows if r.get("id")]
    admitted = _admitted_industry_ids(client, ids)
    kept = [r for r in rows if str(r.get("id")) in admitted]
    print(
        f"  Loaded {len(rows)} established HCPs; kept {len(kept)} after the "
        f"industry/government filter ({len(rows) - len(kept)} excluded: INDUSTRY, "
        f"FDA/CDC/VA/DoD, UNKNOWN)"
    )
    return kept


def load_publications(client: Client) -> List[Dict[str, Any]]:
    print("Loading publications_v2...")
    rows = fetch_pages(
        client,
        "publications_v2",
        "id,pub_year,openalex_concepts",
        order_column="id",
    )
    print(f"  Loaded {len(rows)} publications")
    return rows


def load_publication_authors(
    client: Client, established_ids: Set[str]
) -> List[Dict[str, Any]]:
    print("Loading publication_authors_v2 (filtering to established HCPs)...")
    all_rows = fetch_pages(
        client,
        "publication_authors_v2",
        "hcp_id,publication_id,is_first_author,is_senior_author",
        order_column="publication_id",
    )
    rows = [r for r in all_rows if str(r.get("hcp_id") or "") in established_ids]
    print(f"  Kept {len(rows)} of {len(all_rows)} author links for established cohort")
    return rows


def load_trial_investigators(
    client: Client, established_ids: Set[str]
) -> List[Dict[str, Any]]:
    print("Loading trial_investigators_v2 (filtering to established HCPs)...")
    all_rows = fetch_pages(
        client,
        "trial_investigators_v2",
        "hcp_id,trial_id,role",
        order_column="trial_id",
    )
    rows = [r for r in all_rows if str(r.get("hcp_id") or "") in established_ids]
    print(f"  Kept {len(rows)} of {len(all_rows)} trial investigator links")
    return rows


def load_open_payments(
    client: Client, established_ids: Set[str]
) -> Dict[str, int]:
    print("Loading hcp_open_payments_summary_v2 (filtering to established HCPs)...")
    all_rows = fetch_pages(
        client,
        "hcp_open_payments_summary_v2",
        "hcp_id,distinct_companies_lifetime",
        order_column="hcp_id",
    )
    out: Dict[str, int] = {}
    for r in all_rows:
        hcp_id = str(r.get("hcp_id") or "")
        if hcp_id in established_ids:
            out[hcp_id] = safe_int(r.get("distinct_companies_lifetime"), 0)
    print(f"  Loaded open payments for {len(out)} established HCPs")
    return out


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def build_indexes(
    publications: Sequence[Dict[str, Any]],
    publication_authors: Sequence[Dict[str, Any]],
    trial_investigators: Sequence[Dict[str, Any]],
    clinical_trials: Sequence[Dict[str, Any]],
    clinical_trials_ta: Sequence[Dict[str, Any]],
) -> Tuple[
    Dict[str, Dict[str, Any]],
    Dict[str, List[Dict[str, Any]]],
    Dict[Tuple[str, str], Dict[str, Any]],
    Dict[str, List[Dict[str, Any]]],
    Dict[str, Dict[str, Any]],
    Dict[str, Set[str]],
]:
    pub_by_id: Dict[str, Dict[str, Any]] = {}
    for pub in publications:
        pid = pub.get("id")
        if pid:
            pub_by_id[str(pid)] = pub

    auth_by_pair: Dict[Tuple[str, str], Dict[str, Any]] = {}
    pubs_by_hcp: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for link in publication_authors:
        hcp_id = str(link.get("hcp_id") or "")
        pub_id = str(link.get("publication_id") or "")
        if not hcp_id or not pub_id:
            continue
        auth_by_pair[(hcp_id, pub_id)] = link
        pub = pub_by_id.get(pub_id)
        if pub:
            pubs_by_hcp[hcp_id].append(pub)

    links_by_hcp: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for link in trial_investigators:
        hcp_id = link.get("hcp_id")
        if hcp_id:
            links_by_hcp[str(hcp_id)].append(link)

    trials_by_id: Dict[str, Dict[str, Any]] = {}
    for trial in clinical_trials:
        tid = trial.get("id")
        if tid:
            trials_by_id[str(tid)] = trial

    tas_by_trial: Dict[str, Set[str]] = defaultdict(set)
    for row in clinical_trials_ta:
        trial_id = str(row.get("trial_id") or "")
        ta_id = str(row.get("therapeutic_area_id") or "")
        if trial_id and ta_id:
            tas_by_trial[trial_id].add(ta_id)

    return pub_by_id, dict(pubs_by_hcp), auth_by_pair, dict(links_by_hcp), trials_by_id, dict(tas_by_trial)


def compute_raw_signals(
    hcps: Sequence[Dict[str, Any]],
    pubs_by_hcp: Dict[str, List[Dict[str, Any]]],
    auth_by_pair: Dict[Tuple[str, str], Dict[str, Any]],
    links_by_hcp: Dict[str, List[Dict[str, Any]]],
    trials_by_id: Dict[str, Dict[str, Any]],
    tas_by_trial: Dict[str, Set[str]],
    pub_tas: Dict[str, Set[str]],
    payments_by_hcp: Dict[str, int],
) -> Tuple[
    Dict[Tuple[str, str], Dict[str, float]],
    Dict[Tuple[str, str], bool],
]:
    """Return raw signal dicts and pharma_weight_applied per (hcp_id, ta_id)."""
    raw: Dict[Tuple[str, str], Dict[str, float]] = {}
    pharma_applied: Dict[Tuple[str, str], bool] = {}

    for hcp in hcps:
        hcp_id = str(hcp.get("id") or "")
        if not hcp_id:
            continue

        all_pubs = pubs_by_hcp.get(hcp_id, [])
        hcp_trial_links = links_by_hcp.get(hcp_id, [])
        us_hcp = is_us_country(hcp.get("country"))
        career_raw = min(float(safe_int(hcp.get("career_age_years"), 0)), float(CAREER_AGE_CAP))

        for ta_id in TARGET_TA_IDS:
            key = (hcp_id, ta_id)

            hcp_pubs = [
                pub
                for pub in all_pubs
                if pub.get("id") and ta_id in pub_tas.get(str(pub.get("id")), set())
            ]

            pub_volume_raw = math.log(1.0 + len(hcp_pubs))
            recent_pubs = [
                p
                for p in hcp_pubs
                if safe_int(p.get("pub_year"), 0) >= CURRENT_YEAR - RECENT_PUB_WINDOW
            ]
            recent_productivity_raw = len(recent_pubs) / float(RECENT_PUB_WINDOW)

            lead_count = 0
            for pub in hcp_pubs:
                pid = str(pub.get("id"))
                auth = auth_by_pair.get((hcp_id, pid), {})
                if auth.get("is_first_author") or auth.get("is_senior_author"):
                    lead_count += 1
            denom = max(len(hcp_pubs), 1)
            lead_density_raw = lead_count / denom

            trial_score_raw = 0.0
            for link in hcp_trial_links:
                trial_id = str(link.get("trial_id") or "")
                if ta_id not in tas_by_trial.get(trial_id, set()):
                    continue
                trial = trials_by_id.get(trial_id)
                if not trial:
                    continue
                trial_score_raw += established_trial_role_phase_weight(
                    link.get("role"), trial.get("phase")
                )

            if us_hcp:
                pharma_breadth_raw = float(payments_by_hcp.get(hcp_id, 0))
                applied = True
            else:
                pharma_breadth_raw = 0.0
                applied = False

            raw[key] = {
                "pub_volume": pub_volume_raw,
                "recent_productivity": recent_productivity_raw,
                "lead_density": lead_density_raw,
                "trial": trial_score_raw,
                "career_length": career_raw,
                "pharma_breadth": pharma_breadth_raw,
            }
            pharma_applied[key] = applied

    return raw, pharma_applied


def compute_scores(
    raw_signals: Dict[Tuple[str, str], Dict[str, float]],
    pharma_applied: Dict[Tuple[str, str], bool],
    scoring_run_id: str,
) -> List[EstablishedScoreRow]:
    now_iso = datetime.now(timezone.utc).isoformat()

    normalized_signals: Dict[str, Dict[Tuple[str, str], float]] = {
        signal: {} for signal in SIGNAL_KEYS
    }
    for ta_id in TARGET_TA_IDS:
        ta_keys = [k for k in raw_signals if k[1] == ta_id]
        for signal in SIGNAL_KEYS:
            signal_map = {
                k: raw_signals[k][signal] for k in ta_keys if k in raw_signals
            }
            normalized_signals[signal].update(normalize_0_100(signal_map))

    composite_by_key: Dict[Tuple[str, str], float] = {}
    for key, signals in raw_signals.items():
        applied = pharma_applied.get(key, False)
        if applied:
            composite = sum(
                normalized_signals[s].get(key, 0.0) * WEIGHTS[s] for s in SIGNAL_KEYS
            )
        else:
            total_other = 1.0 - WEIGHTS["pharma_breadth"]
            composite = sum(
                normalized_signals[s].get(key, 0.0) * WEIGHTS[s] / total_other
                for s in SIGNAL_KEYS
                if s != "pharma_breadth"
            )
        composite_by_key[key] = composite

    normalized_composite: Dict[Tuple[str, str], float] = {}
    for ta_id in TARGET_TA_IDS:
        ta_composites = {k: v for k, v in composite_by_key.items() if k[1] == ta_id}
        normalized_composite.update(normalize_0_100(ta_composites))

    rows: List[EstablishedScoreRow] = []
    for key in raw_signals:
        hcp_id, ta_id = key
        rows.append(
            EstablishedScoreRow(
                hcp_id=hcp_id,
                therapeutic_area_id=ta_id,
                composite_score=round(composite_by_key.get(key, 0.0), 4),
                normalized_score=round(normalized_composite.get(key, 0.0), 4),
                pub_volume_score=round(normalized_signals["pub_volume"].get(key, 0.0), 4),
                recent_productivity_score=round(
                    normalized_signals["recent_productivity"].get(key, 0.0), 4
                ),
                lead_density_score=round(normalized_signals["lead_density"].get(key, 0.0), 4),
                trial_score=round(normalized_signals["trial"].get(key, 0.0), 4),
                career_length_score=round(normalized_signals["career_length"].get(key, 0.0), 4),
                pharma_breadth_score=round(normalized_signals["pharma_breadth"].get(key, 0.0), 4),
                pharma_weight_applied=pharma_applied.get(key, False),
                scored_at=now_iso,
                scoring_run_id=scoring_run_id,
            )
        )

    return rows


def upsert_scores(client: Client, rows: Sequence[EstablishedScoreRow]) -> int:
    if not rows:
        return 0
    payload = [
        {
            "hcp_id": r.hcp_id,
            "therapeutic_area_id": r.therapeutic_area_id,
            "composite_score": r.composite_score,
            "normalized_score": r.normalized_score,
            "pub_volume_score": r.pub_volume_score,
            "recent_productivity_score": r.recent_productivity_score,
            "lead_density_score": r.lead_density_score,
            "trial_score": r.trial_score,
            "career_length_score": r.career_length_score,
            "pharma_breadth_score": r.pharma_breadth_score,
            "pharma_weight_applied": r.pharma_weight_applied,
            "scored_at": r.scored_at,
            "scoring_run_id": r.scoring_run_id,
        }
        for r in rows
    ]
    written = 0
    for start in range(0, len(payload), WRITE_BATCH_SIZE):
        batch = payload[start : start + WRITE_BATCH_SIZE]
        response = (
            client.table("hcp_established_scores_v2")
            .upsert(batch, on_conflict="hcp_id,therapeutic_area_id")
            .execute()
        )
        if not response.data:
            raise RuntimeError(
                f"hcp_established_scores_v2 upsert returned empty data ({len(batch)} rows) - "
                "writes may have been silently dropped"
            )
        written += len(response.data)
    return written


def run_validation(
    scores: Sequence[EstablishedScoreRow],
    hcps: Sequence[Dict[str, Any]],
) -> None:
    hcp_by_id = {str(h["id"]): h for h in hcps if h.get("id")}
    by_ta: Dict[str, List[EstablishedScoreRow]] = defaultdict(list)
    for row in scores:
        by_ta[row.therapeutic_area_id].append(row)

    print("\n--- Validation ---")
    for ta_id in TARGET_TA_IDS:
        label = TA_LABELS.get(ta_id, ta_id)
        print(f"{label}: {len(by_ta.get(ta_id, []))} HCPs scored")

    for ta_id in TARGET_TA_IDS:
        label = TA_LABELS.get(ta_id, ta_id)
        pool = sorted(by_ta.get(ta_id, []), key=lambda r: r.normalized_score, reverse=True)
        top = pool[:VALIDATION_TOP_N]
        print(f"\nTop {len(top)} by normalized_score — {label}:")
        for row in top:
            hcp = hcp_by_id.get(row.hcp_id, {})
            name = f"{hcp.get('first_name', '')} {hcp.get('last_name', '')}".strip() or row.hcp_id
            print(
                f"  {name} | {hcp.get('country')} | career_pubs={hcp.get('total_career_pubs')} | "
                f"composite={row.composite_score} | normalized={row.normalized_score}"
            )

    print(f"\nCanonical check — {TA_LABELS[HEP_TA_ID]}:")
    score_by_hcp = {
        (r.hcp_id, r.therapeutic_area_id): r
        for r in scores
        if r.therapeutic_area_id == HEP_TA_ID
    }
    for canon in CANONICALS:
        row = score_by_hcp.get((canon["hcp_id"], HEP_TA_ID))
        if row is None:
            print(f"  {canon['label']}: not scored (missing from established cohort or no row)")
            continue
        hcp = hcp_by_id.get(canon["hcp_id"], {})
        name = f"{hcp.get('first_name', '')} {hcp.get('last_name', '')}".strip()
        print(
            f"  {canon['label']} ({name}): composite={row.composite_score}, "
            f"normalized={row.normalized_score}, trial={row.trial_score}, "
            f"pub_volume={row.pub_volume_score}"
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Score Established HCPs per therapeutic area.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Compute and validate; no writes.")
    group.add_argument("--execute", action="store_true", help="Compute, validate, and upsert scores.")
    args = parser.parse_args()
    execute = args.execute

    client = sb()
    scoring_run_id = str(uuid.uuid4())
    print(f"Scoring run id: {scoring_run_id}")

    hcps = load_established_hcps(client)
    established_ids = {str(h["id"]) for h in hcps if h.get("id")}
    if not established_ids:
        print("No established HCPs found; exiting.")
        return

    print("Loading curated_ta_concepts and computing per-pub TA relevance...")
    curated_by_ta = fetch_curated_concepts_by_ta(client)
    publications = load_publications(client)
    pub_tas = compute_pub_ta_relevance(publications, curated_by_ta)
    print(f"  {len(pub_tas)} publications have TA relevance")

    publication_authors = load_publication_authors(client, established_ids)

    print("Loading clinical_trials_ta_v2...")
    clinical_trials_ta = fetch_pages(
        client,
        "clinical_trials_ta_v2",
        "trial_id,therapeutic_area_id,match_signal",
        order_column="trial_id",
    )
    print(f"  Loaded {len(clinical_trials_ta)} trial-TA tags")

    trial_investigators = load_trial_investigators(client, established_ids)

    print("Loading clinical_trials_v2...")
    clinical_trials = fetch_pages(client, "clinical_trials_v2", "id,phase", order_column="id")
    print(f"  Loaded {len(clinical_trials)} trials")

    payments_by_hcp = load_open_payments(client, established_ids)

    _, pubs_by_hcp, auth_by_pair, links_by_hcp, trials_by_id, tas_by_trial = build_indexes(
        publications,
        publication_authors,
        trial_investigators,
        clinical_trials,
        clinical_trials_ta,
    )

    print("Computing raw signals...")
    raw_signals, pharma_applied = compute_raw_signals(
        hcps=hcps,
        pubs_by_hcp=pubs_by_hcp,
        auth_by_pair=auth_by_pair,
        links_by_hcp=links_by_hcp,
        trials_by_id=trials_by_id,
        tas_by_trial=tas_by_trial,
        pub_tas=pub_tas,
        payments_by_hcp=payments_by_hcp,
    )
    print(f"  Computed {len(raw_signals)} (hcp, TA) signal sets")

    print("Normalizing and building composite scores...")
    scores = compute_scores(raw_signals, pharma_applied, scoring_run_id)
    print(f"  Produced {len(scores)} score rows")

    if execute:
        print(f"Upserting {len(scores)} rows to hcp_established_scores_v2...")
        written = upsert_scores(client, scores)
        print(f"Upserted {written} rows.")
    else:
        print("\nDry run — no database writes.")

    # Rank computation respects --execute. execute=True writes, execute=False prints stats only.
    print("\nComputing country/region/global ranks for established cohort...")
    compute_and_write_ranks(
        client=client,
        score_rows=scores,
        cohort="established",
        scoring_run_id=scoring_run_id,
        dry_run=not execute,
    )

    run_validation(scores, hcps)


if __name__ == "__main__":
    main()
