"""
run_sql.py

Execute SQL against Postgres using DATABASE_URL from .env.

Usage:
  python scripts/utilities/run_sql.py "SELECT COUNT(*) FROM publications_v2"
  python scripts/utilities/run_sql.py --file query.sql
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Sequence

import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env", file=sys.stderr)
    sys.exit(1)


def format_table(columns: Sequence[str], rows: Sequence[Sequence[Any]]) -> str:
    if not columns:
        return "(no columns)"

    str_rows = [["" if value is None else str(value) for value in row] for row in rows]
    widths = [len(column) for column in columns]
    for row in str_rows:
        for index, cell in enumerate(row):
            widths[index] = max(widths[index], len(cell))

    header = " | ".join(column.ljust(widths[index]) for index, column in enumerate(columns))
    separator = "-+-".join("-" * width for width in widths)
    body = "\n".join(
        " | ".join(cell.ljust(widths[index]) for index, cell in enumerate(row))
        for row in str_rows
    )

    if not body:
        return f"{header}\n{separator}\n(0 rows)"
    return f"{header}\n{separator}\n{body}"


def read_sql(args: argparse.Namespace) -> str:
    if args.file:
        path = Path(args.file)
        if not path.is_file():
            print(f"ERROR: file not found: {path}", file=sys.stderr)
            sys.exit(1)
        return path.read_text(encoding="utf-8").strip()

    if args.sql:
        return args.sql.strip()

    print("ERROR: provide SQL as a positional argument or via --file", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Execute SQL using DATABASE_URL from .env")
    parser.add_argument("sql", nargs="?", help="SQL statement to execute")
    parser.add_argument("--file", "-f", help="Path to a .sql file")
    args = parser.parse_args()

    sql = read_sql(args)
    if not sql:
        print("ERROR: SQL is empty", file=sys.stderr)
        sys.exit(1)

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)

            if cur.description:
                columns = [desc.name for desc in cur.description]
                rows = cur.fetchall()
                print(format_table(columns, rows))
                print(f"\n({len(rows)} row{'s' if len(rows) != 1 else ''})")
            else:
                conn.commit()
                print(f"OK: {cur.rowcount} row{'s' if cur.rowcount != 1 else ''} affected")


if __name__ == "__main__":
    main()
