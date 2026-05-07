from __future__ import annotations

import os
import re
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

HCP_PAGE_SIZE = 1000
UPSERT_BATCH_SIZE = 500
PROFILE_VERSION = "v1.1"

CLINICAL_KEYWORDS = [
    "Department of Medicine",
    "Department of Internal Medicine",
    "Department of Pediatrics",
    "Department of Surgery",
    "Department of Family Medicine",
    "Department of Obstetrics",
    "Department of Gynecology",
    "Department of Neurology",
    "Department of Psychiatry",
    "Department of Radiology",
    "Department of Pathology",
    "Department of Anesthesiology",
    "Department of Emergency Medicine",
    "Department of Dermatology",
    "Department of Ophthalmology",
    "Department of Urology",
    "Department of Cardiology",
    "Division of Gastroenterology",
    "Division of Hepatology",
    "Division of Oncology",
    "Division of Cardiology",
    "Division of Pulmonary",
    "Division of Nephrology",
    "Division of Endocrinology",
    "Division of Rheumatology",
    "Division of Infectious",
    "Division of Hematology",
    "Division of Pediatric",
    "Children's Hospital",
    "Medical Center",
    "Cancer Center",
    "Cancer Institute",
    "Hospital",
    "Clinic",
    "Health System",
]

RESEARCH_KEYWORDS = [
    "Department of Cell Biology",
    "Department of Biochemistry",
    "Department of Molecular",
    "Department of Genetics",
    "Department of Pharmacology",
    "Department of Physiology",
    "Department of Immunology",
    "Department of Microbiology",
    "Department of Bioinformatics",
    "Department of Computational",
    "Institute for",
    "Laboratory of",
    "Laboratory for",
    "Center for Computational",
    "Center for Genomic",
    "Center for Bioinformatic",
    "Center for Systems Biology",
    "Research Institute",
    "School of Public Health",
    "School of Pharmacy",
]

INDUSTRY_KEYWORDS = [
    "Pfizer",
    "Merck",
    "Novartis",
    "Roche",
    "Genentech",
    "AstraZeneca",
    "Sanofi",
    "GlaxoSmithKline",
    "GSK",
    "Bristol Myers Squibb",
    "Bristol-Myers",
    "Eli Lilly",
    "Lilly and Company",
    "Johnson & Johnson",
    "Janssen",
    "AbbVie",
    "Gilead Sciences",
    "Amgen",
    "Regeneron",
    "Vertex Pharmaceuticals",
    "Madrigal Pharmaceuticals",
    "Ionis Pharmaceuticals",
    "Moderna",
    "BioNTech",
    "Bayer",
    "Boehringer Ingelheim",
    "Takeda",
    "Astellas",
    "Daiichi Sankyo",
    "Otsuka",
    "Eisai",
    "Medicine Design",
    "Worldwide Research",
    "Pharmaceutical Research and Development",
    "Drug Discovery",
    "Clinical Pharmacology and Pharmacometrics",
]

MAJOR_PHARMA_NAMES = {
    "Pfizer",
    "Merck",
    "Novartis",
    "Roche",
    "Genentech",
    "AstraZeneca",
    "Sanofi",
    "GlaxoSmithKline",
    "GSK",
    "Bristol Myers Squibb",
    "Bristol-Myers",
    "Eli Lilly",
    "Lilly and Company",
    "Johnson & Johnson",
    "Janssen",
    "AbbVie",
    "Gilead Sciences",
    "Amgen",
    "Regeneron",
    "Vertex Pharmaceuticals",
    "Madrigal Pharmaceuticals",
    "Ionis Pharmaceuticals",
    "Moderna",
    "BioNTech",
    "Bayer",
    "Boehringer Ingelheim",
    "Takeda",
    "Astellas",
    "Daiichi Sankyo",
    "Otsuka",
    "Eisai",
    "Medicine Design",
    "Worldwide Research",
    "Pharmaceutical Research and Development",
    "Drug Discovery",
    "Clinical Pharmacology and Pharmacometrics",
}


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    supabase_url = get_required_env("SUPABASE_URL")
    supabase_key = get_required_env("SUPABASE_KEY")
    return create_client(supabase_url, supabase_key)


def ns(value: Optional[str]) -> str:
    return " ".join(str(value or "").strip().split())


def simple_first_last(name: str) -> Tuple[str, str]:
    cleaned = ns(name)
    if not cleaned:
        return "", ""
    tokens = re.split(r"\s+", cleaned)
    if len(tokens) == 1:
        single = tokens[0].lower()
        return single, single
    return tokens[0].lower(), tokens[-1].lower()


def hcp_name_parts(hcp_first_name: Optional[str], hcp_last_name: Optional[str]) -> Tuple[str, str]:
    first_raw = ns(hcp_first_name)
    last_raw = ns(hcp_last_name)
    first = first_raw.split()[0].lower() if first_raw else ""
    last = last_raw.split()[-1].lower() if last_raw else ""
    return first, last


