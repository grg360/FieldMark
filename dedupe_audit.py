from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher
from itertools import combinations
from typing import Dict, List, Optional, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

OUTPUT_FILE = "dedupe_audit_output_v2.json"
PAGE_SIZE = 1000
SIMILARITY_THRESHOLD = 0.80

COMMON_ASIAN_NAMES = {
    "li",
    "wang",
    "zhang",
    "liu",
    "chen",
    "yang",
    "wu",
    "xu",
    "zhao",
    "huang",
    "lin",
    "sun",
    "zhou",
    "guo",
    "he",
}

INSTITUTION_ALIASES = {
    "kings college london": [
        "king's college london",
        "kings college london",
        "kcl",
    ],
    "ap-hp": [
        "ap-hp",
        "ap hp",
        "aphp",
        "assistance publique hopitaux de paris",
        "assistance publique - hopitaux de paris",
        "assistance publique hôpitaux de paris",
        "centre hospitalier universitaire de bicetre",
        "centre hospitalier universitaire de bicêtre",
        "hopital de bicetre",
        "hôpital de bicêtre",
        "hopitaux universitaires paris-saclay",
        "hôpitaux universitaires paris-saclay",
    ],
    "ucsd": [
        "ucsd",
        "uc san diego",
        "university of california san diego",
        "university of california at san diego",
        "university of california, san diego",
    ],
    "ucsf": [
        "ucsf",
        "uc san francisco",
        "university of california san francisco",
        "university of california at san francisco",
        "university of california, san francisco",
    ],
    "ucla": [
        "ucla",
        "university of california los angeles",
        "university of california at los angeles",
        "university of california, los angeles",
    ],
    "mgh": [
        "mgh",
        "massachusetts general hospital",
        "mass general",
        "mass general hospital",
    ],
    "msk": [
        "msk",
        "mskcc",
        "memorial sloan kettering",
        "memorial sloan-kettering",
        "memorial sloan kettering cancer center",
        "memorial sloan-kettering cancer center",
    ],
    "mdacc": [
        "md anderson",
        "m.d. anderson",
        "md anderson cancer center",
        "m.d. anderson cancer center",
        "university of texas md anderson",
        "university of texas m.d. anderson",
        "ut md anderson",
    ],
    "mayo": [
        "mayo clinic",
        "mayo medical center",
        "mayo clinic college of medicine",
    ],
    "karolinska": [
        "karolinska institute",
        "karolinska institutet",
        "karolinska university hospital",
        "karolinska",
    ],
    "chop": [
        "chop",
        "children's hospital of philadelphia",
        "childrens hospital of philadelphia",
    ],
    "dana farber": [
        "dana farber",
        "dana-farber",
        "dana farber cancer institute",
        "dana-farber cancer institute",
        "dfci",
    ],
    "hopkins": [
        "johns hopkins",
        "johns hopkins hospital",
        "johns hopkins university school of medicine",
        "johns hopkins medicine",
    ],
    "penn": [
        "university of pennsylvania",
        "perelman school of medicine",
        "penn medicine",
        "hospital of the university of pennsylvania",
        "huppm",
    ],
    "cleveland clinic": [
        "cleveland clinic",
        "cleveland clinic foundation",
        "cleveland clinic lerner college of medicine",
    ],
    "stanford": [
        "stanford university",
        "stanford medicine",
        "stanford university school of medicine",
        "stanford university medical center",
    ],
    "fred hutch": [
        "fred hutch",
        "fred hutchinson",
        "fred hutchinson cancer center",
        "fred hutchinson cancer research center",
    ],
    "sun yat-sen": [
        "sun yat-sen university",
        "sun yat sen university",
        "sun yat-sen university cancer center",
    ],
    "peking university": [
        "peking university",
        "peking university health science center",
        "peking university first hospital",
    ],
    "shanghai jiao tong": [
        "shanghai jiao tong university",
        "shanghai jiaotong university",
        "shanghai jiao tong university school of medicine",
    ],
    "tsinghua": [
        "tsinghua university",
        "tsinghua university school of medicine",
    ],
    "oxford": [
        "university of oxford",
        "oxford university",
        "oxford university hospitals",
        "john radcliffe hospital",
    ],
    "cambridge": [
        "university of cambridge",
        "cambridge university",
        "cambridge university hospitals",
        "addenbrooke's hospital",
    ],
    "imperial": [
        "imperial college london",
        "imperial college",
        "imperial college healthcare",
    ],
    "edinburgh": [
        "university of edinburgh",
        "edinburgh university",
    ],
    "queen mary london": [
        "queen mary university london",
        "queen mary university of london",
        "queen mary, university of london",
        "qmul",
    ],
    "paris-saclay": [
        "paris-saclay",
        "universite paris-saclay",
        "université paris-saclay",
    ],
    "aphp-bicetre": [],
}


