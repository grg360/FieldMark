import argparse
import csv
import glob
import os
import re
import time
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pyarrow as pa
import pyarrow.parquet as pq


BASE_DIR = Path(r"C:\Users\garre\Desktop\FieldMark\OpenPayments")
INPUT_PATTERNS = ["OP_DTL_GNRL_PGYR*.csv", "OP_DTL_GNRL_PGYR*.CSV"]
OUTPUT_TEMPLATE = "op_general_pgyr{year}.parquet"
BATCH_SIZE = 500_000
MAX_PARSE_ERRORS = 1000

CSV_CHANGE_TYPE = "Change_Type"
CSV_RECIPIENT_TYPE = "Covered_Recipient_Type"
CSV_COUNTRY = "Recipient_Country"
CSV_NPI = "Covered_Recipient_NPI"
CSV_AMOUNT = "Total_Amount_of_Payment_USDollars"
CSV_RECORD_ID = "Record_ID"
CSV_PROGRAM_YEAR = "Program_Year"
CSV_FIRST_NAME = "Covered_Recipient_First_Name"
CSV_MIDDLE_NAME = "Covered_Recipient_Middle_Name"
CSV_LAST_NAME = "Covered_Recipient_Last_Name"
CSV_RECIPIENT_STATE = "Recipient_State"
CSV_SPECIALTY = "Covered_Recipient_Specialty_1"
CSV_MANUFACTURER = "Submitting_Applicable_Manufacturer_or_Applicable_GPO_Name"
CSV_PAYMENT_DATE = "Date_of_Payment"
CSV_NATURE_OF_PAYMENT = "Nature_of_Payment_or_Transfer_of_Value"
CSV_DISPUTE_STATUS = "Dispute_Status_for_Publication"

NPI_RE = re.compile(r"\d{10}")
YEAR_RE = re.compile(r"PGYR(\d{4})", re.IGNORECASE)

csv.field_size_limit(2**31 - 1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=False)
    parser.add_argument("--year", type=int, default=None)
    return parser.parse_args()


def list_input_files(year_filter: Optional[int]) -> List[Path]:
    matched = set()
    for pattern in INPUT_PATTERNS:
        matched.update(Path(p) for p in glob.glob(str(BASE_DIR / pattern)))
    files = sorted(matched, key=lambda p: p.name)
    if year_filter is None:
        return files
    out = []
    for p in files:
        year = extract_year_from_filename(p.name)
        if year == year_filter:
            out.append(p)
    return out


def extract_year_from_filename(filename: str) -> int:
    m = YEAR_RE.search(filename)
    if not m:
        raise ValueError(f"Could not parse program year from filename: {filename}")
    return int(m.group(1))


def get_value(row: Dict[str, Any], key: str) -> str:
    if key not in row:
        raise KeyError(key)
    value = row.get(key)
    if value is None:
        return ""
    return str(value).strip()


def build_schema() -> pa.Schema:
    return pa.schema(
        [
            pa.field("record_id", pa.string()),
            pa.field("program_year", pa.int32()),
            pa.field("npi", pa.string()),
            pa.field("recipient_first_name", pa.string()),
            pa.field("recipient_middle_name", pa.string()),
            pa.field("recipient_last_name", pa.string()),
            pa.field("recipient_state", pa.string()),
            pa.field("specialty_primary", pa.string()),
            pa.field("manufacturer_name", pa.string()),
            pa.field("payment_amount_usd", pa.float64()),
            pa.field("payment_date", pa.string()),
            pa.field("nature_of_payment", pa.string()),
            pa.field("dispute_status", pa.string()),
            pa.field("drug_slot", pa.int8()),
            pa.field("drug_indicator", pa.string()),
            pa.field("drug_name", pa.string()),
            pa.field("drug_ndc", pa.string()),
        ]
    )


def empty_batch() -> Dict[str, List[Any]]:
    return {
        "record_id": [],
        "program_year": [],
        "npi": [],
        "recipient_first_name": [],
        "recipient_middle_name": [],
        "recipient_last_name": [],
        "recipient_state": [],
        "specialty_primary": [],
        "manufacturer_name": [],
        "payment_amount_usd": [],
        "payment_date": [],
        "nature_of_payment": [],
        "dispute_status": [],
        "drug_slot": [],
        "drug_indicator": [],
        "drug_name": [],
        "drug_ndc": [],
    }


