"""
NIH RePORTER API test script.

Quick validation that the NIH RePORTER API is accessible and returns
data shape we'd expect for FieldMark integration. Tests two queries:

1. Search by PI surname + institution keyword (known hepatology KOL)
2. Search by research focus keyword + recent fiscal year (rising stars)

API documentation: https://api.reporter.nih.gov/
No API key required — public API with reasonable rate limits.

This is a feasibility test, NOT a production ingestion script.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

import requests

API_BASE = "https://api.reporter.nih.gov/v2/projects/search"
TIMEOUT_SECONDS = 30


def search_projects(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """POST to RePORTER search endpoint."""
    response = requests.post(API_BASE, json=payload, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    data = response.json()
    return data.get("results", [])


def pretty(value: Any, indent: int = 2) -> str:
    return json.dumps(value, indent=indent, default=str)


def test_query_1_loomba() -> None:
    """Find Loomba's NIH grants. Expected: multiple active MASH/NAFLD grants."""
    print("=" * 70)
    print("TEST 1: Search for Rohit Loomba's NIH grants")
    print("=" * 70)

    payload = {
        "criteria": {
            "pi_names": [{"last_name": "Loomba", "first_name": "Rohit"}],
            "include_active_projects": True,
        },
        "include_fields": [
            "ProjectNum",
            "ProjectTitle",
            "FiscalYear",
            "AwardAmount",
            "AgencyIcAdmin",
            "Organization",
            "PrincipalInvestigators",
            "Terms",
            "PrefTerms",
            "ProjectStartDate",
            "ProjectEndDate",
        ],
        "limit": 10,
        "offset": 0,
    }

    try:
        results = search_projects(payload)
        print(f"\nFound {len(results)} projects (showing first {min(3, len(results))}):\n")
        for i, project in enumerate(results[:3], start=1):
            org = (project.get("organization") or {}).get("org_name", "")
            agency = (project.get("agency_ic_admin") or {}).get("name", "")
            print(f"  [{i}] {project.get('project_num', '')}")
            print(f"      Title: {project.get('project_title', '')[:80]}...")
            print(f"      FY:    {project.get('fiscal_year', '')}")
            print(f"      $:     ${project.get('award_amount', 0):,}")
            print(f"      Inst:  {org}")
            print(f"      IC:    {agency}")
            print()
    except Exception as exc:
        print(f"[ERROR] {exc}")


def test_query_2_rising_stars_mash() -> None:
    """Find recent K-awards in MASH research. Expected: early-career hepatology researchers."""
    print("=" * 70)
    print("TEST 2: Recent K-awards in MASH/NAFLD research (rising-star signal)")
    print("=" * 70)

    payload = {
        "criteria": {
            "terms": "MASH OR NAFLD OR NASH OR steatohepatitis",
            "activity_codes": ["K08", "K23", "K99"],
            "fiscal_years": [2024, 2025],
            "include_active_projects": True,
        },
        "include_fields": [
            "ProjectNum",
            "ProjectTitle",
            "FiscalYear",
            "AwardAmount",
            "AgencyIcAdmin",
            "Organization",
            "PrincipalInvestigators",
            "ProjectStartDate",
            "ProjectEndDate",
        ],
        "limit": 25,
        "offset": 0,
    }

    try:
        results = search_projects(payload)
        print(f"\nFound {len(results)} K-award projects:\n")
        for i, project in enumerate(results[:5], start=1):
            pis = project.get("principal_investigators") or []
            pi_name = ""
            if pis:
                pi = pis[0]
                pi_name = f"{pi.get('first_name', '')} {pi.get('last_name', '')}"
            org = (project.get("organization") or {}).get("org_name", "")
            print(f"  [{i}] {project.get('project_num', '')}")
            print(f"      PI:    {pi_name}")
            print(f"      Title: {project.get('project_title', '')[:70]}...")
            print(f"      FY:    {project.get('fiscal_year', '')}")
            print(f"      $:     ${project.get('award_amount', 0):,}")
            print(f"      Inst:  {org}")
            print()

        if len(results) > 5:
            print(f"  ... ({len(results) - 5} more results)")
    except Exception as exc:
        print(f"[ERROR] {exc}")


def test_query_3_field_shape() -> None:
    """Inspect one full result to understand the JSON shape for ingestion design."""
    print("=" * 70)
    print("TEST 3: Full JSON shape of one project (for ingestion design)")
    print("=" * 70)

    payload = {
        "criteria": {
            "pi_names": [{"last_name": "Loomba", "first_name": "Rohit"}],
            "include_active_projects": True,
        },
        "limit": 1,
        "offset": 0,
    }

    try:
        results = search_projects(payload)
        if not results:
            print("No results returned.")
            return
        project = results[0]
        print(f"\nField keys available on a project record:\n")
        for key in sorted(project.keys()):
            value = project[key]
            value_type = type(value).__name__
            if isinstance(value, (list, dict)):
                size = len(value) if value else 0
                print(f"  {key:<35} {value_type}({size})")
            else:
                preview = str(value)[:60]
                print(f"  {key:<35} {value_type}: {preview}")
    except Exception as exc:
        print(f"[ERROR] {exc}")


def main() -> int:
    print("\nNIH RePORTER API feasibility test")
    print("API base: https://api.reporter.nih.gov/v2/projects/search")
    print()

    test_query_1_loomba()
    print()
    test_query_2_rising_stars_mash()
    print()
    test_query_3_field_shape()

    print()
    print("=" * 70)
    print("Test complete.")
    print("=" * 70)
    print("If all three queries returned data, the API is accessible and")
    print("the data shape is well-suited for FieldMark integration. Defer")
    print("actual implementation until v2 foundation is shipped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
