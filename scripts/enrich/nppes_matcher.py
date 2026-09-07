"""
NPPES matcher: propose NPI matches for unmatched US HCPs.

BLOCKING KEY (changed 2026-09-06, CRC_COMMUNITY_BUILD.md phase 1)
-----------------------------------------------------------------
The blocking key is now COALESCE(nppes_practice_state, derived_state,
institution_state). It used to be the first two columns only.

WHY: the state provenance repair (2026-09-03) emptied 14,676 institution-derived
values out of nppes_practice_state, which is exactly what this matcher was
blocking on. derived_state has no producer (0.4% of hcps_v2). So after the
repair most colorectal HCPs present no state at all and the matcher generates no
candidates for them. institution_state is where those values now live.

A weak signal is legitimate for NARROWING a candidate set and illegitimate for
DECIDING a match. So:

  * every candidate records WHICH column produced its block key (`block_basis`);
  * a candidate blocked on institution_state may not be written on name+state
    agreement alone -- it needs an independent confirming signal (specialty,
    taxonomy or institution agreement), and it needs to be the ONLY candidate
    that confirms. Otherwise it is held as `unconfirmed`/`ambiguous`;
  * candidates blocked on nppes_practice_state or derived_state keep exactly the
    bar they had before this change;
  * `match_basis` and `confirmation_signals` ride on the proposal row so a weaker
    match stays auditable, the same way `state_basis` does on the read side.

Dropping the confirmation half would recreate, one layer down, the exact failure
the provenance repair existed to prevent.

MODE: --dry-run is the DEFAULT. Writes require an explicit --execute.

Expected Supabase table: npi_match_proposals
Columns:
  hcp_id UUID
  npi TEXT
  npi_first_name TEXT
  npi_last_name TEXT
  npi_credentials TEXT
  npi_practice_city TEXT
  npi_practice_state TEXT
  npi_practice_zip TEXT
  npi_practice_address TEXT
  npi_taxonomy_codes TEXT[]
  npi_primary_taxonomy TEXT
  match_tier INTEGER
  match_confidence INTEGER
  match_status TEXT
  match_calculated_at TIMESTAMPTZ
  candidates_found INTEGER

NOT YET APPLIED -- required before the first --execute run of this version:

  ALTER TABLE public.npi_match_proposals
    ADD COLUMN IF NOT EXISTS block_basis           TEXT,
    ADD COLUMN IF NOT EXISTS block_state           TEXT,
    ADD COLUMN IF NOT EXISTS match_basis           TEXT,
    ADD COLUMN IF NOT EXISTS confirmation_signals  TEXT[];

  -- block_basis          'nppes' | 'derived' | 'institution'
  -- block_state          the two-letter state the block key actually used
  -- match_basis          'nppes_state_unique' | 'nppes_state_disambiguated'
  --                      | 'name_only_nationwide' | 'institution_state_confirmed'
  --                      | NULL when nothing was proposed
  -- confirmation_signals e.g. {'taxonomy:207RX0202X'} -- empty on the nppes bar
"""

from __future__ import annotations

import argparse
import csv
import os
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence, Set, Tuple, Union

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

PARQUET_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\nppes_individual_providers.parquet"
HCP_PAGE_SIZE = 1000
HCP_ID_CHUNK = 200
UPSERT_BATCH_SIZE = 500

# AD ta_id default; resolved from --ta slug at runtime.
DEFAULT_TA_SLUG = "atopic-dermatitis"

# Which column produced the block key. Ordered strongest-first; this IS the
# COALESCE order.
BASIS_NPPES = "nppes"
BASIS_DERIVED = "derived"
BASIS_INSTITUTION = "institution"
STATE_COLUMNS: Tuple[Tuple[str, str], ...] = (
    ("nppes_practice_state", BASIS_NPPES),
    ("derived_state", BASIS_DERIVED),
    ("institution_state", BASIS_INSTITUTION),
)