def flush_batch(writer: pq.ParquetWriter, batch: Dict[str, List[Any]], schema: pa.Schema) -> int:
    row_count = len(batch["record_id"])
    if row_count == 0:
        return 0
    table = pa.Table.from_pydict(batch, schema=schema)
    writer.write_table(table)
    return row_count


def dry_run_file(path: Path) -> Dict[str, Any]:
    counters = {
        "rows_scanned": 0,
        "distinct_recipient_country": Counter(),
        "distinct_recipient_type": Counter(),
        "distinct_change_type": Counter(),
    }
    with open(path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        while True:
            try:
                row = next(reader)
            except StopIteration:
                break
            counters["rows_scanned"] += 1
            counters["distinct_recipient_country"][get_value(row, CSV_COUNTRY)] += 1
            counters["distinct_recipient_type"][get_value(row, CSV_RECIPIENT_TYPE)] += 1
            counters["distinct_change_type"][get_value(row, CSV_CHANGE_TYPE)] += 1

    print("=" * 80)
    print(f"File: {path.name}")
    print(f"Total rows scanned: {counters['rows_scanned']}")
    print("Recipient_Country distinct values:")
    for k, v in counters["distinct_recipient_country"].most_common():
        print(f"  {k!r}: {v}")
    print("Covered_Recipient_Type distinct values:")
    for k, v in counters["distinct_recipient_type"].most_common():
        print(f"  {k!r}: {v}")
    print("Change_Type distinct values:")
    for k, v in counters["distinct_change_type"].most_common():
        print(f"  {k!r}: {v}")
    return counters


def process_file(path: Path) -> Dict[str, Any]:
    start = time.time()
    year = extract_year_from_filename(path.name)
    out_path = BASE_DIR / OUTPUT_TEMPLATE.format(year=year)
    if out_path.exists():
        out_path.unlink()

    schema = build_schema()
    writer = pq.ParquetWriter(str(out_path), schema=schema, compression="snappy")
    batch = empty_batch()

    counters = {
        "rows_read": 0,
        "rows_filtered_change_type": 0,
        "rows_filtered_recipient_type": 0,
        "rows_filtered_country": 0,
        "rows_filtered_no_npi": 0,
        "rows_filtered_invalid_amount": 0,
        "rows_passed": 0,
        "output_rows_written": 0,
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
                except Exception as exc:
                    counters["parse_error"] += 1
                    print(
                        f"Parse error row ~{reader.line_num} in {path.name}: "
                        f"{type(exc).__name__}"
                    )
                    if counters["parse_error"] > MAX_PARSE_ERRORS:
                        raise RuntimeError(
                            f"Aborting {path.name}: parse_error exceeded {MAX_PARSE_ERRORS}"
                        )
                    continue

                counters["rows_read"] += 1

                try:
                    change_type = get_value(row, CSV_CHANGE_TYPE)
                    if change_type == "DELETE":
                        counters["rows_filtered_change_type"] += 1
                        continue

                    recipient_type = get_value(row, CSV_RECIPIENT_TYPE)
                    if recipient_type != "Covered Recipient Physician":
                        counters["rows_filtered_recipient_type"] += 1
                        continue

                    recipient_country = get_value(row, CSV_COUNTRY)
                    if recipient_country != "United States":
                        counters["rows_filtered_country"] += 1
                        continue

                    npi = get_value(row, CSV_NPI)
                    if not NPI_RE.fullmatch(npi):
                        counters["rows_filtered_no_npi"] += 1
                        continue

                    amount_text = get_value(row, CSV_AMOUNT)
                    amount = float(amount_text)
                    if amount <= 0:
                        counters["rows_filtered_invalid_amount"] += 1
                        continue

                    record_id = get_value(row, CSV_RECORD_ID)
                    program_year = int(get_value(row, CSV_PROGRAM_YEAR))
                    recipient_first_name = get_value(row, CSV_FIRST_NAME)
                    recipient_middle_name = get_value(row, CSV_MIDDLE_NAME)
                    recipient_last_name = get_value(row, CSV_LAST_NAME)
                    recipient_state = get_value(row, CSV_RECIPIENT_STATE)
                    specialty_primary = get_value(row, CSV_SPECIALTY)
                    manufacturer_name = get_value(row, CSV_MANUFACTURER)
                    payment_date = get_value(row, CSV_PAYMENT_DATE)
                    nature_of_payment = get_value(row, CSV_NATURE_OF_PAYMENT)
                    dispute_status = get_value(row, CSV_DISPUTE_STATUS)

                except Exception as exc:
                    counters["parse_error"] += 1
                    print(
                        f"Parse error row {reader.line_num} in {path.name}: "
                        f"{type(exc).__name__}"
                    )
                    if counters["parse_error"] > MAX_PARSE_ERRORS:
                        raise RuntimeError(
                            f"Aborting {path.name}: parse_error exceeded {MAX_PARSE_ERRORS}"
                        )
                    continue

                counters["rows_passed"] += 1

                emitted_any = False
                for slot in range(1, 6):
                    drug_name = get_value(
                        row,
                        f"Name_of_Drug_or_Biological_or_Device_or_Medical_Supply_{slot}",
                    )
                    if not drug_name:
                        continue
                    emitted_any = True
                    drug_indicator = get_value(
                        row,
                        f"Indicate_Drug_or_Biological_or_Device_or_Medical_Supply_{slot}",
                    )
                    drug_ndc = get_value(row, f"Associated_Drug_or_Biological_NDC_{slot}")

                    batch["record_id"].append(record_id)
                    batch["program_year"].append(program_year)
                    batch["npi"].append(npi)
                    batch["recipient_first_name"].append(recipient_first_name)
                    batch["recipient_middle_name"].append(recipient_middle_name)
                    batch["recipient_last_name"].append(recipient_last_name)
                    batch["recipient_state"].append(recipient_state)
                    batch["specialty_primary"].append(specialty_primary)
                    batch["manufacturer_name"].append(manufacturer_name)
                    batch["payment_amount_usd"].append(amount)
                    batch["payment_date"].append(payment_date)
                    batch["nature_of_payment"].append(nature_of_payment)
                    batch["dispute_status"].append(dispute_status)
                    batch["drug_slot"].append(slot)
                    batch["drug_indicator"].append(drug_indicator or None)
                    batch["drug_name"].append(drug_name)
                    batch["drug_ndc"].append(drug_ndc or None)

                if not emitted_any:
                    batch["record_id"].append(record_id)
                    batch["program_year"].append(program_year)
                    batch["npi"].append(npi)
                    batch["recipient_first_name"].append(recipient_first_name)
                    batch["recipient_middle_name"].append(recipient_middle_name)
                    batch["recipient_last_name"].append(recipient_last_name)
                    batch["recipient_state"].append(recipient_state)
                    batch["specialty_primary"].append(specialty_primary)
                    batch["manufacturer_name"].append(manufacturer_name)
                    batch["payment_amount_usd"].append(amount)
                    batch["payment_date"].append(payment_date)
                    batch["nature_of_payment"].append(nature_of_payment)
                    batch["dispute_status"].append(dispute_status)
                    batch["drug_slot"].append(0)
                    batch["drug_indicator"].append(None)
                    batch["drug_name"].append(None)
                    batch["drug_ndc"].append(None)

                if len(batch["record_id"]) >= BATCH_SIZE:
                    counters["output_rows_written"] += flush_batch(writer, batch, schema)
                    batch = empty_batch()

        counters["output_rows_written"] += flush_batch(writer, batch, schema)
    finally:
        writer.close()

    elapsed = time.time() - start
    out_size = os.path.getsize(out_path)
    print("=" * 80)
    print(f"Input file: {path.name}")
    for key, value in counters.items():
        print(f"{key}: {value}")
    print(f"Output file: {out_path}")
    print(f"Output size bytes (approx): {out_size}")
    print(f"Elapsed seconds: {elapsed:.1f}")
    if counters["rows_passed"] < 1_000_000:
        print(
            "WARNING: rows_passed < 1,000,000. "
            "Filter may be too aggressive for Open Payments General Payments."
        )
    return {
        "counters": counters,
        "output_path": str(out_path),
        "output_size": out_size,
        "elapsed_seconds": elapsed,
    }


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

    grand = Counter()

    if args.dry_run:
        for path in files:
            dry = dry_run_file(path)
            grand["rows_scanned"] += dry["rows_scanned"]
        print("=" * 80)
        print("Dry-run complete.")
        print(f"Total rows scanned across files: {grand['rows_scanned']}")
    else:
        for path in files:
            result = process_file(path)
            grand.update(result["counters"])
        print("=" * 80)
        print("Grand totals across all processed years:")
        for k in [
            "rows_read",
            "rows_filtered_change_type",
            "rows_filtered_recipient_type",
            "rows_filtered_country",
            "rows_filtered_no_npi",
            "rows_filtered_invalid_amount",
            "rows_passed",
            "output_rows_written",
            "parse_error",
        ]:
            print(f"{k}: {grand[k]}")
