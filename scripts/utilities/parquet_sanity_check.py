from pathlib import Path

import pyarrow.compute as pc
import pyarrow.parquet as pq


PARQUET_FILES = [
    Path(r"C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr2022.parquet"),
    Path(r"C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr2023.parquet"),
    Path(r"C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr2024.parquet"),
]


def print_schema(schema) -> None:
    print("Schema:")
    for field in schema:
        print(f"  - {field.name}: {field.type}")


def print_value_counts(table, column_name: str) -> None:
    arr = table[column_name].combine_chunks()
    counts = pc.value_counts(arr)
    rows = []
    for item in counts:
        value = item["values"].as_py()
        count = item["counts"].as_py()
        rows.append((value, count))
    rows.sort(key=lambda x: x[1], reverse=True)
    print(f"Distinct values for {column_name}:")
    for value, count in rows:
        print(f"  {value!r}: {count}")


def analyze_file(path: Path) -> None:
    pf = pq.ParquetFile(path)
    schema = pf.schema_arrow
    print("=" * 100)
    print(f"File: {path}")
    print(f"num_rows: {pf.metadata.num_rows}")
    print(f"num_row_groups: {pf.metadata.num_row_groups}")
    print_schema(schema)

    first_five = pf.read().slice(0, 5)
    print("First 5 rows:")
    print(first_five.to_string())

    table = pf.read(
        columns=[
            "program_year",
            "drug_indicator",
            "nature_of_payment",
            "dispute_status",
            "payment_amount_usd",
            "npi",
            "drug_slot",
        ]
    )

    print_value_counts(table, "program_year")
    print_value_counts(table, "drug_indicator")
    print_value_counts(table, "nature_of_payment")
    print_value_counts(table, "dispute_status")

    payment_amount = table["payment_amount_usd"].combine_chunks()
    total_payment = pc.sum(payment_amount).as_py()
    mean_payment = pc.mean(payment_amount).as_py()
    max_payment = pc.max(payment_amount).as_py()
    distinct_npi_count = pc.count_distinct(table["npi"].combine_chunks()).as_py()
    no_drug_rows = pc.sum(
        pc.cast(
            pc.equal(table["drug_slot"].combine_chunks(), 0),
            "int64",
        )
    ).as_py()

    print("Payment/NPI metrics:")
    print(f"  Total payment_amount_usd: {total_payment}")
    print(f"  Mean payment_amount_usd: {mean_payment}")
    print(f"  Max payment_amount_usd: {max_payment}")
    print(f"  Distinct NPI count (approx via set computation): {distinct_npi_count}")
    print(f"  Rows where drug_slot=0: {no_drug_rows}")


if __name__ == "__main__":
    for parquet_path in PARQUET_FILES:
        analyze_file(parquet_path)