# NPPES taxonomy codes that independently corroborate "this person practises in
# this TA". A positive allow-list, not a negative exclusion list -- the same
# shape established_npi_resolver.py settled on, expressed as codes because the
# NPPES parquet carries codes and no descriptions.
#
# A TA absent from this map CANNOT confirm an institution-blocked candidate on
# taxonomy, and the run says so loudly rather than falling back to a permissive
# default.
TA_CONFIRMING_TAXONOMIES: Dict[str, Tuple[str, ...]] = {
    "colorectal-cancer": (
        "207RX0202X",  # Medical Oncology
        "207RH0000X",  # Hematology & Oncology
        "208C00000X",  # Colon & Rectal Surgery
        "207RG0100X",  # Gastroenterology
        "2086X0206X",  # Surgical Oncology
        "2085R0001X",  # Radiation Oncology
    ),
}

# Statuses that would put an NPI on a person. Everything else is a hold.
WRITABLE_STATUSES = frozenset({"matched_high", "matched_medium", "matched_institution_confirmed"})

_ELIGIBLE_HCPS_CACHE: Dict[str, List[Dict]] = {}
_COHORT_ROWS_CACHE: Dict[str, List[Dict]] = {}


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def ns(value: Optional[str]) -> str:
    return " ".join(str(value or "").strip().split())


def norm_first(value: Optional[str]) -> str:
    raw = ns(value).lower()
    return raw.split()[0] if raw else ""


def norm_state(value: Optional[str]) -> str:
    return ns(value).upper()


def load_nppes_df() -> pd.DataFrame:
    df = pd.read_parquet(PARQUET_PATH, dtype_backend="numpy_nullable")
    required = [
        "npi",
        "first_name",
        "last_name",
        "middle_name",
        "credentials",
        "practice_city",
        "practice_state",
        "practice_zip",
        "practice_address",
        "taxonomy_1",
        "primary_taxonomy_switch_1",
        "taxonomy_2",
        "primary_taxonomy_switch_2",
        "taxonomy_3",
        "primary_taxonomy_switch_3",
        "taxonomy_4",
        "primary_taxonomy_switch_4",
        "taxonomy_5",
        "primary_taxonomy_switch_5",
    ]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise RuntimeError(f"NPPES parquet missing required columns: {missing}")

    for col in required:
        df[col] = df[col].astype(str)

    df["last_name_norm"] = df["last_name"].str.lower().str.strip()
    df["first_name_norm"] = df["first_name"].str.lower().str.strip()
    df["has_middle_name"] = df["middle_name"].map(lambda v: 1 if ns(v) else 0)
    # The NPPES side of the block key. This is NPPES's own practice_state and is
    # unaffected by the provenance repair; only the hcps_v2 side changed.
    df = df.set_index(["last_name_norm", "practice_state"]).sort_index()
    return df


def _ensure_dataframe(result: Union[pd.DataFrame, pd.Series]) -> pd.DataFrame:
    if isinstance(result, pd.Series):
        return result.to_frame().T
    return result


# TA RESOLUTION MOVED TO scripts/utils/ta_registry.py (2026-08-27). Supabase variant: this
# script holds a PostgREST client, not a DB connection, so it uses the client-side resolver.
# Same cache, same error listing every valid slug.
import os as _os, sys as _sys  # noqa: E402
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "utils"))
from ta_registry import resolve_ta_id_supabase as resolve_ta_id  # noqa: E402,F401


