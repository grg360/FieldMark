"""
FieldMark -- Per-TA career-structure cohort classification (v2).

Assigns each HCP in a therapeutic area to a top-level cohort from career structure:
  established | rising_eligible | too_young | community

Reads hcps_v2 and hcp_therapeutic_areas_v2; writes hcp_cohort_classification_v2 only.
Does NOT compute normalized_score or touch any scorer tables.

Requires: SUPABASE_URL, SUPABASE_KEY (.env via python-dotenv).

Examples:
  python scripts/classify/cohort_classification_v2.py --ta atopic-dermatitis --dry-run
  python scripts/classify/cohort_classification_v2.py --ta atopic-dermatitis --execute
  python scripts/classify/cohort_classification_v2.py --ta atopic-dermatitis --cohort established --execute
"""

from __future__ import annotations

import argparse
import os
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

READ_PAGE_SIZE = 1000
WRITE_BATCH_SIZE = 500
HCP_FETCH_CHUNK = 200
PUB_ID_CHUNK = 200
FPY_GARBAGE_MIN = 1940
TA_ESTABLISHED_MIN_PUBS = 5
TA_RISING_MIN_PUBS = 3

COHORT_ESTABLISHED = "established"
COHORT_RISING_ELIGIBLE = "rising_eligible"
COHORT_TOO_YOUNG = "too_young"
COHORT_COMMUNITY = "community"

VALID_COHORTS = {
    COHORT_ESTABLISHED,
    COHORT_RISING_ELIGIBLE,
    COHORT_TOO_YOUNG,
    COHORT_COMMUNITY,
}


def env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing env var: {name}")
    return v


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


def norm(v: Any) -> str:
    return " ".join(str(v or "").strip().split())


def ascii_safe(v: Any) -> str:
    """Strip non-ASCII for console output (Windows cp1252 safe)."""
    return norm(v).encode("ascii", errors="replace").decode("ascii")


def resolve_ta_slug(client: Client, slug: str) -> Tuple[str, str]:
    rows = (
        client.table("therapeutic_areas")
        .select("id,name,slug")
        .eq("slug", slug)
        .execute()
        .data
        or []
    )
    if not rows:
        raise RuntimeError(f"No therapeutic_area found with slug='{slug}'")
    return str(rows[0]["id"]), str(rows[0]["name"])


