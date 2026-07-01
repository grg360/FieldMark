"""
Medicare Physician & Other Practitioners by Provider and Service — filter to Parquet.

Streams large CMS CSVs; writes one Parquet per calendar year.
"""

from __future__ import annotations

import argparse
import csv
import glob
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import pyarrow as pa
import pyarrow.parquet as pq


BASE_DIR = Path(r"C:\Users\garre\Desktop\FieldMark\Medicare")
INPUT_GLOB_LOWER = "Medicare_Physician_Other_Practitioners_by_Provider_and_Service_*.csv"
INPUT_GLOB_UPPER = "Medicare_Physician_Other_Practitioners_by_Provider_and_Service_*.CSV"
OUTPUT_TEMPLATE = "medicare_provider_service_{year}.parquet"
BATCH_SIZE = 500_000
MAX_PARSE_ERRORS = 1000

YEAR_FROM_FILENAME = re.compile(r"_(\d{4})\.(?:csv|CSV)$")
NPI_RE = re.compile(r"^\d{10}$")

CSV_COUNTRY = "Rndrng_Prvdr_Cntry"
CSV_ENTITY = "Rndrng_Prvdr_Ent_Cd"
CSV_NPI = "Rndrng_NPI"
CSV_TOT_BENES = "Tot_Benes"

REQUIRED_COLUMNS = [
    CSV_COUNTRY,
    CSV_ENTITY,
    CSV_NPI,
    CSV_TOT_BENES,
    "Rndrng_Prvdr_Last_Org_Name",
    "Rndrng_Prvdr_First_Name",
    "Rndrng_Prvdr_MI",
    "Rndrng_Prvdr_Crdntls",
    "Rndrng_Prvdr_City",
    "Rndrng_Prvdr_State_Abrvtn",
    "Rndrng_Prvdr_Zip5",
    "Rndrng_Prvdr_RUCA",
    "Rndrng_Prvdr_RUCA_Desc",
    "Rndrng_Prvdr_Type",
    "Rndrng_Prvdr_Mdcr_Prtcptg_Ind",
    "HCPCS_Cd",
    "HCPCS_Desc",
    "HCPCS_Drug_Ind",
    "Place_Of_Srvc",
    "Tot_Srvcs",
    "Tot_Bene_Day_Srvcs",
    "Avg_Sbmtd_Chrg",
    "Avg_Mdcr_Alowd_Amt",
    "Avg_Mdcr_Pymt_Amt",
    "Avg_Mdcr_Stdzd_Amt",
]

DRY_RUN_COLUMNS = [
    CSV_COUNTRY,
    "Rndrng_Prvdr_Ent_Cd",
    "Rndrng_Prvdr_Mdcr_Prtcptg_Ind",
    "Place_Of_Srvc",
    "HCPCS_Drug_Ind",
]

csv.field_size_limit(2**31 - 1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=False)
    parser.add_argument("--year", type=int, default=None)
    return parser.parse_args()


def list_input_files(year_filter: Optional[int]) -> List[Path]:
    matched = set()
    matched.update(Path(p) for p in glob.glob(str(BASE_DIR / INPUT_GLOB_LOWER)))
    matched.update(Path(p) for p in glob.glob(str(BASE_DIR / INPUT_GLOB_UPPER)))
    files = sorted(matched, key=lambda p: p.name)
    if year_filter is None:
        return files
    out: List[Path] = []
    for p in files:
        if extract_program_year(p.name) == year_filter:
            out.append(p)
    return out


def extract_program_year(filename: str) -> int:
    m = YEAR_FROM_FILENAME.search(filename)
    if not m:
        raise ValueError(f"Cannot extract program year from filename: {filename}")
    return int(m.group(1))


def ns(value: Optional[str]) -> str:
    if value is None:
        return ""
    return str(value).strip()


def build_schema() -> pa.Schema:
    return pa.schema(
        [
            pa.field("program_year", pa.int32()),
            pa.field("npi", pa.string()),
            pa.field("provider_last_name", pa.string()),
            pa.field("provider_first_name", pa.string()),
            pa.field("provider_middle_initial", pa.string()),
            pa.field("provider_credentials", pa.string()),
            pa.field("provider_city", pa.string()),
            pa.field("provider_state", pa.string()),
            pa.field("provider_zip5", pa.string()),
            pa.field("provider_ruca", pa.string()),
            pa.field("provider_ruca_desc", pa.string()),
            pa.field("provider_type", pa.string()),
            pa.field("medicare_participating", pa.string()),
            pa.field("hcpcs_code", pa.string()),
            pa.field("hcpcs_description", pa.string()),
            pa.field("hcpcs_drug_indicator", pa.string()),
            pa.field("place_of_service", pa.string()),
            pa.field("total_beneficiaries", pa.int32()),
            pa.field("total_services", pa.int32()),
            pa.field("total_bene_day_services", pa.int32()),
            pa.field("avg_submitted_charge", pa.float64()),
            pa.field("avg_medicare_allowed", pa.float64()),
            pa.field("avg_medicare_payment", pa.float64()),
            pa.field("avg_medicare_standardized", pa.float64()),
        ]
    )


