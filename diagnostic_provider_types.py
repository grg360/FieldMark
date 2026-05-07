import duckdb

PARQUET_FILES = [
    r"C:\Users\garre\Desktop\FieldMark\Medicare\medicare_provider_service_2021.parquet",
    r"C:\Users\garre\Desktop\FieldMark\Medicare\medicare_provider_service_2022.parquet",
    r"C:\Users\garre\Desktop\FieldMark\Medicare\medicare_provider_service_2023.parquet",
]


def print_rows(con: duckdb.DuckDBPyConnection, title: str, sql: str) -> None:
    print()
    print("=" * 80)
    print(title)
    print("=" * 80)
    rel = con.execute(sql)
    cols = [d[0] for d in rel.description]
    rows = rel.fetchall()
    print("\t".join(cols))
    for row in rows:
        print("\t".join(str(x) if x is not None else "" for x in row))


if __name__ == "__main__":
    con = duckdb.connect()

    paths_sql = ", ".join(f"'{p.replace(chr(39), chr(39)+chr(39))}'" for p in PARQUET_FILES)
    con.execute(
        f"""
        CREATE VIEW medicare_view AS
        SELECT * FROM read_parquet([{paths_sql}])
        """
    )

    print_rows(
        con,
        "Distinct provider_type (all years combined)",
        """
        SELECT
          provider_type,
          COUNT(*) AS row_count,
          COUNT(DISTINCT npi) AS unique_npis
        FROM medicare_view
        GROUP BY provider_type
        ORDER BY unique_npis DESC
        """,
    )

    print_rows(
        con,
        "NSCLC-related: provider_type contains Oncology or Hematology (case-insensitive)",
        """
        SELECT
          provider_type,
          COUNT(*) AS row_count,
          COUNT(DISTINCT npi) AS unique_npis
        FROM medicare_view
        WHERE
          lower(provider_type) LIKE '%oncology%'
          OR lower(provider_type) LIKE '%hematology%'
        GROUP BY provider_type
        ORDER BY unique_npis DESC
        """,
    )

    print_rows(
        con,
        "Hepatology-related: Gastroenterology, Hepatology, or Transplant (case-insensitive)",
        """
        SELECT
          provider_type,
          COUNT(*) AS row_count,
          COUNT(DISTINCT npi) AS unique_npis
        FROM medicare_view
        WHERE
          lower(provider_type) LIKE '%gastroenterology%'
          OR lower(provider_type) LIKE '%hepatology%'
          OR lower(provider_type) LIKE '%transplant%'
        GROUP BY provider_type
        ORDER BY unique_npis DESC
        """,
    )

    print_rows(
        con,
        "Rare Disease-related: Pediatric, Genetic, Hematology, or Neurology (case-insensitive)",
        """
        SELECT
          provider_type,
          COUNT(*) AS row_count,
          COUNT(DISTINCT npi) AS unique_npis
        FROM medicare_view
        WHERE
          lower(provider_type) LIKE '%pediatric%'
          OR lower(provider_type) LIKE '%genetic%'
          OR lower(provider_type) LIKE '%hematology%'
          OR lower(provider_type) LIKE '%neurology%'
        GROUP BY provider_type
        ORDER BY unique_npis DESC
        """,
    )
