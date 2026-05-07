import csv
import sys


CSV_PATH = r"C:\Users\garre\Desktop\FieldMark\OpenPayments\OP_DTL_GNRL_PGYR2024.csv"


csv.field_size_limit(2**31 - 1)


if __name__ == "__main__":
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)

        header = next(reader)
        header_count = len(header)
        print(f"Header columns (CSV-parsed): {header_count}")
        print(f"First 5 column names: {header[:5]}")

        last_five_rows = []
        for row in reader:
            last_five_rows.append(row)
            if len(last_five_rows) > 5:
                last_five_rows.pop(0)

    last_five_counts = [len(row) for row in last_five_rows]
    last_row = last_five_rows[-1]

    print(f"Last 5 rows column counts: {last_five_counts}")
    print(f"Last row first 3 fields: {last_row[:3]}")
    print(f"Last row last 3 fields: {last_row[-3:]}")
    print(f"Matches header? {all(count == header_count for count in last_five_counts)}")
