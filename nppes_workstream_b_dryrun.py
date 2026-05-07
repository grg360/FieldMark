"""
Read-only FieldMark Workstream B dry run: taxonomy-filtered counts from NPPES Parquet.

Does not connect to or write Supabase.

Run manually: python nppes_workstream_b_dryrun.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Set

import pandas as pd

PARQUET_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\nppes_individual_providers.parquet"
OUTPUT_JSON = r"C:\Users\garre\Desktop\FieldMark\workstream_b_dryrun_results.json"

NSCLC_TAXONOMIES: List[str] = [
    "207RH0000X",  # Hematology & Oncology
    "207RX0202X",  # Medical Oncology
]

HEPATOLOGY_TAXONOMIES: List[str] = [
    "207RT0003X",  # Transplant Hepatology
]

RARE_DISEASE_TAXONOMIES: List[str] = [
    "2080N0001X",  # Pediatric Neuromuscular Medicine (DMD/SMA core)
    "2080P0207X",  # Pediatric Hematology-Oncology (sickle cell + peds rare)
    "207RA0401X",  # Allergy & Immunology (HAE)
    "207RM1200X",  # Medical Genetics (lysosomal, metabolic)
]

REQUIRED_COLUMNS = [
    "npi",
    "practice_state",
    "taxonomy_1",
    "taxonomy_2",
    "taxonomy_3",
    "taxonomy_4",
    "taxonomy_5",
    "primary_taxonomy_switch_1",
    "primary_taxonomy_switch_2",
    "primary_taxonomy_switch_3",
    "primary_taxonomy_switch_4",
    "primary_taxonomy_switch_5",
]


def taxonomy_match_mask(df: pd.DataFrame, codes: Set[str]) -> pd.Series:
    m = pd.Series(False, index=df.index)
    for i in range(1, 6):
        col = df[f"taxonomy_{i}"].astype(str).str.strip()
        m |= col.isin(codes)
    return m


def primary_taxonomy_series(df: pd.DataFrame) -> pd.Series:
    out = pd.Series(pd.NA, index=df.index, dtype="string")
    for i in range(1, 6):
        sw = df[f"primary_taxonomy_switch_{i}"].astype(str).str.strip().str.upper().eq("Y")
        code = df[f"taxonomy_{i}"].astype(str).str.strip()
        out = out.mask(sw, code)
    return out


def top_n_states(df: pd.DataFrame, mask: pd.Series, n: int = 10) -> List[Dict[str, Any]]:
    vc = df.loc[mask, "practice_state"].astype(str).value_counts(dropna=False).head(n)
    return [{"state": str(k), "count": int(v)} for k, v in vc.items()]


def primary_taxonomy_counts(df: pd.DataFrame, mask: pd.Series, primary: pd.Series) -> List[Dict[str, Any]]:
    sub = primary[mask].astype(str).replace({"<NA>": "__none__"})
    vc = sub.value_counts(dropna=False)
    return [{"primary_taxonomy": str(k), "count": int(v)} for k, v in vc.items()]


def header(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def main() -> None:
    header("Load NPPES Parquet")
    df = pd.read_parquet(PARQUET_PATH, dtype_backend="numpy_nullable")
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise RuntimeError(f"Parquet missing required columns: {missing}")

    total_rows = len(df)
    print(f"Rows loaded: {total_rows:,}")

    nsclc_codes = set(NSCLC_TAXONOMIES)
    hep_codes = set(HEPATOLOGY_TAXONOMIES)
    rare_codes = set(RARE_DISEASE_TAXONOMIES)

    mask_nsclc = taxonomy_match_mask(df, nsclc_codes)
    mask_hep = taxonomy_match_mask(df, hep_codes)
    mask_rare = taxonomy_match_mask(df, rare_codes)

    primary_all = primary_taxonomy_series(df)

    ta_specs = [
        ("NSCLC", "NSCLC (strict)", mask_nsclc, nsclc_codes),
        ("HEPATOLOGY", "Hepatology / transplant hepatology (strict)", mask_hep, hep_codes),
        ("RARE_DISEASE", "Rare disease TA (strict)", mask_rare, rare_codes),
    ]

    results: Dict[str, Any] = {
        "source_parquet": PARQUET_PATH,
        "total_parquet_rows": int(total_rows),
        "taxonomy_filters": {
            "NSCLC": list(NSCLC_TAXONOMIES),
            "HEPATOLOGY": list(HEPATOLOGY_TAXONOMIES),
            "RARE_DISEASE": list(RARE_DISEASE_TAXONOMIES),
        },
        "therapeutic_areas": {},
        "deduplication": {},
        "totals_union": {},
    }

    for key, label, mask, codes in ta_specs:
        header(f"TA: {label}")
        n_match = int(mask.sum())
        print(f"Total matching providers (full ingestion count for this TA): {n_match:,}")

        top_states = top_n_states(df, mask, 10)
        print("Top 10 states (within TA match):")
        for row in top_states:
            print(f"  {row['state']!r}: {row['count']:,}")

        by_primary = primary_taxonomy_counts(df, mask, primary_all)
        print("Provider count by primary taxonomy code (within TA filter):")
        for row in by_primary[:25]:
            print(f"  {row['primary_taxonomy']!r}: {row['count']:,}")
        if len(by_primary) > 25:
            print(f"  ... ({len(by_primary) - 25} more primary codes)")

        results["therapeutic_areas"][key] = {
            "label": label,
            "matching_taxonomy_codes": sorted(codes),
            "total_matching_providers": n_match,
            "top_10_states": top_states,
            "by_primary_taxonomy": by_primary,
        }

    header("Deduplication across TAs")
    ta_match_count = mask_nsclc.astype("int32") + mask_hep.astype("int32") + mask_rare.astype("int32")
    multi_ta = int((ta_match_count > 1).sum())
    print(f"Providers matching MORE than one TA (row-level): {multi_ta:,}")
    results["deduplication"]["providers_matching_more_than_one_ta"] = multi_ta

    header("Union across all three TAs")
    mask_union = mask_nsclc | mask_hep | mask_rare
    n_unique_rows = int(mask_union.sum())
    print(f"Full unique providers (rows matching any TA): {n_unique_rows:,}")

    top_union = top_n_states(df, mask_union, 10)
    print("Top 10 states (unique providers across all TAs):")
    for row in top_union:
        print(f"  {row['state']!r}: {row['count']:,}")

    results["totals_union"] = {
        "unique_providers_any_ta": n_unique_rows,
        "top_10_states": top_union,
    }

    header(f"Writing JSON summary -> {OUTPUT_JSON}")
    out_path = Path(OUTPUT_JSON)
    out_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("Done.")


if __name__ == "__main__":
    main()