def fetch_community_hcp_ids(supabase: Client, ta_id: str) -> List[str]:
    """Step 1: community cohort hcp_ids from hcp_cohort_classification_v2."""
    ids: List[str] = []
    offset = 0
    while True:
        batch = (
            supabase.table("hcp_cohort_classification_v2")
            .select("hcp_id")
            .eq("therapeutic_area_id", ta_id)
            .eq("cohort", "community")
            .order("hcp_id")
            .range(offset, offset + HCP_PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        ids.extend(str(row["hcp_id"]) for row in batch if row.get("hcp_id"))
        if len(batch) < HCP_PAGE_SIZE:
            break
        offset += HCP_PAGE_SIZE
    return ids


def hcp_state_from_v2(row: Dict) -> Tuple[str, Optional[str]]:
    """
    The block key: COALESCE(nppes_practice_state, derived_state, institution_state),
    plus the name of the column that produced it.

    Returns ("", None) when the row presents no state at all -- which, post
    provenance-repair, is the majority case for colorectal.
    """
    for column, basis in STATE_COLUMNS:
        state = norm_state(row.get(column))
        if state:
            return state, basis
    return "", None


def load_cohort_rows(supabase: Client, ta_id: str) -> List[Dict]:
    """
    Every no-NPI community HCP for the TA, state-set or not.

    Loading the stateless rows too costs one extra column-set and buys the
    absence accounting: "how many HCPs generate no candidate, and why" is not
    answerable if the rows that generate none are filtered out before they are
    counted. Only state-set rows are matched; see load_eligible_unmatched_hcps.
    """
    if ta_id in _COHORT_ROWS_CACHE:
        return _COHORT_ROWS_CACHE[ta_id]

    community_ids = fetch_community_hcp_ids(supabase, ta_id)
    rows: List[Dict] = []

    for i in range(0, len(community_ids), HCP_ID_CHUNK):
        chunk = community_ids[i : i + HCP_ID_CHUNK]
        offset = 0
        while True:
            batch = (
                supabase.table("hcps_v2")
                .select(
                    "id,first_name,last_name,country,"
                    "nppes_practice_state,derived_state,institution_state,institution_state_source,"
                    "institution_city,institution_canonical,institution_normalized,institution_raw,"
                    "current_institution,npi_specialty,npi_taxonomy"
                )
                .in_("id", chunk)
                .is_("npi_number", "null")
                .order("id")
                .range(offset, offset + HCP_PAGE_SIZE - 1)
                .execute()
                .data
                or []
            )
            if not batch:
                break
            for row in batch:
                state, basis = hcp_state_from_v2(row)
                rows.append(
                    {
                        "id": row["id"],
                        "first_name": row.get("first_name"),
                        "last_name": row.get("last_name"),
                        "country": ns(row.get("country")).upper() or None,
                        "state": state,
                        "block_basis": basis,
                        "institution_state_source": row.get("institution_state_source"),
                        "institution_city": row.get("institution_city"),
                        "institution": (
                            ns(row.get("institution_canonical"))
                            or ns(row.get("current_institution"))
                            or ns(row.get("institution_normalized"))
                            or ns(row.get("institution_raw"))
                            or None
                        ),
                        "npi_specialty": row.get("npi_specialty"),
                        "npi_taxonomy": row.get("npi_taxonomy"),
                    }
                )
            if len(batch) < HCP_PAGE_SIZE:
                break
            offset += HCP_PAGE_SIZE

    rows.sort(key=lambda row: str(row["id"]))
    _COHORT_ROWS_CACHE[ta_id] = rows
    return rows


def load_eligible_unmatched_hcps(supabase: Client, ta_id: str) -> List[Dict]:
    """The matchable subset: a block key resolved from one of the three columns."""
    if ta_id in _ELIGIBLE_HCPS_CACHE:
        return _ELIGIBLE_HCPS_CACHE[ta_id]
    eligible = [row for row in load_cohort_rows(supabase, ta_id) if row["state"]]
    _ELIGIBLE_HCPS_CACHE[ta_id] = eligible
    return eligible


def fetch_unmatched_hcps_page(
    supabase: Client,
    ta_id: str,
    offset: int,
    limit: int,
) -> List[Dict]:
    eligible = load_eligible_unmatched_hcps(supabase, ta_id)
    return eligible[offset : offset + limit]


def fetch_unmatched_hcps_count(supabase: Client, ta_id: str) -> int:
    return len(load_eligible_unmatched_hcps(supabase, ta_id))


def candidate_taxonomy_codes(row: pd.Series) -> List[str]:
    values: List[str] = []
    for i in range(1, 6):
        code = ns(row.get(f"taxonomy_{i}"))
        if code:
            values.append(code)
    return values


def primary_taxonomy_code(row: pd.Series) -> Optional[str]:
    for i in range(1, 6):
        switch = ns(row.get(f"primary_taxonomy_switch_{i}")).upper()
        if switch == "Y":
            code = ns(row.get(f"taxonomy_{i}"))
            return code or None
    return None


def confirmation_signals(hcp: Dict, candidate: pd.Series, allow_taxonomies: Set[str]) -> List[str]:
    """
    Independent corroboration that this NPPES record is this HCP -- evidence that
    does NOT come from the state that produced the block key.

    Three signals, in the order CRC_COMMUNITY_BUILD.md names them. Each is
    reported by name so a reviewer can see which one carried a given match:

      taxonomy      the NPPES record practises in a TA-relevant specialty
      specialty     hcps_v2's own specialty/taxonomy agrees with the record's
      institution   the HCP's institution city agrees with the practice city

    Signals whose input is absent simply do not fire. Empty list == not confirmed.
    """
    signals: List[str] = []

    codes = candidate_taxonomy_codes(candidate)
    if allow_taxonomies:
        for code in codes:
            if code in allow_taxonomies:
                signals.append(f"taxonomy:{code}")
                break

    hcp_tax = ns(hcp.get("npi_taxonomy"))
    hcp_spec = ns(hcp.get("npi_specialty")).lower()
    if hcp_tax and hcp_tax in codes:
        signals.append(f"specialty:{hcp_tax}")
    elif hcp_spec and hcp_spec in ns(candidate.get("credentials")).lower():
        signals.append("specialty:npi_specialty")

    hcp_city = ns(hcp.get("institution_city")).upper()
    cand_city = ns(candidate.get("practice_city")).upper()
    if hcp_city and cand_city and hcp_city == cand_city:
        signals.append(f"institution:city={cand_city}")

    return signals


def name_state_candidates(
    nppes_df: pd.DataFrame,
    hcp_first: str,
    hcp_last_norm: str,
    hcp_state: str,
) -> pd.DataFrame:
    if not hcp_state:
        return pd.DataFrame()
    try:
        group = nppes_df.loc[(hcp_last_norm, hcp_state)]
    except KeyError:
        return pd.DataFrame()
    group = _ensure_dataframe(group)
    if group.empty:
        return pd.DataFrame()
    group = group.reset_index()

    group_first_lower = group["first_name_norm"].astype(str).str.lower()
    hcp_first_lower = hcp_first.lower() if hcp_first else ""

    if len(hcp_first_lower) <= 3:
        return group[group_first_lower.eq(hcp_first_lower)]

    exact = group_first_lower.eq(hcp_first_lower)
    starts_with_boundary = group_first_lower.str.startswith(hcp_first_lower + " ") | group_first_lower.str.startswith(
        hcp_first_lower + "."
    )
    return group[exact | starts_with_boundary]


def name_only_candidates(
    nppes_df: pd.DataFrame,
    hcp_first: str,
    hcp_last_norm: str,
) -> pd.DataFrame:
    try:
        group = nppes_df.xs(hcp_last_norm, level=0)
    except KeyError:
        return pd.DataFrame()
    group = _ensure_dataframe(group)
    if group.empty:
        return pd.DataFrame()
    group = group.reset_index()

    group_first_lower = group["first_name_norm"].astype(str).str.lower()
    hcp_first_lower = hcp_first.lower() if hcp_first else ""

    if len(hcp_first_lower) <= 3:
        return group[group_first_lower.eq(hcp_first_lower)]

    exact = group_first_lower.eq(hcp_first_lower)
    starts_with_boundary = group_first_lower.str.startswith(hcp_first_lower + " ") | group_first_lower.str.startswith(
        hcp_first_lower + "."
    )
    return group[exact | starts_with_boundary]


def disambiguate_multi(candidates: pd.DataFrame, hcp_first: str) -> Tuple[Optional[pd.Series], bool]:
    if candidates.empty:
        return None, False
    scored = candidates.copy()
    scored["first_name_len"] = scored["first_name_norm"].map(len)
    scored["first_name_exact"] = scored["first_name_norm"].eq(hcp_first).map(lambda v: 1 if v else 0)
    scored = scored.sort_values(
        by=["first_name_exact", "first_name_len", "has_middle_name"],
        ascending=[False, False, False],
    )
    if len(scored) == 1:
        return scored.iloc[0], False

    top = scored.iloc[0]
    second = scored.iloc[1]
    top_key = (int(top["first_name_exact"]), int(top["first_name_len"]), int(top["has_middle_name"]))
    second_key = (int(second["first_name_exact"]), int(second["first_name_len"]), int(second["has_middle_name"]))
    if top_key == second_key:
        return top, True
    return top, False


def proposal_row(
    hcp_id: str,
    candidate: Optional[pd.Series],
    tier: int,
    confidence: Optional[int],
    status: str,
    candidates_found: int,
    now_iso: str,
    block_basis: Optional[str] = None,
    block_state: Optional[str] = None,
    match_basis: Optional[str] = None,
    signals: Optional[Sequence[str]] = None,
) -> Dict:
    provenance = {
        "block_basis": block_basis,
        "block_state": block_state or None,
        "match_basis": match_basis,
        "confirmation_signals": list(signals or []),
    }

    if candidate is None:
        return {
            "hcp_id": hcp_id,
            "npi": None,
            "npi_first_name": None,
            "npi_last_name": None,
            "npi_credentials": None,
            "npi_practice_city": None,
            "npi_practice_state": None,
            "npi_practice_zip": None,
            "npi_practice_address": None,
            "npi_taxonomy_codes": [],
            "npi_primary_taxonomy": None,
            "match_tier": tier,
            "match_confidence": confidence,
            "match_status": status,
            "match_calculated_at": now_iso,
            "candidates_found": candidates_found,
            **provenance,
        }

    return {
        "hcp_id": hcp_id,
        "npi": ns(candidate.get("npi")) or None,
        "npi_first_name": ns(candidate.get("first_name")) or None,
        "npi_last_name": ns(candidate.get("last_name")) or None,
        "npi_credentials": ns(candidate.get("credentials")) or None,
        "npi_practice_city": ns(candidate.get("practice_city")) or None,
        "npi_practice_state": ns(candidate.get("practice_state")) or None,
        "npi_practice_zip": ns(candidate.get("practice_zip")) or None,
        "npi_practice_address": ns(candidate.get("practice_address")) or None,
        "npi_taxonomy_codes": candidate_taxonomy_codes(candidate),
        "npi_primary_taxonomy": primary_taxonomy_code(candidate),
        "match_tier": tier,
        "match_confidence": confidence,
        "match_status": status,
        "match_calculated_at": now_iso,
        "candidates_found": candidates_found,
        **provenance,
    }


def bulk_upsert_proposals(supabase: Client, rows: Sequence[Dict]) -> None:
    if not rows:
        return
    for start in range(0, len(rows), UPSERT_BATCH_SIZE):
        batch = rows[start : start + UPSERT_BATCH_SIZE]
        supabase.table("npi_match_proposals").upsert(batch, on_conflict="hcp_id").execute()


def match_one(
    hcp: Dict,
    nppes_df: pd.DataFrame,
    allow_taxonomies: Set[str],
    now_iso: str,
) -> Tuple[Dict, str]:
    """
    Returns (proposal row, absence reason or "").

    The bar depends on block_basis and nothing else:
      nppes / derived  -> unchanged from before the blocking-key change
      institution      -> a confirming signal is required, and the confirmed
                          candidate must be the only one
    """
    hcp_id = str(hcp["id"])
    hcp_first = norm_first(hcp.get("first_name"))
    hcp_last_norm = str(hcp.get("last_name") or "").strip().lower()
    hcp_state = norm_state(hcp.get("state"))
    basis = hcp.get("block_basis")

    def row(candidate, tier, confidence, status, found, match_basis=None, signals=None):
        return proposal_row(
            hcp_id, candidate, tier, confidence, status, found, now_iso,
            block_basis=basis, block_state=hcp_state, match_basis=match_basis, signals=signals,
        )

    if not hcp_first or not hcp_last_norm:
        return row(None, 4, None, "no_match", 0), "no_usable_name"

    state_candidates = pd.DataFrame()
    if hcp_state:
        state_candidates = name_state_candidates(nppes_df, hcp_first, hcp_last_norm, hcp_state)

    # ---- institution-blocked: narrowing only; deciding needs corroboration ----
    if basis == BASIS_INSTITUTION:
        found = len(state_candidates)
        if found == 0:
            return row(None, 4, None, "no_match", 0), "no_nppes_candidate_in_state"

        confirmed: List[Tuple[pd.Series, List[str]]] = []
        for _, candidate in state_candidates.iterrows():
            signals = confirmation_signals(hcp, candidate, allow_taxonomies)
            if signals:
                confirmed.append((candidate, signals))

        if len(confirmed) == 1:
            candidate, signals = confirmed[0]
            return (
                row(candidate, 2, 80, "matched_institution_confirmed", found,
                    match_basis="institution_state_confirmed", signals=signals),
                "",
            )
        if len(confirmed) > 1:
            # Several corroborated candidates. The first-name heuristics that
            # break ties on the nppes bar are not strong enough to break this one.
            best, _amb = disambiguate_multi(state_candidates, hcp_first)
            return row(best, 4, None, "ambiguous", found), "institution_multiple_confirmed"
        best, _amb = disambiguate_multi(state_candidates, hcp_first)
        return row(best, 4, None, "unconfirmed", found), "institution_no_confirming_signal"

    # ---- nppes / derived: the bar these rows already had ----
    if len(state_candidates) == 1:
        return row(state_candidates.iloc[0], 1, 95, "matched_high", 1,
                   match_basis="nppes_state_unique"), ""

    if len(state_candidates) > 1:
        found = len(state_candidates)
        best, ambiguous = disambiguate_multi(state_candidates, hcp_first)
        if ambiguous:
            return row(best, 4, None, "ambiguous", found), "nppes_ambiguous"
        return row(best, 2, 85, "matched_medium", found,
                   match_basis="nppes_state_disambiguated"), ""

    if not hcp_state:
        nationwide = name_only_candidates(nppes_df, hcp_first, hcp_last_norm)
        n = len(nationwide)
        if n == 1:
            return row(nationwide.iloc[0], 3, 70, "review_pending", n,
                       match_basis="name_only_nationwide"), ""
        if 2 <= n <= 5:
            best, _amb = disambiguate_multi(nationwide, hcp_first)
            return row(best, 3, 50, "review_pending", n, match_basis="name_only_nationwide"), ""
        if n >= 6:
            best, _amb = disambiguate_multi(nationwide, hcp_first)
            return row(best, 4, None, "ambiguous", n), "name_only_too_many"
        return row(None, 4, None, "no_match", n), "no_nppes_candidate_nationwide"

    return row(None, 4, None, "no_match", 0), "no_nppes_candidate_in_state"


def print_absence(cohort_rows: Sequence[Dict], absence: Counter, ta_slug: str) -> None:
    total = len(cohort_rows)
    stateless = [r for r in cohort_rows if not r["state"]]
    stateless_us = sum(1 for r in stateless if r["country"] == "US")
    stateless_non_us = sum(1 for r in stateless if r["country"] and r["country"] != "US")
    stateless_unknown = len(stateless) - stateless_us - stateless_non_us

    print("\n=== HCPs that generate no candidate, and why ===")
    print(f"  no-NPI {ta_slug} community HCPs: {total}")
    print(f"  never reach the matcher (no state in any of the three columns): {len(stateless)}")
    print(f"      country=US .................. {stateless_us}")
    print(f"      country non-US .............. {stateless_non_us}  (no US NPI to find)")
    print(f"      country unknown ............. {stateless_unknown}")
    print("  reach the matcher and still produce no usable match:")
    for reason in (
        "no_usable_name",
        "no_nppes_candidate_in_state",
        "no_nppes_candidate_nationwide",
        "name_only_too_many",
        "nppes_ambiguous",
        "institution_no_confirming_signal",
        "institution_multiple_confirmed",
    ):
        if absence.get(reason):
            print(f"      {reason:<32} {absence[reason]}")


def write_samples(rows: Sequence[Dict], path: str) -> None:
    fields = [
        "hcp_id", "hcp_name", "hcp_institution", "block_basis", "block_state",
        "institution_state_source", "npi", "npi_name", "npi_practice_city",
        "npi_practice_state", "npi_primary_taxonomy", "npi_taxonomy_codes",
        "candidates_found", "confirmation_signals",
    ]
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k) for k in fields})