def authorship_matches_hcp(authorship: Dict[str, Any], hcp_first: str, hcp_last: str) -> bool:
    author_obj = authorship.get("author") or {}
    display_name = ns(author_obj.get("display_name"))
    raw_author_name = ns(authorship.get("raw_author_name"))
    candidate_names = [n for n in [display_name, raw_author_name] if n]
    for candidate in candidate_names:
        c_first, c_last = simple_first_last(candidate)
        if c_first == hcp_first and c_last == hcp_last:
            return True
    return False


def count_keyword_hits(strings: Sequence[str], keywords: Sequence[str]) -> int:
    lowered_strings = [s.lower() for s in strings if ns(s)]
    hits = 0
    for s in lowered_strings:
        for kw in keywords:
            if kw.lower() in s:
                hits += 1
    return hits


def find_industry_keywords(strings: Sequence[str]) -> List[str]:
    lowered_strings = [s.lower() for s in strings if ns(s)]
    matched = set()
    for kw in INDUSTRY_KEYWORDS:
        kw_l = kw.lower()
        if any(kw_l in s for s in lowered_strings):
            matched.add(kw)
    return sorted(matched)


def fetch_pending_hcp_count(supabase: Client) -> int:
    response = (
        supabase.table("hcps")
        .select("id", count="exact")
        .is_("affiliation_profile_calculated_at", "null")
        .limit(1)
        .execute()
    )
    return int(response.count or 0)


def fetch_hcp_page(supabase: Client, offset: int, limit: int) -> List[Dict[str, Any]]:
    response = (
        supabase.table("hcps")
        .select("id,first_name,last_name")
        .is_("affiliation_profile_calculated_at", "null")
        .order("id")
        .range(offset, offset + limit - 1)
        .execute()
    )
    return response.data or []


def fetch_publications_for_hcps(supabase: Client, hcp_ids: Sequence[str]) -> List[Dict[str, Any]]:
    if not hcp_ids:
        return []
    out: List[Dict[str, Any]] = []
    chunk_size = 100
    hcp_id_list = list(hcp_ids)
    for start in range(0, len(hcp_id_list), chunk_size):
        chunk = hcp_id_list[start : start + chunk_size]
        response = (
            supabase.table("publications")
            .select("id,hcp_id,authorships")
            .in_("hcp_id", chunk)
            .not_.is_("authorships", "null")
            .execute()
        )
        out.extend(response.data or [])
    return out


def classify_from_publications(publications: Sequence[Dict[str, Any]], hcp_first: str, hcp_last: str) -> Tuple[Dict[str, Any], Optional[float], str]:
    publications_examined = len(publications)
    publications_matched = 0

    institution_type_counts: Counter = Counter()
    clinical_signal_count = 0
    research_signal_count = 0
    industry_signal_count = 0
    any_company_institution = False
    industry_keyword_set = set()

    # Bug 1 fix: ONLY signals from the matched authorship entry.
    for pub in publications:
        authorships = pub.get("authorships")
        if not isinstance(authorships, list):
            continue

        matched_entries = [
            a
            for a in authorships
            if isinstance(a, dict) and authorship_matches_hcp(a, hcp_first, hcp_last)
        ]

        # Ambiguous duplicate same-name authorship in one publication -> skip
        if len(matched_entries) != 1:
            continue

        publications_matched += 1
        matched = matched_entries[0]

        institutions = matched.get("institutions")
        if isinstance(institutions, list):
            for inst in institutions:
                if not isinstance(inst, dict):
                    continue
                inst_type = ns(inst.get("type")).lower()
                if not inst_type:
                    continue
                institution_type_counts[inst_type] += 1
                if inst_type == "company":
                    any_company_institution = True

        raw_aff = matched.get("raw_affiliation_strings")
        raw_strings = [ns(x) for x in raw_aff] if isinstance(raw_aff, list) else []
        raw_strings = [x for x in raw_strings if x]

        clin_hits = count_keyword_hits(raw_strings, CLINICAL_KEYWORDS)
        res_hits = count_keyword_hits(raw_strings, RESEARCH_KEYWORDS)
        ind_hits = count_keyword_hits(raw_strings, INDUSTRY_KEYWORDS)

        clinical_signal_count += clin_hits
        research_signal_count += res_hits
        industry_signal_count += ind_hits

        for kw in find_industry_keywords(raw_strings):
            industry_keyword_set.add(kw)

    company_institution_count = int(institution_type_counts.get("company", 0))
    total_institution_count = int(sum(institution_type_counts.values()))
    company_share = (company_institution_count / total_institution_count) if total_institution_count > 0 else 0.0

    total_signals = clinical_signal_count + research_signal_count + industry_signal_count
    industry_share = (industry_signal_count / total_signals) if total_signals > 0 else 0.0
    major_pharma_match = any(kw in MAJOR_PHARMA_NAMES for kw in industry_keyword_set)

    is_industry = (
        (major_pharma_match and publications_matched >= 1)
        or (company_institution_count >= 2 and company_share >= 0.30)
        or (industry_signal_count >= 3 and industry_share >= 0.30)
    )

    if is_industry:
        classification = "industry"
        clinician_score: Optional[float] = 0.0
    elif (clinical_signal_count + research_signal_count) == 0:
        classification = "insufficient_data"
        clinician_score = None
    else:
        ratio = clinical_signal_count / (clinical_signal_count + research_signal_count)
        clinician_score = round(ratio, 4)
        if ratio >= 0.7:
            classification = "clinician"
        elif ratio <= 0.3:
            classification = "researcher"
        else:
            classification = "mixed"

    profile = {
        "publications_examined": publications_examined,
        "publications_matched": publications_matched,
        "institution_type_counts": dict(institution_type_counts),
        "clinical_signal_count": clinical_signal_count,
        "research_signal_count": research_signal_count,
        "industry_signal_count": industry_signal_count,
        "any_company_institution": any_company_institution,
        "company_institution_count": company_institution_count,
        "total_institution_count": total_institution_count,
        "company_share": round(company_share, 4),
        "industry_share": round(industry_share, 4),
        "industry_keywords_matched": sorted(industry_keyword_set),
        "version": PROFILE_VERSION,
    }
    return profile, clinician_score, classification


