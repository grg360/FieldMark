import json
from datetime import datetime, timezone

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client
import os


NPPES_CSV_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\npidata_pfile_20050523-20260412.csv"
INDIVIDUALS_PARQUET_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\nppes_individual_providers.parquet"
OUTPUT_JSON_PATH = r"C:\Users\garre\Desktop\FieldMark\nppes_org_dryrun_output.json"
CHUNK_SIZE = 50_000

CANONICALS = [
    {
        "label": "Loomba",
        "hcp_id": "9339ead6-2023-4e69-9eda-2914553a2e20",
        "expected_affiliation": "UC SAN DIEGO",
    },
    {
        "label": "Garassino",
        "hcp_id": "dc645bf0-b7e0-4c3c-9aaf-9e7bc35d6331",
        "expected_affiliation": "UNIVERSITY OF CHICAGO",
    },
    {
        "label": "Chalasani",
        "hcp_id": "6f9dd309-bd67-4260-a9c2-8a22129f988c",
        "expected_affiliation": "INDIANA UNIVERSITY",
    },
]


def _norm_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip().upper()


def _zip5(value: object) -> str:
    return _norm_text(value)[:5]


if __name__ == "__main__":
    load_dotenv()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_KEY in environment")

    client = create_client(supabase_url, supabase_key)

    cohort = []
    for canonical in CANONICALS:
        row = (
            client.table("hcps")
            .select("id,npi_number,first_name,last_name")
            .eq("id", canonical["hcp_id"])
            .limit(1)
            .execute()
            .data
        )
        if row:
            h = row[0]
            cohort.append(
                {
                    "source": "canonical",
                    "label": canonical["label"],
                    "hcp_id": h["id"],
                    "npi": (h.get("npi_number") or "").strip(),
                    "first_name": h.get("first_name"),
                    "last_name": h.get("last_name"),
                    "expected_affiliation": canonical["expected_affiliation"],
                }
            )

    random_rows = (
        client.table("hcps")
        .select("id,npi_number,first_name,last_name")
        .not_.is_("npi_number", "null")
        .order("id")
        .limit(5)
        .execute()
        .data
        or []
    )
    for h in random_rows:
        if not (h.get("npi_number") or "").strip():
            continue
        cohort.append(
            {
                "source": "random_community",
                "label": f"{h.get('first_name') or ''} {h.get('last_name') or ''}".strip() or h["id"],
                "hcp_id": h["id"],
                "npi": (h.get("npi_number") or "").strip(),
                "first_name": h.get("first_name"),
                "last_name": h.get("last_name"),
                "expected_affiliation": None,
            }
        )

    cohort_by_npi = {c["npi"]: c for c in cohort if c.get("npi")}
    cohort_npis = set(cohort_by_npi.keys())

    individuals = pd.read_parquet(INDIVIDUALS_PARQUET_PATH, columns=["npi", "practice_address", "practice_city", "practice_state", "practice_zip"])
    individuals["npi"] = individuals["npi"].astype(str).str.strip()
    individuals = individuals[individuals["npi"].isin(cohort_npis)].copy()

    for _, row in individuals.iterrows():
        npi = str(row["npi"]).strip()
        if npi not in cohort_by_npi:
            continue
        cohort_by_npi[npi]["practice_address"] = row.get("practice_address")
        cohort_by_npi[npi]["practice_city"] = row.get("practice_city")
        cohort_by_npi[npi]["practice_state"] = row.get("practice_state")
        cohort_by_npi[npi]["practice_zip"] = row.get("practice_zip")
        cohort_by_npi[npi]["practice_zip5"] = _zip5(row.get("practice_zip"))
        cohort_by_npi[npi]["practice_city_norm"] = _norm_text(row.get("practice_city"))
        cohort_by_npi[npi]["practice_address_norm"] = _norm_text(row.get("practice_address"))

    cohort = list(cohort_by_npi.values())

    zip5_set = {c.get("practice_zip5", "") for c in cohort if c.get("practice_zip5")}
    city_set = {c.get("practice_city_norm", "") for c in cohort if c.get("practice_city_norm")}

    for c in cohort:
        c["matches"] = []

    usecols = [
        "NPI",
        "Entity Type Code",
        "Provider Organization Name (Legal Business Name)",
        "Provider Other Organization Name",
        "Provider First Line Business Practice Location Address",
        "Provider Business Practice Location Address City Name",
        "Provider Business Practice Location Address State Name",
        "Provider Business Practice Location Address Postal Code",
    ]

    total_type2_scanned = 0
    total_type2_at_cohort_addresses = 0

    reader = pd.read_csv(
        NPPES_CSV_PATH,
        usecols=usecols,
        dtype=str,
        low_memory=False,
        chunksize=CHUNK_SIZE,
    )

    for chunk in reader:
        type2 = chunk[chunk["Entity Type Code"].fillna("").str.strip().eq("2")].copy()
        total_type2_scanned += len(type2)
        if type2.empty:
            continue

        type2["zip5"] = type2["Provider Business Practice Location Address Postal Code"].fillna("").str.strip().str[:5].str.upper()
        type2["city_norm"] = type2["Provider Business Practice Location Address City Name"].fillna("").str.strip().str.upper()
        type2 = type2[type2["zip5"].isin(zip5_set) & type2["city_norm"].isin(city_set)].copy()
        if type2.empty:
            continue

        total_type2_at_cohort_addresses += len(type2)

        for _, org in type2.iterrows():
            org_address = _norm_text(org.get("Provider First Line Business Practice Location Address"))
            org_city = _norm_text(org.get("Provider Business Practice Location Address City Name"))
            org_zip5 = _zip5(org.get("Provider Business Practice Location Address Postal Code"))
            org_addr_tokens = {t for t in org_address.replace(",", " ").split() if len(t) >= 4}

            for c in cohort:
                hcp_zip5 = c.get("practice_zip5", "")
                hcp_city = c.get("practice_city_norm", "")
                hcp_addr = c.get("practice_address_norm", "")

                if not hcp_zip5 or org_zip5 != hcp_zip5:
                    continue

                hcp_addr_tokens = {t for t in hcp_addr.replace(",", " ").split() if len(t) >= 4}
                overlap = len(org_addr_tokens.intersection(hcp_addr_tokens))
                address_substantial_overlap = overlap >= 2
                city_match = org_city == hcp_city and bool(org_city)
                exact_address = bool(hcp_addr) and org_address == hcp_addr

                if exact_address:
                    quality = "exact_address"
                    rank = 3
                elif city_match or address_substantial_overlap:
                    quality = "zip+city"
                    rank = 2
                else:
                    quality = "zip_only"
                    rank = 1

                c["matches"].append(
                    {
                        "org_npi": (org.get("NPI") or "").strip(),
                        "organization_name_legal": org.get("Provider Organization Name (Legal Business Name)"),
                        "organization_name_other": org.get("Provider Other Organization Name"),
                        "practice_address": org.get("Provider First Line Business Practice Location Address"),
                        "practice_city": org.get("Provider Business Practice Location Address City Name"),
                        "practice_state": org.get("Provider Business Practice Location Address State Name"),
                        "practice_zip": org.get("Provider Business Practice Location Address Postal Code"),
                        "match_quality": quality,
                        "rank": rank,
                        "address_token_overlap": overlap,
                    }
                )

    hcp_with_at_least_one = 0
    hcp_with_exact = 0

    output_rows = []
    for c in cohort:
        matches_sorted = sorted(
            c["matches"],
            key=lambda m: (m["rank"], m["address_token_overlap"]),
            reverse=True,
        )
        top5 = matches_sorted[:5]

        if matches_sorted:
            hcp_with_at_least_one += 1
        if any(m["match_quality"] == "exact_address" for m in matches_sorted):
            hcp_with_exact += 1

        header_name = c.get("label") or f"{c.get('first_name', '')} {c.get('last_name', '')}".strip() or c["hcp_id"]
        print(f"=== {header_name} ===")
        print(f"HCP NPI: {c.get('npi') or ''}")
        print(
            "HCP practice address: "
            f"{c.get('practice_address') or ''}, {c.get('practice_city') or ''}, "
            f"{c.get('practice_state') or ''} {c.get('practice_zip') or ''}"
        )
        if c.get("expected_affiliation"):
            print(f"Expected affiliation: {c['expected_affiliation']}")
        print("")
        print("Top 5 matching Type 2 entities:")
        if not top5:
            print("1. [no matches]")
        else:
            idx = 1
            for m in top5:
                org_name = m.get("organization_name_legal") or m.get("organization_name_other") or "[no org name]"
                print(
                    f"{idx}. {org_name} @ "
                    f"{m.get('practice_address') or ''}, {m.get('practice_city') or ''}, "
                    f"{m.get('practice_state') or ''} {m.get('practice_zip') or ''} "
                    f"(match quality: {m['match_quality']})"
                )
                idx += 1
        print("")
        print("Verdict:")
        print("")

        output_rows.append(
            {
                "source": c.get("source"),
                "label": c.get("label"),
                "hcp_id": c.get("hcp_id"),
                "npi": c.get("npi"),
                "first_name": c.get("first_name"),
                "last_name": c.get("last_name"),
                "expected_affiliation": c.get("expected_affiliation"),
                "hcp_practice_address": c.get("practice_address"),
                "hcp_practice_city": c.get("practice_city"),
                "hcp_practice_state": c.get("practice_state"),
                "hcp_practice_zip": c.get("practice_zip"),
                "top_5_matches": top5,
                "match_count_total": len(matches_sorted),
            }
        )

    total_hcps = len(cohort)
    print("=== Summary ===")
    print(f"Total Type 2 entities scanned: {total_type2_scanned}")
    print(f"Total Type 2 entities at cohort addresses: {total_type2_at_cohort_addresses}")
    print(f"HCPs with at least one match: {hcp_with_at_least_one} / {total_hcps}")
    print(f"HCPs with exact address match: {hcp_with_exact} / {total_hcps}")

    output_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "input_paths": {
            "nppes_csv": NPPES_CSV_PATH,
            "individuals_parquet": INDIVIDUALS_PARQUET_PATH,
        },
        "summary": {
            "total_type2_scanned": total_type2_scanned,
            "total_type2_at_cohort_addresses": total_type2_at_cohort_addresses,
            "hcps_with_at_least_one_match": hcp_with_at_least_one,
            "hcps_with_exact_address_match": hcp_with_exact,
            "total_hcps": total_hcps,
        },
        "results": output_rows,
    }

    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, indent=2)