def empty_batch() -> Dict[str, List[Any]]:
    return {
        "program_year": [],
        "npi": [],
        "provider_last_name": [],
        "provider_first_name": [],
        "provider_middle_initial": [],
        "provider_credentials": [],
        "provider_city": [],
        "provider_state": [],
        "provider_zip5": [],
        "provider_ruca": [],
        "provider_ruca_desc": [],
        "provider_type": [],
        "medicare_participating": [],
        "hcpcs_code": [],
        "hcpcs_description": [],
        "hcpcs_drug_indicator": [],
        "place_of_service": [],
        "total_beneficiaries": [],
        "total_services": [],
        "total_bene_day_services": [],
        "avg_submitted_charge": [],
        "avg_medicare_allowed": [],
        "avg_medicare_payment": [],
        "avg_medicare_standardized": [],
    }


def flush_batch(writer: pq.ParquetWriter, batch: Dict[str, List[Any]], schema: pa.Schema) -> int:
    n = len(batch["npi"])
    if n == 0:
        return 0
    writer.write_table(pa.Table.from_pydict(batch, schema=schema))
    return n


def parse_optional_float(raw: Optional[str]) -> Optional[float]:
    s = ns(raw)
    if not s:
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        raise ValueError(f"not a float: {raw!r}")


def parse_optional_int(raw: Optional[str]) -> Optional[int]:
    s = ns(raw)
    if not s:
        return None
    try:
        return int(float(s.replace(",", "")))
    except ValueError:
        raise ValueError(f"not an int: {raw!r}")