def main() -> None:
    parser = argparse.ArgumentParser(description="Propose NPI matches for unmatched US community HCPs")
    parser.add_argument("--ta", default=DEFAULT_TA_SLUG, help="Therapeutic area slug")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Compute matches but skip DB writes (DEFAULT; kept for explicitness)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Write npi_match_proposals. Requires the block_basis/match_basis columns to exist.",
    )
    parser.add_argument("--sample-size", type=int, default=20,
                        help="Institution-blocked confirmed matches to print for review")
    parser.add_argument("--sample-out", help="Optional CSV path for the institution-blocked sample")
    args = parser.parse_args()

    dry_run = not args.execute

    load_dotenv()
    started = time.time()
    supabase = init_supabase()
    ta_id = resolve_ta_id(supabase, args.ta)

    allow_taxonomies = set(TA_CONFIRMING_TAXONOMIES.get(args.ta, ()))

    print(f"TA={args.ta} (ta_id={ta_id})")
    print(f"Mode: {'DRY-RUN (no writes)' if dry_run else 'EXECUTE (writes enabled)'}")
    print("Block key: COALESCE(nppes_practice_state, derived_state, institution_state)")
    if allow_taxonomies:
        print(f"Confirming taxonomies for {args.ta}: {len(allow_taxonomies)} codes")
    else:
        print(
            f"WARNING: no confirming taxonomy list for '{args.ta}'. Institution-blocked "
            "candidates can only confirm on specialty or institution agreement, and will "
            "otherwise be held as unconfirmed."
        )

    print("Loading NPPES parquet...")
    nppes_df = load_nppes_df()

    cohort_rows = load_cohort_rows(supabase, ta_id)
    total_hcps = fetch_unmatched_hcps_count(supabase, ta_id)
    print(f"Loaded {len(cohort_rows)} no-NPI community HCPs; {total_hcps} carry a block key")

    tier_counts: Counter = Counter()
    status_counts: Counter = Counter()
    basis_counts: Counter = Counter()
    basis_status: Counter = Counter()
    basis_candidates: Counter = Counter()
    absence: Counter = Counter()
    samples: List[Dict] = []

    processed = 0
    offset = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    while True:
        hcp_page = fetch_unmatched_hcps_page(supabase, ta_id, offset, HCP_PAGE_SIZE)
        if not hcp_page:
            break

        proposals: List[Dict] = []
        for hcp in hcp_page:
            proposal, reason = match_one(hcp, nppes_df, allow_taxonomies, now_iso)
            proposals.append(proposal)

            basis = proposal["block_basis"] or "none"
            tier_counts[proposal["match_tier"]] += 1
            status_counts[proposal["match_status"]] += 1
            basis_counts[basis] += 1
            basis_status[(basis, proposal["match_status"])] += 1
            if proposal["candidates_found"]:
                basis_candidates[basis] += 1
            if reason:
                absence[reason] += 1

            if (
                proposal["match_status"] == "matched_institution_confirmed"
                and len(samples) < args.sample_size
            ):
                samples.append(
                    {
                        "hcp_id": proposal["hcp_id"],
                        "hcp_name": f"{ns(hcp.get('first_name'))} {ns(hcp.get('last_name'))}".strip(),
                        "hcp_institution": hcp.get("institution"),
                        "block_basis": proposal["block_basis"],
                        "block_state": proposal["block_state"],
                        "institution_state_source": hcp.get("institution_state_source"),
                        "npi": proposal["npi"],
                        "npi_name": f"{proposal['npi_first_name']} {proposal['npi_last_name']}",
                        "npi_practice_city": proposal["npi_practice_city"],
                        "npi_practice_state": proposal["npi_practice_state"],
                        "npi_primary_taxonomy": proposal["npi_primary_taxonomy"],
                        "npi_taxonomy_codes": ";".join(proposal["npi_taxonomy_codes"]),
                        "candidates_found": proposal["candidates_found"],
                        "confirmation_signals": ";".join(proposal["confirmation_signals"]),
                    }
                )

        if not dry_run:
            bulk_upsert_proposals(supabase, proposals)

        processed += len(hcp_page)
        if len(hcp_page) < HCP_PAGE_SIZE:
            break
        offset += HCP_PAGE_SIZE

    print("\n=== NPPES Matcher Summary ===")
    print(f"Total HCPs processed: {processed}")
    print("Tier distribution:")
    for tier in (1, 2, 3, 4):
        print(f"  Tier {tier}: {tier_counts.get(tier, 0)}")
    print("Status distribution:")
    for status in [
        "matched_high",
        "matched_medium",
        "matched_institution_confirmed",
        "review_pending",
        "unconfirmed",
        "no_match",
        "ambiguous",
    ]:
        print(f"  {status}: {status_counts.get(status, 0)}")

    print("\n=== By block basis ===")
    print(f"{'basis':<14}{'HCPs':>8}{'w/ candidate':>14}{'confirmed':>11}")
    for basis in (BASIS_NPPES, BASIS_DERIVED, BASIS_INSTITUTION):
        n = basis_counts.get(basis, 0)
        if not n:
            continue
        confirmed = sum(basis_status.get((basis, s), 0) for s in WRITABLE_STATUSES)
        print(f"{basis:<14}{n:>8}{basis_candidates.get(basis, 0):>14}{confirmed:>11}")
    for basis in (BASIS_NPPES, BASIS_DERIVED, BASIS_INSTITUTION):
        if not basis_counts.get(basis):
            continue
        detail = ", ".join(
            f"{status}={basis_status[(basis, status)]}"
            for status in sorted({s for b, s in basis_status if b == basis})
        )
        print(f"  {basis}: {detail}")

    print_absence(cohort_rows, absence, args.ta)

    inst_confirmed = status_counts.get("matched_institution_confirmed", 0)
    print(f"\n=== Institution-blocked confirmed sample ({len(samples)} of {inst_confirmed}) ===")
    if not samples:
        print("  none")
    for i, s in enumerate(samples, 1):
        print(
            f"  {i:>2}. {s['hcp_name']} [{s['hcp_id'][:8]}] {s['block_state']} "
            f"({s['institution_state_source']})\n"
            f"      inst: {s['hcp_institution']}\n"
            f"      NPI {s['npi']}  {s['npi_name']}  {s['npi_practice_city']}, "
            f"{s['npi_practice_state']}  tax={s['npi_taxonomy_codes']}\n"
            f"      candidates_in_state={s['candidates_found']}  evidence={s['confirmation_signals']}"
        )
    if args.sample_out and samples:
        write_samples(samples, args.sample_out)
        print(f"  sample written to {args.sample_out}")

    applies = sum(status_counts.get(s, 0) for s in ("matched_high", "matched_medium"))
    print(f"\nEstimated v1 application count (nppes/derived bar): {applies}")
    print(f"Held pending founder review (institution bar): {inst_confirmed}")
    if dry_run:
        print("[dry-run] skipped npi_match_proposals upsert -- no NPI was written")
    print(f"Total runtime: {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()