def fetch_hcp_tas_for_ta(client: Client, ta_id: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        batch = (
            client.table("hcp_therapeutic_areas_v2")
            .select("hcp_id,therapeutic_area_id")
            .eq("therapeutic_area_id", ta_id)
            .order("hcp_id")
            .range(offset, offset + READ_PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < READ_PAGE_SIZE:
            break
        offset += READ_PAGE_SIZE
    return rows


def fetch_hcps_by_ids(client: Client, hcp_ids: Set[str]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    id_list = sorted(hcp_ids)
    for i in range(0, len(id_list), HCP_FETCH_CHUNK):
        chunk = id_list[i : i + HCP_FETCH_CHUNK]
        rows = (
            client.table("hcps_v2")
            .select("id,first_name,last_name,career_first_pub_year_v2,total_career_pubs")
            .in_("id", chunk)
            .execute()
            .data
            or []
        )
        for row in rows:
            hid = row.get("id")
            if hid:
                out[str(hid)] = row
    return out


def fetch_ta_publication_ids(client: Client, ta_id: str) -> Set[str]:
    """All publication_ids tagged to the scoped therapeutic area."""
    out: Set[str] = set()
    offset = 0
    while True:
        batch = (
            client.table("publication_therapeutic_areas_v2")
            .select("publication_id")
            .eq("therapeutic_area_id", ta_id)
            .order("publication_id")
            .range(offset, offset + READ_PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        for row in batch:
            pid = row.get("publication_id")
            if pid:
                out.add(str(pid))
        if len(batch) < READ_PAGE_SIZE:
            break
        offset += READ_PAGE_SIZE
    return out


def fetch_ta_pubs_by_hcp(
    client: Client,
    ta_id: str,
    hcp_ids: Set[str],
) -> Dict[str, int]:
    """
    TA-specific publication count per HCP:
      COUNT(DISTINCT publication_id) from publication_authors_v2
      JOIN publication_therapeutic_areas_v2
      WHERE therapeutic_area_id = scoped ta_id
    Scoped to the TA: load TA-tagged pubs, then authorships for those pubs,
    counted only for the TA's HCPs.
    """
    counts: Dict[str, Set[str]] = {hid: set() for hid in hcp_ids}
    if not hcp_ids:
        return {}

    ta_pub_ids = sorted(fetch_ta_publication_ids(client, ta_id))
    print(f"Loaded {len(ta_pub_ids):,} publication_ids tagged to scoped TA")

    for i in range(0, len(ta_pub_ids), PUB_ID_CHUNK):
        chunk = ta_pub_ids[i : i + PUB_ID_CHUNK]
        offset = 0
        while True:
            batch = (
                client.table("publication_authors_v2")
                .select("hcp_id,publication_id")
                .in_("publication_id", chunk)
                .order("hcp_id")
                .range(offset, offset + READ_PAGE_SIZE - 1)
                .execute()
                .data
                or []
            )
            if not batch:
                break
            for row in batch:
                hid = str(row.get("hcp_id") or "")
                pid = str(row.get("publication_id") or "")
                if hid in counts and pid:
                    counts[hid].add(pid)
            if len(batch) < READ_PAGE_SIZE:
                break
            offset += READ_PAGE_SIZE

    return {hid: len(pubs) for hid, pubs in counts.items()}


def guard_first_pub_year(raw_fpy: Optional[int], current_year: int) -> Tuple[Optional[int], bool]:
    """Return (guarded_fpy, was_garbage). Garbage years are treated as null."""
    if raw_fpy is None:
        return None, False
    try:
        fpy = int(raw_fpy)
    except (TypeError, ValueError):
        return None, True
    if fpy < FPY_GARBAGE_MIN or fpy > current_year:
        return None, True
    return fpy, False


def career_established_sub_rule(
    pubs: int,
    guarded_fpy: Optional[int],
    career_age: Optional[int],
) -> Optional[str]:
    """Existing global career establishment signal (3-way OR). Returns sub-rule name or None."""
    if pubs >= 500:
        return "pubs>=500"
    if pubs >= 200 and guarded_fpy is not None and guarded_fpy < 2020:
        return "pubs>=200_and_pre2020"
    if career_age is not None and career_age > 10:
        return "career_age>10"
    return None


@dataclass
class ClassificationResult:
    cohort: str
    cohort_reason: str
    career_first_pub_year_v2: Optional[int]
    total_career_pubs: int
    career_age: Optional[int]
    ta_pubs: int
    tier_inputs: Dict[str, Any]
    established_sub_rule: Optional[str]


def classify_hcp(
    raw_fpy: Optional[int],
    pubs_raw: Optional[int],
    current_year: int,
    ta_pubs: int = 0,
    ta_established_min_pubs: int = TA_ESTABLISHED_MIN_PUBS,
    ta_rising_min_pubs: int = TA_RISING_MIN_PUBS,
) -> ClassificationResult:
    """
    Career-structure classifier with TA-specific established gate. Order matters:
      1. Established: (ta_pubs >= min) AND (global career rule)
      2. Rising eligible: (career_age 3-10) AND (ta_pubs >= rising min)
      3. Too young (career_age < 3)
      4. Community: career-established but ta_pubs below established min
      5. Community: rising-age but ta_pubs below rising min
      6. Community fallback (no usable career data)
    """
    guarded_fpy, fpy_was_garbage = guard_first_pub_year(raw_fpy, current_year)
    pubs = 0
    if pubs_raw is not None:
        try:
            pubs = int(pubs_raw)
        except (TypeError, ValueError):
            pubs = 0

    try:
        ta_pubs_n = int(ta_pubs or 0)
    except (TypeError, ValueError):
        ta_pubs_n = 0

    career_age: Optional[int] = None
    if guarded_fpy is not None:
        career_age = current_year - guarded_fpy

    career_rule = career_established_sub_rule(pubs, guarded_fpy, career_age)
    established_sub_rule: Optional[str] = None
    has_ta_footprint = ta_pubs_n >= ta_established_min_pubs

    # 1. ESTABLISHED requires BOTH TA footprint AND career rule
    if career_rule is not None and has_ta_footprint:
        cohort = COHORT_ESTABLISHED
        established_sub_rule = career_rule
        reason = f"established:{career_rule}+ta_pubs={ta_pubs_n}"
    elif career_age is not None and 3 <= career_age <= 10 and ta_pubs_n >= ta_rising_min_pubs:
        cohort = COHORT_RISING_ELIGIBLE
        reason = f"rising:career_age_3_10+ta_pubs={ta_pubs_n}"
    elif career_age is not None and career_age < 3:
        cohort = COHORT_TOO_YOUNG
        reason = "career_age<3"
    elif career_rule is not None and not has_ta_footprint:
        # Long/high-volume career but insufficient TA-specific pubs -> community in this TA
        cohort = COHORT_COMMUNITY
        reason = f"community:{career_rule}_but_ta_pubs={ta_pubs_n}"
    elif career_age is not None and 3 <= career_age <= 10:
        # rising-age but insufficient TA footprint
        cohort = COHORT_COMMUNITY
        reason = f"community:rising_age_but_ta_pubs={ta_pubs_n}"
    else:
        cohort = COHORT_COMMUNITY
        reason = "no_career_data"

    tier_inputs = {
        "raw_first_pub_year": raw_fpy,
        "guarded_first_pub_year": guarded_fpy,
        "fpy_garbage_guard_applied": fpy_was_garbage,
        "total_career_pubs": pubs,
        "ta_pubs": ta_pubs_n,
        "ta_established_min_pubs": ta_established_min_pubs,
        "ta_rising_min_pubs": ta_rising_min_pubs,
        "career_age": career_age,
        "current_year": current_year,
        "career_established_sub_rule": career_rule,
        "established_sub_rule": established_sub_rule,
    }

    return ClassificationResult(
        cohort=cohort,
        cohort_reason=reason,
        career_first_pub_year_v2=guarded_fpy,
        total_career_pubs=pubs,
        career_age=career_age,
        ta_pubs=ta_pubs_n,
        tier_inputs=tier_inputs,
        established_sub_rule=established_sub_rule,
    )


def assert_scoped_ta_writes(rows: Sequence[Dict[str, Any]], scoped_ta_id: str) -> None:
    bad = [r for r in rows if str(r.get("therapeutic_area_id")) != scoped_ta_id]
    if bad:
        raise RuntimeError(
            f"SAFETY VIOLATION: {len(bad)} row(s) have therapeutic_area_id != {scoped_ta_id}"
        )


def upsert_classifications(
    client: Client,
    rows: Sequence[Dict[str, Any]],
    scoped_ta_id: str,
    dry_run: bool,
) -> int:
    if not rows:
        return 0
    assert_scoped_ta_writes(rows, scoped_ta_id)
    if dry_run:
        return 0
    written = 0
    for i in range(0, len(rows), WRITE_BATCH_SIZE):
        batch = list(rows[i : i + WRITE_BATCH_SIZE])
        resp = (
            client.table("hcp_cohort_classification_v2")
            .upsert(batch, on_conflict="hcp_id,therapeutic_area_id")
            .execute()
        )
        if not resp.data:
            raise RuntimeError(
                f"hcp_cohort_classification_v2 upsert returned empty data ({len(batch)} rows) - "
                f"writes may have been silently dropped"
            )
        written += len(resp.data)
    return written


def print_dry_run_report(
    classified: List[Dict[str, Any]],
    ta_name: str,
    ta_id: str,
) -> None:
    n = len(classified)
    print(f"\nTA-SCOPED classification: {ta_name} (ta_id={ta_id}). {n} HCPs.")
    print(f"TA_ESTABLISHED_MIN_PUBS={TA_ESTABLISHED_MIN_PUBS}")
    print(f"TA_RISING_MIN_PUBS={TA_RISING_MIN_PUBS}")

    cohort_counts: Counter = Counter(r["cohort"] for r in classified)
    print("\nCohort distribution:")
    for cohort in (
        COHORT_ESTABLISHED,
        COHORT_RISING_ELIGIBLE,
        COHORT_TOO_YOUNG,
        COHORT_COMMUNITY,
    ):
        cnt = cohort_counts.get(cohort, 0)
        pct = (100.0 * cnt / n) if n else 0.0
        print(f"  {cohort}: {cnt:,} ({pct:.1f}%)")

    established_rows = [r for r in classified if r["cohort"] == COHORT_ESTABLISHED]
    sub_counts: Counter = Counter()
    for r in established_rows:
        sub = (r.get("tier_inputs") or {}).get("established_sub_rule")
        if sub:
            sub_counts[str(sub)] += 1
    print("\nEstablished-rule breakdown (career sub-rule among established):")
    for rule in ("pubs>=500", "pubs>=200_and_pre2020", "career_age>10"):
        print(f"  {rule}: {sub_counts.get(rule, 0):,}")

    demoted = [
        r
        for r in classified
        if r["cohort"] == COHORT_COMMUNITY
        and str(r.get("cohort_reason") or "").startswith("community:")
        and "_but_ta_pubs=" in str(r.get("cohort_reason") or "")
    ]
    demoted_zero = sum(1 for r in demoted if int(r.get("ta_pubs") or 0) == 0)
    demoted_low = sum(1 for r in demoted if 1 <= int(r.get("ta_pubs") or 0) < TA_ESTABLISHED_MIN_PUBS)
    print(
        f"\nCareer-established but ta_pubs<{TA_ESTABLISHED_MIN_PUBS} "
        f"(routed to community): {len(demoted):,}"
    )
    print(f"  ta_pubs=0: {demoted_zero:,}")
    print(f"  ta_pubs=1..{TA_ESTABLISHED_MIN_PUBS - 1}: {demoted_low:,}")

    print("\nEstablished preview (top 25 by total_career_pubs):")
    top_est = sorted(
        established_rows,
        key=lambda r: int(r.get("total_career_pubs") or 0),
        reverse=True,
    )[:25]
    for r in top_est:
        name = ascii_safe(f"{r.get('first_name', '')} {r.get('last_name', '')}")
        pubs = r.get("total_career_pubs")
        ta_pubs = r.get("ta_pubs")
        fpy = r.get("career_first_pub_year_v2")
        age = r.get("career_age")
        reason = r.get("cohort_reason")
        print(
            f"  {name} | pubs={pubs} | ta_pubs={ta_pubs} | "
            f"first_pub_yr={fpy} | career_age={age} | reason={reason}"
        )

    # Spot-check: known hepatologists must NOT be established; the TA's own reference
    # KOLs must be. PRINT-ONLY — these lists select which rows to display and never
    # reach classify_hcp, so a wrong list makes the readout uninformative, not wrong.
    # Matching is substring on norm().lower() with NO unicode folding: "janne" does NOT
    # match "Jänne" (U+00E4) and "paz-ares" does NOT match "Paz‐Ares" (U+2010 hyphen).
    # hepato_surnames stays valid for EVERY TA — "are hepatologists landing established
    # here?" is the contamination check that motivated the TA-anchored gate.
    hepato_surnames = {
        "sanyal", "loomba", "wedemeyer", "sarin", "tacke",
        "bajaj", "gores", "trebicka", "trautwein",
    }
    ad_kol_surnames = {
        "silverberg", "simpson", "wollenberg", "eichenfield",
        "yosipovitch", "guttman-yassky", "de bruin-weller", "bruin-weller",
    }
    nsclc_kol_surnames = {
        "herbst", "ramalingam", "heymach", "reck", "camidge", "wakelee",
        "rudin", "garon", "gadgeel", "sequist", "brahmer", "hirsch",
        "carbone", "langer", "spigel", "gandara", "oxnard", "socinski",
        "borghaei", "scagliotti", "rosell", "peters", "soria", "shaw",
        "jänne",  # exact: the ASCII fragment "nne" also matches Brunner/Donne etc.
        "paz",    # Paz‐Ares: sidesteps the U+2010 hyphen ("ares" also hits Soares/Tavares)
    }
    kol_label, kol_surnames = {
        "9e4139d2-e062-4a58-8728-cdabb2d7dca1": ("AD", ad_kol_surnames),
        "c0065b03-a25e-4e9a-bde4-4b4d0db7827d": ("NSCLC", nsclc_kol_surnames),
    }.get(str(ta_id), (ta_name, set()))
    print("\nHepatologist spillover check (must NOT be established):")
    hepato_hits = [
        r for r in classified
        if norm(r.get("last_name")).lower() in hepato_surnames
        or any(s in norm(r.get("last_name")).lower() for s in hepato_surnames)
    ]
    if not hepato_hits:
        print("  (none found in TA HCP set)")
    for r in sorted(hepato_hits, key=lambda x: norm(x.get("last_name")).lower()):
        name = ascii_safe(f"{r.get('first_name', '')} {r.get('last_name', '')}")
        print(
            f"  {name} | cohort={r['cohort']} | ta_pubs={r.get('ta_pubs')} | "
            f"reason={r.get('cohort_reason')}"
        )

    print(f"\n{kol_label} KOL check (should remain established):")
    kol_hits = [
        r for r in classified
        if any(
            s in norm(r.get("last_name")).lower()
            for s in kol_surnames
        )
    ]
    if not kol_surnames:
        print("  (no reference KOL list defined for this TA)")
    for r in sorted(kol_hits, key=lambda x: norm(x.get("last_name")).lower()):
        name = ascii_safe(f"{r.get('first_name', '')} {r.get('last_name', '')}")
        print(
            f"  {name} | cohort={r['cohort']} | ta_pubs={r.get('ta_pubs')} | "
            f"reason={r.get('cohort_reason')}"
        )

    community_rows = [r for r in classified if r["cohort"] == COHORT_COMMUNITY]
    community_reasons: Counter = Counter(r.get("cohort_reason") for r in community_rows)
    print(f"\nCommunity: {len(community_rows):,} total")
    for reason, cnt in community_reasons.most_common(12):
        print(f"  {reason}: {cnt:,}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Per-TA career-structure cohort classification (v2)"
    )
    parser.add_argument("--ta", type=str, required=True, metavar="SLUG",
                        help="Therapeutic area slug (required), e.g. atopic-dermatitis")
    parser.add_argument(
        "--cohort",
        type=str,
        default=None,
        choices=sorted(VALID_COHORTS),
        help="Only upsert rows for this cohort (classification still computed for all)",
    )
    parser.add_argument(
        "--threshold-version",
        type=str,
        default=None,
        help="Threshold version label stored on every row (default: v1_<today>)",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--execute", action="store_true")
    args = parser.parse_args()

    dry_run = bool(args.dry_run)
    today_str = date.today().isoformat()
    threshold_version = args.threshold_version or f"v1_{today_str}"
    current_year = datetime.now(timezone.utc).year
    classification_run_id = str(uuid.uuid4())
    classified_at = datetime.now(timezone.utc).isoformat()

    load_dotenv()
    client = sb()

    ta_id, ta_name = resolve_ta_slug(client, args.ta)
    print(f"Resolved TA: {ta_name} (slug={args.ta}, ta_id={ta_id})")
    print(f"classification_run_id={classification_run_id}")
    print(f"threshold_version={threshold_version}")
    print(f"current_year={current_year}")
    print(f"mode={'dry_run' if dry_run else 'execute'}")
    if args.cohort:
        print(f"write_filter cohort={args.cohort}")

    hcp_tas = fetch_hcp_tas_for_ta(client, ta_id)
    ta_hcp_ids = {str(r["hcp_id"]) for r in hcp_tas if r.get("hcp_id")}
    print(f"Loaded {len(hcp_tas):,} hcp_therapeutic_areas_v2 rows ({len(ta_hcp_ids):,} distinct HCPs)")

    hcp_by_id = fetch_hcps_by_ids(client, ta_hcp_ids)
    missing = ta_hcp_ids - set(hcp_by_id.keys())
    if missing:
        print(f"[WARN] {len(missing)} TA HCP ids not found in hcps_v2")

    print("Loading TA-specific publication counts ...")
    ta_pubs_by_hcp = fetch_ta_pubs_by_hcp(client, ta_id, ta_hcp_ids)
    with_ta_pubs = sum(1 for v in ta_pubs_by_hcp.values() if v > 0)
    print(
        f"TA pubs loaded: {with_ta_pubs:,}/{len(ta_hcp_ids):,} HCPs have >=1 TA-tagged pub "
        f"(min for established={TA_ESTABLISHED_MIN_PUBS}, rising={TA_RISING_MIN_PUBS})"
    )

    classified: List[Dict[str, Any]] = []
    for rel in hcp_tas:
        hcp_id = str(rel.get("hcp_id") or "")
        if not hcp_id or hcp_id not in hcp_by_id:
            continue
        h = hcp_by_id[hcp_id]
        result = classify_hcp(
            raw_fpy=h.get("career_first_pub_year_v2"),
            pubs_raw=h.get("total_career_pubs"),
            current_year=current_year,
            ta_pubs=ta_pubs_by_hcp.get(hcp_id, 0),
        )
        classified.append(
            {
                "hcp_id": hcp_id,
                "therapeutic_area_id": ta_id,
                "cohort": result.cohort,
                "cohort_reason": result.cohort_reason,
                "career_first_pub_year_v2": result.career_first_pub_year_v2,
                "total_career_pubs": result.total_career_pubs,
                "career_age": result.career_age,
                "ta_pubs": result.ta_pubs,
                "tier_inputs": result.tier_inputs,
                "threshold_version": threshold_version,
                "classified_at": classified_at,
                "classification_run_id": classification_run_id,
                "first_name": h.get("first_name"),
                "last_name": h.get("last_name"),
            }
        )

    print_dry_run_report(classified, ta_name, ta_id)

    rows_to_write = classified
    if args.cohort:
        rows_to_write = [r for r in classified if r["cohort"] == args.cohort]
        print(f"\n--cohort {args.cohort}: {len(rows_to_write):,} rows selected for write")

    write_payload = [
        {
            "hcp_id": r["hcp_id"],
            "therapeutic_area_id": r["therapeutic_area_id"],
            "cohort": r["cohort"],
            "cohort_reason": r["cohort_reason"],
            "career_first_pub_year_v2": r["career_first_pub_year_v2"],
            "total_career_pubs": r["total_career_pubs"],
            "career_age": r["career_age"],
            "tier_inputs": r["tier_inputs"],
            "threshold_version": r["threshold_version"],
            "classified_at": r["classified_at"],
            "classification_run_id": r["classification_run_id"],
        }
        for r in rows_to_write
    ]

    if dry_run:
        print(f"\n[DRY RUN] Would upsert {len(write_payload):,} rows into hcp_cohort_classification_v2")
        print("[DRY RUN] No database writes performed.")
    else:
        print(f"\nUpserting {len(write_payload):,} rows into hcp_cohort_classification_v2 ...")
        written = upsert_classifications(client, write_payload, ta_id, dry_run=False)
        print(f"Upserted {written:,} rows into hcp_cohort_classification_v2")


if __name__ == "__main__":
    main()
