"""
Quick NPPES parquet diagnostic for matcher debugging.
Run manually: python nppes_diagnostic.py
"""

from __future__ import annotations

from typing import Any, List, Optional, Tuple, Union

import pandas as pd

PARQUET_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\nppes_individual_providers.parquet"

# (last_name_norm query, practice_state query or None for state-less, note)
TEST_CASES: List[Tuple[str, Optional[str], str]] = [
    ("larson", "MN", "Joseph Larson"),
    ("campbell", "DC", "Andrew Campbell"),
    ("strong", "CO", "Michael Strong"),
    ("gilger", None, "Brian Gilger - state-less"),
    ("agbodzi", "FL", "Bright Agbodzi - unusual name"),
    ("janssen", "OH", "Paul Janssen"),
    ("larson", "MINNESOTA", "Joseph Larson - full state name test"),
]

# (last_name_norm, hcp_state, hcp_first) — same .loc tuple and filters as nppes_matcher.py
MATCHER_LOOKUP_CASES: List[Tuple[str, str, str]] = [
    ("larson", "MN", "joseph"),
    ("campbell", "DC", "andrew"),
    ("strong", "CO", "michael"),
    ("janssen", "OH", "paul"),
]


def ns(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def primary_taxonomy(row: pd.Series) -> Optional[str]:
    for i in range(1, 6):
        switch = ns(row.get(f"primary_taxonomy_switch_{i}")).upper()
        if switch == "Y":
            code = ns(row.get(f"taxonomy_{i}"))
            return code or None
    return None


def _ensure_dataframe(result: Union[pd.DataFrame, pd.Series]) -> pd.DataFrame:
    if isinstance(result, pd.Series):
        return result.to_frame().T
    return result


def load_nppes() -> pd.DataFrame:
    df = pd.read_parquet(PARQUET_PATH, dtype_backend="numpy_nullable")
    required = [
        "npi",
        "first_name",
        "last_name",
        "practice_state",
        "taxonomy_1",
        "primary_taxonomy_switch_1",
        "taxonomy_2",
        "primary_taxonomy_switch_2",
        "taxonomy_3",
        "primary_taxonomy_switch_3",
        "taxonomy_4",
        "primary_taxonomy_switch_4",
        "taxonomy_5",
        "primary_taxonomy_switch_5",
    ]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise RuntimeError(f"NPPES parquet missing required columns: {missing}")
    for col in required:
        df[col] = df[col].astype(str)
    df["last_name_norm"] = df["last_name"].str.lower().str.strip()
    df["first_name_norm"] = df["first_name"].str.lower().str.strip()
    return df


def matcher_lookup_section(df: pd.DataFrame) -> None:
    """Same multi-index + .loc + first-name filter pattern as nppes_matcher.name_state_candidates."""
    print("\n" + "=" * 72)
    print("Matcher-equivalent lookups (.loc + first_name_norm filter)")
    print("=" * 72 + "\n")

    nppes_df = df.copy()
    nppes_df["last_name_norm"] = nppes_df["last_name"].str.lower().str.strip()
    nppes_df["first_name_norm"] = nppes_df["first_name"].str.lower().str.strip()
    nppes_df = nppes_df.set_index(["last_name_norm", "practice_state"]).sort_index()

    for last_name_norm, hcp_state, hcp_first in MATCHER_LOOKUP_CASES:
        print(f"Query loc[({last_name_norm!r}, {hcp_state!r})], filter first matches hcp_first={hcp_first!r}")
        try:
            group = nppes_df.loc[(last_name_norm, hcp_state)]
        except KeyError:
            print("  Rows after .loc: KeyError raised - 0 candidates")
            print("  Rows after first-name filter: 0")
            print()
            continue

        group = _ensure_dataframe(group)
        n_loc = len(group)
        print(f"  Rows after .loc: {n_loc}")

        starts_with = group["first_name_norm"].str.startswith(hcp_first)
        exact = group["first_name_norm"].eq(hcp_first)
        filtered = group[starts_with | exact]
        n_filt = len(filtered)
        print(f"  Rows after first-name filter: {n_filt}")

        if n_filt:
            preview = filtered.head(3).reset_index()
            for _, row in preview.iterrows():
                print(
                    "    ",
                    f"first_name_norm={row['first_name_norm']!r} last_name={row['last_name']!r} "
                    f"practice_state={row['practice_state']!r}",
                )
        print()


def main() -> None:
    df = load_nppes()
    total = len(df)
    print(f"Total rows in NPPES: {total}\n")

    states = sorted([str(s) if pd.notna(s) else "(NaN)" for s in df["practice_state"].unique()])
    print(f"Distinct practice_state values ({len(states)}):")
    for s in states:
        print(f"  {repr(s)}")
    print()

    for last_q, state_q, note in TEST_CASES:
        print("=" * 72)
        if state_q is None:
            print(f"HCP query: last_name_norm={last_q!r}, state=<null> (state-less)")
            mask = df["last_name_norm"].fillna("") == last_q
        else:
            print(f"HCP query: last_name_norm={last_q!r}, practice_state={state_q!r}")
            mask = (df["last_name_norm"].fillna("") == last_q) & (
                df["practice_state"].fillna("") == state_q
            )

        subset = df.loc[mask]
        n = len(subset)
        print(f"Note: {note}")
        print(f"Matching NPPES rows: {n}")
        show = subset.head(5)
        for _, row in show.iterrows():
            pt = primary_taxonomy(row)
            print(
                f"  NPI={ns(row.get('npi'))} | first_name={ns(row.get('first_name'))!r} | "
                f"last_name={ns(row.get('last_name'))!r} | practice_state={row.get('practice_state')!r} | "
                f"primary_taxonomy={pt!r}"
            )
        if n > 5:
            print(f"  ... ({n - 5} more rows not shown)")
        print()

    matcher_lookup_section(df)


if __name__ == "__main__":
    main()
