"""
run_sql.py

Execute SQL against Postgres using DATABASE_URL from .env.

Usage:
  python scripts/utilities/run_sql.py "SELECT COUNT(*) FROM publications_v2"
  python scripts/utilities/run_sql.py --file query.sql
  python scripts/utilities/run_sql.py --file upsert.sql --param ta_id=<uuid> --statement-timeout 30min

--param binds a named parameter (pyformat %(name)s) — safer than string interpolation. NOTE: with
params, psycopg uses the extended protocol, which allows only ONE statement per call; a parametrized
file must be a single statement (put any `SET statement_timeout` in --statement-timeout, not the SQL).
Without --param, multi-statement files (SET; DROP; CREATE ...) still work as before.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Sequence

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


def parse_params(pairs: Optional[Sequence[str]]) -> Dict[str, str]:
    """Parse repeated --param name=value into a dict for pyformat (%(name)s) binding."""
    params: Dict[str, str] = {}
    for pair in pairs or []:
        if "=" not in pair:
            print(f"ERROR: --param must be name=value, got: {pair!r}", file=sys.stderr)
            sys.exit(1)
        name, value = pair.split("=", 1)
        name = name.strip()
        if not name:
            print(f"ERROR: --param has empty name: {pair!r}", file=sys.stderr)
            sys.exit(1)
        params[name] = value
    return params


# A GUC duration literal (e.g. 30min, 500ms, 2s, 1h). Validated so it can be safely inlined into the
# libpq connection options (statement_timeout is a SET/GUC and cannot take a bound parameter).
_TIMEOUT_RE = re.compile(r"^\d+(ms|s|min|h)?$")


def main() -> None:
    parser = argparse.ArgumentParser(description="Execute SQL using DATABASE_URL from .env")
    parser.add_argument("sql", nargs="?", help="SQL statement to execute")
    parser.add_argument("--file", "-f", help="Path to a .sql file")
    parser.add_argument("--param", action="append", metavar="NAME=VALUE",
                        help="Bind a named parameter (pyformat %%(name)s). Repeatable. Forces single-statement.")
    parser.add_argument("--statement-timeout", metavar="DURATION",
                        help="Raise statement_timeout for this session (GUC literal, e.g. 30min, 500ms).")
    args = parser.parse_args()

    sql = read_sql(args)
    if not sql:
        print("ERROR: SQL is empty", file=sys.stderr)
        sys.exit(1)

    params = parse_params(args.param)

    connect_kwargs: Dict[str, Any] = {}
    if args.statement_timeout:
        if not _TIMEOUT_RE.match(args.statement_timeout):
            print(f"ERROR: invalid --statement-timeout {args.statement_timeout!r} "
                  f"(expected e.g. 30min, 500ms, 2s, 1h)", file=sys.stderr)
            sys.exit(1)
        # Set the GUC at connection time via libpq options (validated literal, no injection surface).
        connect_kwargs["options"] = f"-c statement_timeout={args.statement_timeout}"

    with psycopg.connect(DATABASE_URL, **connect_kwargs) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or None)

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
