"""
NPPES chunked filter -> compact Parquet for organization cross-reference.

If needed, install dependency:
    pip install pyarrow
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List

import pandas as pd

INPUT_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\npidata_pfile_20050523-20260412.csv"
OUTPUT_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\nppes_organizations.parquet"
CHUNK_SIZE = 50_000

COLUMN_RENAME_MAP: Dict[str, str] = {
    "NPI": "npi",
    "Entity Type Code": "entity_type_code",
    "Provider Organization Name (Legal Business Name)": "organization_name_legal",
    "Provider Other Organization Name": "organization_name_other",
    "Provider First Line Business Practice Location Address": "practice_address",
    "Provider Business Practice Location Address City Name": "practice_city",
    "Provider Business Practice Location Address State Name": "practice_state",
    "Provider Business Practice Location Address Postal Code": "practice_zip",
    "Provider Business Practice Location Address Country Code (If outside U.S.)": "practice_country_code",
    "Healthcare Provider Taxonomy Code_1": "taxonomy_1",
    "Healthcare Provider Primary Taxonomy Switch_1": "primary_taxonomy_switch_1",
    "Healthcare Provider Taxonomy Code_2": "taxonomy_2",
    "Healthcare Provider Primary Taxonomy Switch_2": "primary_taxonomy_switch_2",
    "Healthcare Provider Taxonomy Code_3": "taxonomy_3",
    "Healthcare Provider Primary Taxonomy Switch_3": "primary_taxonomy_switch_3",
    "NPI Deactivation Date": "npi_deactivation_date",
}


def _pick_primary_taxonomy(df: pd.DataFrame) -> pd.Series:
    primary = pd.Series([""] * len(df), index=df.index, dtype="string")
    for i in range(1, 4):
        switch_col = f"primary_taxonomy_switch_{i}"
        tax_col = f"taxonomy_{i}"
        is_primary = df[switch_col].fillna("").str.upper().eq("Y")
        primary = primary.mask(is_primary, df[tax_col].fillna(""))
    return primary.fillna("")


def main() -> None:
    usecols: List[str] = list(COLUMN_RENAME_MAP.keys())
    filtered_chunks: List[pd.DataFrame] = []

    chunk_count = 0
    total_rows_scanned = 0
    total_retained = 0

    reader = pd.read_csv(
        INPUT_PATH,
        usecols=usecols,
        dtype=str,
        low_memory=False,
        chunksize=CHUNK_SIZE,
    )

    for chunk in reader:
        chunk_count += 1
        total_rows_scanned += len(chunk)

        entity_mask = chunk["Entity Type Code"].fillna("").str.strip().eq("2")
        active_mask = chunk["NPI Deactivation Date"].fillna("").str.strip().eq("")
        filtered = chunk[entity_mask & active_mask].copy()

        filtered.rename(columns=COLUMN_RENAME_MAP, inplace=True)
        total_retained += len(filtered)
        filtered_chunks.append(filtered)

        if chunk_count % 10 == 0:
            scanned_estimate = chunk_count * CHUNK_SIZE
            print(
                f"Processed {chunk_count} chunks "
                f"({scanned_estimate} rows scanned, {total_retained} active organizations retained)"
            )

    if filtered_chunks:
        final_df = pd.concat(filtered_chunks, ignore_index=True)
    else:
        final_df = pd.DataFrame(columns=[v for v in COLUMN_RENAME_MAP.values() if v != "npi_deactivation_date"])

    # Drop helper field not requested in output schema.
    if "npi_deactivation_date" in final_df.columns:
        final_df.drop(columns=["npi_deactivation_date"], inplace=True)

    output_path = Path(OUTPUT_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    final_df.to_parquet(output_path, compression="snappy", index=False)

    primary_taxonomy = _pick_primary_taxonomy(final_df)
    output_size_bytes = os.path.getsize(output_path)

    print("\n=== NPPES Organizations Filter Summary ===")
    print(f"Total rows scanned: {total_rows_scanned}")
    print(f"Total Type 2 active organizations retained: {len(final_df)}")
    print("\nTop 10 practice_state:")
    print(final_df["practice_state"].fillna("").value_counts(dropna=False).head(10))
    print("\nTop 20 primary taxonomy code:")
    print(primary_taxonomy.value_counts(dropna=False).head(20))
    print(f"\nOutput Parquet: {output_path}")
    print(f"Output file size: {output_size_bytes:,} bytes")


if __name__ == "__main__":
    main()