def dry_run_file(path: Path) -> None:
    from collections import Counter

    counters = {col: Counter() for col in DRY_RUN_COLUMNS}
    rows_scanned = 0

    with open(path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows_scanned += 1
            for col in DRY_RUN_COLUMNS:
                counters[col][ns(row.get(col))] += 1

    print("=" * 80)
    print(f"File: {path.name}")
    print(f"Total rows scanned: {rows_scanned}")
    for col in DRY_RUN_COLUMNS:
        print(f"Distinct values for {col}:")
        for k, v in counters[col].most_common():
            print(f"  {k!r}: {v}")


def process_file(path: Path, program_year: int) -> Dict[str, Any]:
    started = time.time()
    out_path = BASE_DIR / OUTPUT_TEMPLATE.format(year=program_year)
    if out_path.exists():
        out_path.unlink()

    schema = build_schema()
    writer = pq.ParquetWriter(str(out_path), schema=schema, compression="snappy")
    batch = empty_batch()
    output_written = 0

    counters = {
        "rows_read": 0,
        "rows_filtered_country": 0,
        "rows_filtered_entity": 0,
        "rows_filtered_no_npi": 0,
        "rows_filtered_no_benes": 0,
        "rows_passed": 0,
        "parse_error": 0,
    }

    try:
        with open(path, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)

            while True:
                try:
                    row = next(reader)
                except StopIteration:
                    break
                except Exception:
                    counters["parse_error"] += 1
                    print(f"Parse error at reader line ~{reader.line_num}: row unreadable")
                    if counters["parse_error"] > MAX_PARSE_ERRORS:
                        raise RuntimeError(f"parse_error exceeded {MAX_PARSE_ERRORS} for {path.name}")
                    continue

                counters["rows_read"] += 1

                try:
                    for col in REQUIRED_COLUMNS:
                        if col not in row:
                            raise KeyError(col)

                    if ns(row.get(CSV_COUNTRY)) != "US":
                        counters["rows_filtered_country"] += 1
                        continue
                    if ns(row.get(CSV_ENTITY)) != "I":
                        counters["rows_filtered_entity"] += 1
                        continue
                    npi_val = ns(row.get(CSV_NPI))
                    if not NPI_RE.fullmatch(npi_val):
                        counters["rows_filtered_no_npi"] += 1
                        continue

                    tb_raw = row.get(CSV_TOT_BENES)
                    tb_s = ns(tb_raw)
                    try:
                        tot_benes = int(tb_s.replace(",", "")) if tb_s else 0
                    except ValueError:
                        counters["rows_filtered_no_benes"] += 1
                        continue
                    if tot_benes <= 0:
                        counters["rows_filtered_no_benes"] += 1
                        continue

                    total_services = parse_optional_int(row.get("Tot_Srvcs"))
                    total_bene_day = parse_optional_int(row.get("Tot_Bene_Day_Srvcs"))
                    avg_sub = parse_optional_float(row.get("Avg_Sbmtd_Chrg"))
                    avg_allow = parse_optional_float(row.get("Avg_Mdcr_Alowd_Amt"))
                    avg_pymt = parse_optional_float(row.get("Avg_Mdcr_Pymt_Amt"))
                    avg_std = parse_optional_float(row.get("Avg_Mdcr_Stdzd_Amt"))

                    drug_ind = ns(row.get("HCPCS_Drug_Ind"))
                    batch["program_year"].append(program_year)
                    batch["npi"].append(npi_val)
                    batch["provider_last_name"].append(ns(row.get("Rndrng_Prvdr_Last_Org_Name")))
                    batch["provider_first_name"].append(ns(row.get("Rndrng_Prvdr_First_Name")))
                    batch["provider_middle_initial"].append(ns(row.get("Rndrng_Prvdr_MI")))
                    batch["provider_credentials"].append(ns(row.get("Rndrng_Prvdr_Crdntls")))
                    batch["provider_city"].append(ns(row.get("Rndrng_Prvdr_City")))
                    batch["provider_state"].append(ns(row.get("Rndrng_Prvdr_State_Abrvtn")))
                    batch["provider_zip5"].append(ns(row.get("Rndrng_Prvdr_Zip5")))
                    batch["provider_ruca"].append(ns(row.get("Rndrng_Prvdr_RUCA")))
                    batch["provider_ruca_desc"].append(ns(row.get("Rndrng_Prvdr_RUCA_Desc")))
                    batch["provider_type"].append(ns(row.get("Rndrng_Prvdr_Type")))
                    batch["medicare_participating"].append(ns(row.get("Rndrng_Prvdr_Mdcr_Prtcptg_Ind")))
                    batch["hcpcs_code"].append(ns(row.get("HCPCS_Cd")))
                    batch["hcpcs_description"].append(ns(row.get("HCPCS_Desc")))
                    batch["hcpcs_drug_indicator"].append(drug_ind if drug_ind else None)
                    batch["place_of_service"].append(ns(row.get("Place_Of_Srvc")))
                    batch["total_beneficiaries"].append(int(tot_benes))
                    batch["total_services"].append(int(total_services) if total_services is not None else None)
                    batch["total_bene_day_services"].append(
                        int(total_bene_day) if total_bene_day is not None else None
                    )
                    batch["avg_submitted_charge"].append(float(avg_sub) if avg_sub is not None else None)
                    batch["avg_medicare_allowed"].append(float(avg_allow) if avg_allow is not None else None)
                    batch["avg_medicare_payment"].append(float(avg_pymt) if avg_pymt is not None else None)
                    batch["avg_medicare_standardized"].append(float(avg_std) if avg_std is not None else None)

                    counters["rows_passed"] += 1

                    if len(batch["npi"]) >= BATCH_SIZE:
                        output_written += flush_batch(writer, batch, schema)
                        batch = empty_batch()

                except Exception as exc:
                    counters["parse_error"] += 1
                    print(
                        f"Parse error row {reader.line_num} in {path.name}: "
                        f"{type(exc).__name__}"
                    )
                    if counters["parse_error"] > MAX_PARSE_ERRORS:
                        raise RuntimeError(f"parse_error exceeded {MAX_PARSE_ERRORS} for {path.name}")

        output_written += flush_batch(writer, batch, schema)
    finally:
        writer.close()

    elapsed = time.time() - started
    size_bytes = os.path.getsize(out_path)

    print("=" * 80)
    print(f"Input file: {path.name}")
    for k, v in counters.items():
        print(f"{k}: {v}")
    print(f"Output file: {out_path}")
    print(f"Output size bytes (approx): {size_bytes}")
    print(f"Output rows written: {output_written}")
    print(f"Elapsed seconds: {elapsed:.1f}")

    if counters["rows_passed"] < 5_000_000:
        print(
            "WARNING: rows_passed < 5,000,000. Filter may be too aggressive for Medicare "
            "Physician & Other Practitioners data."
        )

    return {"counters": counters, "output_path": str(out_path), "output_rows": output_written, "elapsed": elapsed}


if __name__ == "__main__":
    args = parse_args()
    files = list_input_files(args.year)
    files = sorted(files, key=lambda p: p.name)

    if not files:
        print("No matching input files found.")
    else:
        print("Files in scope:")
        for p in files:
            print(f"  {p.name}")

    if args.dry_run:
        for path in files:
            dry_run_file(path)
        print("Dry-run complete.")
    else:
        grand: Dict[str, int] = {}
        for path in files:
            year = extract_program_year(path.name)
            result = process_file(path, year)
            c = result["counters"]
            for k, v in c.items():
                grand[k] = grand.get(k, 0) + int(v)

        print("=" * 80)
        print("Grand totals across all processed years:")
        for k in [
            "rows_read",
            "rows_filtered_country",
            "rows_filtered_entity",
            "rows_filtered_no_npi",
            "rows_filtered_no_benes",
            "rows_passed",
            "parse_error",
        ]:
            print(f"{k}: {grand.get(k, 0)}")
