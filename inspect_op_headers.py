import csv
import glob
from pathlib import Path


BASE_DIR = Path(r"C:\Users\garre\Desktop\FieldMark\OpenPayments")


csv.field_size_limit(2**31 - 1)


if __name__ == "__main__":
    pattern_upper = str(BASE_DIR / "OP_DTL_GNRL_PGYR*.CSV")
    pattern_lower = str(BASE_DIR / "OP_DTL_GNRL_PGYR*.csv")
    files = sorted(
        {
            Path(p)
            for p in glob.glob(pattern_upper)
        }
        | {
            Path(p)
            for p in glob.glob(pattern_lower)
        },
        key=lambda p: p.name,
    )

    headers_by_file = {}

    for path in files:
        print("=" * 80)
        print(path.name)

        with open(path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            header = next(reader)

        headers_by_file[path.name] = header
        print(f"Column count: {len(header)}")
        for idx, col in enumerate(header, start=1):
            print(f"{idx}. {col}")

    if headers_by_file:
        all_sets = [set(cols) for cols in headers_by_file.values()]
        intersection = set.intersection(*all_sets)
        union = set.union(*all_sets)
        drift = union - intersection

        print("=" * 80)
        print("Columns present in ALL files (intersection)")
        for col in sorted(intersection):
            print(col)

        print("=" * 80)
        print("Columns present in some but not all files (drift)")
        for col in sorted(drift):
            present_in = [
                filename
                for filename, cols in headers_by_file.items()
                if col in set(cols)
            ]
            print(f"{col}: {present_in}")