def bulk_upsert_hcp_profiles(supabase: Client, updates: Sequence[Dict[str, Any]]) -> None:
    if not updates:
        return
    for start in range(0, len(updates), UPSERT_BATCH_SIZE):
        batch = updates[start : start + UPSERT_BATCH_SIZE]
        failed = 0
        for item in batch:
            try:
                supabase.table("hcps").update(
                    {
                        "affiliation_profile": item["affiliation_profile"],
                        "clinician_score": item["clinician_score"],
                        "affiliation_classification": item["affiliation_classification"],
                        "affiliation_profile_calculated_at": item["affiliation_profile_calculated_at"],
                    }
                ).eq("id", item["id"]).execute()
            except Exception as exc:
                failed += 1
                print(f"Warning: failed affiliation update for hcp_id={item.get('id')}: {exc}")
        print(f"Batch update progress: {start + len(batch)}/{len(updates)} (failed {failed})")


def main() -> None:
    load_dotenv()
    supabase = init_supabase()
    start_time = time.time()

    total_pending = fetch_pending_hcp_count(supabase)
    skipped_already_classified = 0
    print(f"Loaded {total_pending} pending HCPs (affiliation_profile_calculated_at is null)")

    classification_counts: Counter = Counter()
    processed = 0

    while True:
        hcp_page = fetch_hcp_page(supabase, 0, HCP_PAGE_SIZE)
        if not hcp_page:
            break

        hcp_ids = [str(h["id"]) for h in hcp_page if h.get("id")]
        pubs = fetch_publications_for_hcps(supabase, hcp_ids)

        pubs_by_hcp: Dict[str, List[Dict[str, Any]]] = {}
        for pub in pubs:
            hid = pub.get("hcp_id")
            if not hid:
                continue
            pubs_by_hcp.setdefault(str(hid), []).append(pub)

        updates: List[Dict[str, Any]] = []
        now_iso = datetime.now(timezone.utc).isoformat()

        for hcp in hcp_page:
            hid = hcp.get("id")
            if not hid:
                continue
            hcp_id = str(hid)

            hcp_first, hcp_last = hcp_name_parts(hcp.get("first_name"), hcp.get("last_name"))

            if not hcp_first or not hcp_last:
                profile = {
                    "publications_examined": 0,
                    "publications_matched": 0,
                    "institution_type_counts": {},
                    "clinical_signal_count": 0,
                    "research_signal_count": 0,
                    "industry_signal_count": 0,
                    "any_company_institution": False,
                    "industry_keywords_matched": [],
                    "version": PROFILE_VERSION,
                }
                clinician_score = None
                classification = "insufficient_data"
            else:
                profile, clinician_score, classification = classify_from_publications(
                    pubs_by_hcp.get(hcp_id, []), hcp_first, hcp_last
                )

            classification_counts[classification] += 1
            updates.append(
                {
                    # Include id so upsert resolves on PK and updates existing row.
                    "id": hcp_id,
                    "affiliation_profile": profile,
                    "clinician_score": clinician_score,
                    "affiliation_classification": classification,
                    "affiliation_profile_calculated_at": now_iso,
                }
            )

        bulk_upsert_hcp_profiles(supabase, updates)

        processed += len(hcp_page)
        if processed % 1000 == 0 or processed == total_pending:
            print(
                f"Processed {processed} of total {total_pending} HCPs "
                f"(skipped {skipped_already_classified} already-classified)"
            )

        if len(hcp_page) < HCP_PAGE_SIZE:
            break

    print("\n=== Affiliation classification distribution ===")
    for label in ["clinician", "mixed", "researcher", "industry", "insufficient_data"]:
        print(f"  {label}: {classification_counts.get(label, 0)}")
    print(f"Total runtime: {time.time() - start_time:.1f}s")


if __name__ == "__main__":
    main()