@dataclass
class GroupClassification:
    category: str
    reasons: List[str]


def env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing env var: {name}")
    return value


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


def ns(value: Optional[str]) -> str:
    return " ".join(str(value or "").strip().split())


def nk(value: Optional[str]) -> str:
    return "".join(c for c in ns(value).lower() if c.isalnum() or c.isspace()).strip()


def normalized_name_key(value: Optional[str]) -> str:
    return nk(value)


def normalized_state_bucket(value: Optional[str]) -> str:
    clean = ns(value).upper()
    if not clean:
        return "_NULL_STATE_"
    return clean


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def normalize_country(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = str(value).strip().rstrip(".").strip()
    if "electronic address:" in v.lower():
        v = v.lower().split("electronic address:")[0].strip()
    v = re.sub(r"\S+@\S+", "", v).strip()
    v = v.rstrip(".").strip()
    if not v:
        return None

    v_lower = v.lower()
    aliases = {
        "usa": "usa",
        "us": "usa",
        "united states": "usa",
        "united states of america": "usa",
        "u.s.a.": "usa",
        "u.s.": "usa",
        "america": "usa",
        "uk": "uk",
        "united kingdom": "uk",
        "u.k.": "uk",
        "great britain": "uk",
        "england": "uk",
        "china": "china",
        "people's republic of china": "china",
        "pr china": "china",
        "p.r. china": "china",
        "prc": "china",
        "mainland china": "china",
        "republic of korea": "south korea",
        "south korea": "south korea",
        "korea": "south korea",
        "the netherlands": "netherlands",
        "netherlands": "netherlands",
        "holland": "netherlands",
        "germany": "germany",
        "deutschland": "germany",
        "france": "france",
        "spain": "spain",
        "españa": "spain",
        "italy": "italy",
        "italia": "italy",
        "japan": "japan",
        "taiwan": "taiwan",
        "singapore": "singapore",
        "iran": "iran",
        "islamic republic of iran": "iran",
        "pakistan": "pakistan",
        "india": "india",
        "canada": "canada",
        "australia": "australia",
        "denmark": "denmark",
        "sweden": "sweden",
        "norway": "norway",
        "finland": "finland",
        "ireland": "ireland",
        "switzerland": "switzerland",
        "belgium": "belgium",
        "austria": "austria",
        "turkey": "turkey",
        "türkiye": "turkey",
        "brazil": "brazil",
        "brasil": "brazil",
        "mexico": "mexico",
        "argentina": "argentina",
        "chile": "chile",
    }
    return aliases.get(v_lower, v_lower)


def institution_canonical(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = ns(value).lower().strip()
    if not v:
        return None
    for canonical, aliases in INSTITUTION_ALIASES.items():
        for alias in aliases:
            if alias in v or v in alias:
                return canonical
    return v


def fetch_hcps(client: Client) -> List[Dict]:
    rows: List[Dict] = []
    offset = 0
    while True:
        batch = (
            client.table("hcps")
            .select(
                "id,first_name,last_name,state,country,city,institution_short,institution_full,"
                "npi_number,total_career_pubs,first_pub_year,created_at,updated_at"
            )
            .order("id")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def fetch_publications_by_hcp(client: Client, hcp_ids: List[str]) -> Dict[str, Set[str]]:
    mapping: Dict[str, Set[str]] = defaultdict(set)
    if not hcp_ids:
        return mapping
    for i in range(0, len(hcp_ids), 200):
        chunk = hcp_ids[i : i + 200]
        offset = 0
        while True:
            batch = (
                client.table("publications")
                .select("hcp_id,pubmed_id")
                .in_("hcp_id", chunk)
                .range(offset, offset + PAGE_SIZE - 1)
                .execute()
                .data
                or []
            )
            if not batch:
                break
            for row in batch:
                hcp_id = row.get("hcp_id")
                pmid = ns(row.get("pubmed_id"))
                if hcp_id and pmid:
                    mapping[str(hcp_id)].add(pmid)
            if len(batch) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
    return mapping


def institution_similar(rows: List[Dict]) -> bool:
    institutions = [
        institution_canonical(r.get("institution_short"))
        for r in rows
        if institution_canonical(r.get("institution_short"))
    ]
    if len(institutions) < 2:
        return False
    for a, b in combinations(institutions, 2):
        if a == b:
            continue
        if similarity(a, b) < SIMILARITY_THRESHOLD:
            return False
    return True


def publication_overlap(rows: List[Dict], pub_map: Dict[str, Set[str]]) -> bool:
    ids = [str(r["id"]) for r in rows]
    for a, b in combinations(ids, 2):
        if pub_map.get(a) and pub_map.get(b) and (pub_map[a] & pub_map[b]):
            return True
    return False


def common_name_pattern(first_name: str, last_name: str, group_size: int) -> bool:
    fn = nk(first_name)
    ln = nk(last_name)
    short_name = len(fn) <= 4 and len(ln) <= 4
    asian_common = fn in COMMON_ASIAN_NAMES or ln in COMMON_ASIAN_NAMES
    return group_size >= 3 and (short_name or asian_common)


def compute_consensus(values: List[Optional[str]]) -> Tuple[str, Optional[str]]:
    """
    Returns (consensus_status, consensus_value).
    consensus_status: "single" / "majority" / "conflict" / "absent"
    consensus_value: the agreed value, or None
    """
    non_null = [ns(v) for v in values if ns(v)]
    if not non_null:
        return ("absent", None)

    counts = Counter(non_null)
    most_common_value, most_common_count = counts.most_common(1)[0]

    if len(counts) == 1:
        return ("single", most_common_value)

    if (most_common_count / len(non_null)) >= 0.9:
        return ("majority", most_common_value)

    return ("conflict", None)


def classify_group(first_name: str, last_name: str, rows: List[Dict], pub_map: Dict[str, Set[str]]) -> GroupClassification:
    reasons: List[str] = []
    group_size = len(rows)

    has_any_npi = any(ns(r.get("npi_number")) for r in rows)
    inst_sim = institution_similar(rows)
    pub_ov = publication_overlap(rows, pub_map)
    strong_signal = has_any_npi or inst_sim or pub_ov

    state_status, state_value = compute_consensus([r.get("state") for r in rows])
    country_status, country_value_raw = compute_consensus([normalize_country(r.get("country")) for r in rows])
    country_value = ns(country_value_raw).lower() if country_value_raw else None

    if state_status == "single" and state_value:
        reasons.append(f"state_single_value_{state_value}")
    elif state_status == "majority" and state_value:
        reasons.append(f"state_majority_consensus_{state_value}")
    elif state_status == "conflict":
        reasons.append("state_genuine_conflict")
    else:
        reasons.append("state_absent")

    if country_status == "single" and country_value:
        reasons.append(f"country_single_value_{country_value.upper()}")
    elif country_status == "majority" and country_value:
        reasons.append(f"country_majority_consensus_{country_value.upper()}")
    elif country_status == "conflict":
        reasons.append("country_genuine_conflict")
    else:
        reasons.append("country_absent_assumed_usa")

    if has_any_npi:
        reasons.append("has_npi_signal")
    if inst_sim:
        reasons.append("institution_high_similarity")
    if pub_ov:
        reasons.append("publication_overlap")

    state_ok = state_status in ("single", "majority")
    country_ok = country_status in ("single", "majority", "absent")
    country_usa_or_absent = country_value == "usa" or country_value is None

    countries_non_null = {
        normalize_country(r.get("country"))
        for r in rows
        if normalize_country(r.get("country"))
    }
    contradictory_country = ("usa" in countries_non_null) and any(
        c != "usa" for c in countries_non_null
    )

    # Category A
    a_state_present_path = state_ok and strong_signal
    a_state_absent_path = (
        state_status == "absent"
        and pub_ov
        and (inst_sim or has_any_npi)
    )
    if country_ok and country_usa_or_absent and (a_state_present_path or a_state_absent_path):
        a_reasons = list(reasons)
        if a_state_absent_path:
            if pub_ov and inst_sim:
                a_reasons.append("state_absent_pub_overlap_with_inst_similarity")
            if pub_ov and has_any_npi:
                a_reasons.append("state_absent_pub_overlap_with_npi")
            a_reasons.append("state_absent_with_strong_signal")
        return GroupClassification("safe_auto_merge", a_reasons)

    # Category D
    if state_status == "conflict" and (not inst_sim) and (not pub_ov):
        d_reasons = list(reasons) + ["state_conflict_without_shared_institution_or_publication"]
        return GroupClassification("do_not_merge", d_reasons)
    if contradictory_country and (not strong_signal):
        d_reasons = list(reasons) + ["country_contradiction_without_shared_signals"]
        return GroupClassification("do_not_merge", d_reasons)

    # Category C
    if state_status == "absent" and group_size >= 10 and (not strong_signal):
        c_reasons = list(reasons) + ["state_absent_large_group_without_strong_signals"]
        return GroupClassification("needs_manual_review", c_reasons)
    if group_size >= 50 and (not strong_signal):
        c_reasons = list(reasons) + ["very_large_group_without_strong_signals"]
        return GroupClassification("needs_manual_review", c_reasons)
    if common_name_pattern(first_name, last_name, group_size):
        c_reasons = list(reasons) + ["common_name_pattern"]
        return GroupClassification("needs_manual_review", c_reasons)

    # Category B
    b_state_present_path = state_ok and (not strong_signal)
    b_state_absent_path = (
        state_status == "absent"
        and (pub_ov or inst_sim or has_any_npi)
        and country_usa_or_absent
    )
    if country_ok and (b_state_present_path or b_state_absent_path):
        b_reasons = list(reasons)
        if b_state_absent_path:
            b_reasons.append("state_absent_with_strong_signal")
        else:
            b_reasons.append("no_strong_signal_but_no_contradiction")
        return GroupClassification("likely_safe_needs_check", b_reasons)

    # Fallback decision tree (no generic fallback_review)
    if state_status in ("single", "majority") and country_ok:
        return GroupClassification("likely_safe_needs_check", list(reasons) + ["fallback_to_b_minimal_signals"])

    if (
        state_status == "absent"
        and country_status in ("single", "majority")
        and (pub_ov or inst_sim or has_any_npi)
    ):
        return GroupClassification("likely_safe_needs_check", list(reasons) + ["fallback_to_b_no_state_with_signal"])

    if (
        state_status == "absent"
        and country_status in ("single", "majority")
        and not (pub_ov or inst_sim or has_any_npi)
    ):
        return GroupClassification("needs_manual_review", list(reasons) + ["no_disambiguating_signals"])

    if state_status == "conflict" or country_status == "conflict":
        return GroupClassification("needs_manual_review", list(reasons) + ["value_conflict_present"])

    return GroupClassification("needs_manual_review", list(reasons) + ["insufficient_data_for_classification"])


def main() -> None:
    load_dotenv()
    client = sb()
    hcps = fetch_hcps(client)
    total_hcps = len(hcps)

    by_name_state: Dict[Tuple[str, str, str], List[Dict]] = defaultdict(list)
    display_name_by_key: Dict[Tuple[str, str], Tuple[str, str]] = {}
    states_seen_by_name: Dict[Tuple[str, str], Set[str]] = defaultdict(set)

    for row in hcps:
        first_name = ns(row.get("first_name"))
        last_name = ns(row.get("last_name"))
        if first_name and last_name:
            first_key = normalized_name_key(first_name)
            last_key = normalized_name_key(last_name)
            if not first_key or not last_key:
                continue
            state_bucket = normalized_state_bucket(row.get("state"))
            by_name_state[(first_key, last_key, state_bucket)].append(row)
            states_seen_by_name[(first_key, last_key)].add(state_bucket)
            if (first_key, last_key) not in display_name_by_key:
                display_name_by_key[(first_key, last_key)] = (first_name, last_name)

    dup_groups = {k: v for k, v in by_name_state.items() if len(v) > 1}
    dup_hcp_ids = [str(r["id"]) for rows in dup_groups.values() for r in rows]
    pub_map = fetch_publications_by_hcp(client, dup_hcp_ids)

    categories = {
        "safe_auto_merge": [],
        "likely_safe_needs_check": [],
        "needs_manual_review": [],
        "do_not_merge": [],
    }

    for (first_key, last_key, state_bucket), rows in dup_groups.items():
        display_first, display_last = display_name_by_key.get((first_key, last_key), ("", ""))
        cls = classify_group(display_first, display_last, rows, pub_map)
        categories[cls.category].append(
            {
                "group_key": {
                    "first_name": display_first,
                    "last_name": display_last,
                    "state_bucket": state_bucket,
                },
                "group_size": len(rows),
                "reasons": cls.reasons,
                "rows": rows,
            }
        )

    cross_state_clusters: List[Dict] = []
    for (first_key, last_key), states in states_seen_by_name.items():
        if len(states) < 2:
            continue
        display_first, display_last = display_name_by_key.get((first_key, last_key), ("", ""))
        state_bucket_counts: Dict[str, int] = {}
        for st in sorted(states):
            state_bucket_counts[st] = len(by_name_state.get((first_key, last_key, st), []))
        cross_state_clusters.append(
            {
                "first_name": display_first,
                "last_name": display_last,
                "state_buckets": sorted(states),
                "state_bucket_counts": state_bucket_counts,
                "warning": "cross_state_same_name",
            }
        )
    cross_state_clusters.sort(
        key=lambda x: sum(x.get("state_bucket_counts", {}).values()),
        reverse=True,
    )

    def rows_to_merge(groups: List[Dict]) -> int:
        return sum(max(0, g["group_size"] - 1) for g in groups)

    a_groups = categories["safe_auto_merge"]
    b_groups = categories["likely_safe_needs_check"]
    c_groups = categories["needs_manual_review"]
    d_groups = categories["do_not_merge"]

    a_merge_rows = rows_to_merge(a_groups)
    b_merge_rows = rows_to_merge(b_groups)
    c_rows = sum(g["group_size"] for g in c_groups)
    d_rows = sum(g["group_size"] for g in d_groups)

    post_a = total_hcps - a_merge_rows
    post_ab = total_hcps - (a_merge_rows + b_merge_rows)

    print("=== Dedupe Audit Summary ===")
    print(f"Category A (safe_auto_merge): {len(a_groups)} groups, {a_merge_rows} rows would merge")
    print(f"Category B (likely_safe_needs_check): {len(b_groups)} groups, {b_merge_rows} rows would merge")
    print(f"Category C (needs_manual_review): {len(c_groups)} groups, {c_rows} rows need review")
    print(f"Category D (do_not_merge): {len(d_groups)} groups, {d_rows} rows would NOT merge")
    print(f"Total rows currently in hcps: {total_hcps}")
    print(f"Total rows after auto-merge of A only: {post_a}")
    print(f"Total rows after auto-merge of A + B: {post_ab}")

    print("\n=== Sample Groups (5 each category) ===")
    for cat in ("safe_auto_merge", "likely_safe_needs_check", "needs_manual_review", "do_not_merge"):
        print(f"\n-- {cat} --")
        samples = sorted(categories[cat], key=lambda x: x["group_size"], reverse=True)[:5]
        for sample in samples:
            print(
                json.dumps(
                    {
                        "group_key": sample["group_key"],
                        "group_size": sample["group_size"],
                        "reasons": sample["reasons"],
                        "rows": sample["rows"],
                    },
                    ensure_ascii=False,
                )
            )

    output_payload = {
        "summary": {
            "total_hcps": total_hcps,
            "category_a_groups": len(a_groups),
            "category_a_rows_to_merge": a_merge_rows,
            "category_b_groups": len(b_groups),
            "category_b_rows_to_merge": b_merge_rows,
            "category_c_groups": len(c_groups),
            "category_c_rows_review": c_rows,
            "category_d_groups": len(d_groups),
            "category_d_rows_not_merge": d_rows,
            "post_rows_after_a_only": post_a,
            "post_rows_after_a_b": post_ab,
            "cross_state_cluster_count": len(cross_state_clusters),
        },
        "groups_by_category": categories,
        "cross_state_clusters": cross_state_clusters,
        "category_counts": {k: len(v) for k, v in categories.items()},
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, ensure_ascii=False, indent=2)
    print(f"\nWrote full classification output to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
