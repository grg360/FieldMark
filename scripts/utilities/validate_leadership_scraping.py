"""
validate_leadership_scraping.py — One-off validation of web scrape + LLM leadership extraction.

Runs Tavily search → trusted-domain fetch → trafilatura extract → Claude structured
extraction for 5 known NSCLC KOLs. Writes JSON to disk for manual recall/precision review.

Usage:
    python validate_leadership_scraping.py
    python validate_leadership_scraping.py --limit 2 --output results.json

Required environment variables (.env):
    ANTHROPIC_API_KEY
    TAVILY_API_KEY
"""

from __future__ import annotations

import json
import os
import time

import click
import requests
import trafilatura
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

client = Anthropic(api_key=ANTHROPIC_API_KEY)

# Ground-truth HCPs to validate against
HCPS = [
    {
        "name": "John V. Heymach",
        "institution": "MD Anderson Cancer Center",
        "known_roles": [
            "Chair, Thoracic/Head and Neck Medical Oncology",
            "NCCN NSCLC panel",
        ],
    },
    {
        "name": "Pasi A. Jänne",
        "institution": "Dana-Farber Cancer Institute",
        "known_roles": [
            "Director, Lowe Center for Thoracic Oncology",
            "Director, Belfer Center for Applied Cancer Science",
        ],
    },
    {
        "name": "Charles M. Rudin",
        "institution": "Memorial Sloan Kettering Cancer Center",
        "known_roles": [
            "Chief, Thoracic Oncology Service",
            "Co-Director, Druckenmiller Center for Lung Cancer Research",
        ],
    },
    {
        "name": "Roy S. Herbst",
        "institution": "Yale Cancer Center",
        "known_roles": [
            "Deputy Director, Yale Cancer Center",
            "Chief of Medical Oncology",
            "NCCN NSCLC panel",
        ],
    },
    {
        "name": "Helena A. Yu",
        "institution": "Memorial Sloan Kettering Cancer Center",
        "known_roles": [
            "Section Head, Lung Cancer Medical Oncology",
        ],
    },
]

# Trusted domains — we only extract leadership from these
TRUSTED_DOMAINS = [
    "mdanderson.org",
    "dana-farber.org",
    "dfci.harvard.edu",
    "mskcc.org",
    "yale.edu",
    "yalecancercenter.org",
    "mayo.edu",
    "asco.org",
    "esmo.org",
    "nccn.org",
    "aacr.org",
    "ascopubs.org",
    "annalsofoncology.org",
    "jto.org",
    "nejm.org",
    "nature.com",
    "jamanetwork.com",
    "thelancet.com",
]

EXTRACTION_PROMPT = """You are extracting leadership signals for {name} ({institution}) from a web page.

Identify named leadership roles for this specific individual ONLY. Do not extract:
- Roles for other people mentioned on the page
- Incidental uses of "chair" (e.g., "chaired the meeting", "session chair")
- Authorship of papers (that's not leadership)
- Membership without titled role

Extract ONLY clear, named, persistent leadership positions such as:
- Department Chair, Division Chief, Section Head, Program Director
- Center Director, Deputy Director, Co-Director
- NCCN/ASCO/ESMO guideline panel member (named panel)
- Editorial board / Editor / Associate Editor
- Society committee chair or named board

Return strictly valid JSON with this structure:
{{
  "evidence": [
    {{
      "role_type": "department_chair | division_chief | section_head | program_director | center_director | guideline_panel | editorial_board | society_committee | endowed_professor | other",
      "role_title": "exact title as stated",
      "organization": "named institution or organization",
      "snippet": "verbatim quote from source page that supports this role",
      "confidence": 0.0-1.0 (how confident this is a real, current role for this person)
    }}
  ]
}}

If no leadership evidence is found, return {{"evidence": []}}.

Page content:
---
{content}
"""


def is_trusted(url: str) -> bool:
    return any(domain in url for domain in TRUSTED_DOMAINS)


def search_tavily(query: str, max_results: int = 5) -> list[dict]:
    """Query Tavily API for a search term, return list of results."""
    url = "https://api.tavily.com/search"
    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "search_depth": "basic",
        "max_results": max_results,
        "include_raw_content": False,
    }
    try:
        response = requests.post(url, json=payload, timeout=20)
        response.raise_for_status()
        data = response.json()
        return data.get("results", [])
    except Exception as exc:
        print(f"  Tavily error for '{query}': {exc}")
        return []


def fetch_page_text(url: str) -> str | None:
    """Fetch URL, extract main content via trafilatura. Returns text or None."""
    try:
        response = requests.get(
            url,
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (FieldMark validation)"},
        )
        response.raise_for_status()
        text = trafilatura.extract(
            response.text,
            include_comments=False,
            include_tables=False,
        )
        if text and len(text) > 200:
            return text[:8000]
        return None
    except Exception as exc:
        print(f"  Fetch error for {url}: {exc}")
        return None


def parse_extraction_json(text: str) -> dict:
    """Parse Claude JSON response, stripping markdown fences if present."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        if len(parts) >= 2:
            cleaned = parts[1].strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
    return json.loads(cleaned)


def extract_leadership(name: str, institution: str, content: str, url: str) -> dict:
    """Call Claude to extract structured leadership evidence from page content."""
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": EXTRACTION_PROMPT.format(
                        name=name,
                        institution=institution,
                        content=content,
                    ),
                }
            ],
        )
        text = response.content[0].text.strip()
        parsed = parse_extraction_json(text)
        for ev in parsed.get("evidence", []):
            ev["source_url"] = url
        return parsed
    except Exception as exc:
        print(f"  Extraction error: {exc}")
        return {"evidence": [], "error": str(exc)}


def build_queries(name: str, institution: str) -> list[str]:
    """Generate diverse search queries for an HCP."""
    return [
        f'"{name}" "{institution}" faculty profile',
        f'"{name}" "{institution}" chair OR director',
        f'"{name}" NCCN panel',
        f'"{name}" editorial board',
        f'"{name}" guideline',
    ]


def validate_hcp(hcp: dict) -> dict:
    """Run full validation for one HCP. Returns dict with all evidence and metadata."""
    print(f"\n=== {hcp['name']} ({hcp['institution']}) ===")
    print(f"Known roles: {hcp['known_roles']}")

    queries = build_queries(hcp["name"], hcp["institution"])
    all_evidence: list[dict] = []
    pages_fetched = 0
    pages_extracted = 0

    for query in queries:
        print(f"\n  Query: {query}")
        results = search_tavily(query, max_results=5)

        trusted_results = [r for r in results if is_trusted(r.get("url", ""))]
        print(f"    {len(results)} results, {len(trusted_results)} trusted")

        for result in trusted_results[:3]:
            page_url = result.get("url")
            if not page_url:
                continue
            print(f"    Fetching: {page_url}")
            text = fetch_page_text(page_url)
            if not text:
                continue
            pages_fetched += 1

            evidence_result = extract_leadership(
                hcp["name"],
                hcp["institution"],
                text,
                page_url,
            )
            evidence_list = evidence_result.get("evidence", [])
            if evidence_list:
                pages_extracted += 1
                print(f"      → {len(evidence_list)} evidence items")
                for ev in evidence_list:
                    print(
                        f"        - {ev.get('role_title')} @ {ev.get('organization')} "
                        f"(conf {ev.get('confidence')})"
                    )
            all_evidence.extend(evidence_list)

            time.sleep(0.5)

    seen: set[tuple] = set()
    deduped: list[dict] = []
    for ev in all_evidence:
        key = (ev.get("role_type"), ev.get("organization"), ev.get("role_title"))
        if key not in seen:
            seen.add(key)
            deduped.append(ev)

    return {
        "hcp": hcp["name"],
        "institution": hcp["institution"],
        "known_roles": hcp["known_roles"],
        "pages_fetched": pages_fetched,
        "pages_with_extraction": pages_extracted,
        "evidence_count_raw": len(all_evidence),
        "evidence_count_deduped": len(deduped),
        "evidence": deduped,
    }


@click.command()
@click.option("--output", default="leadership_validation_results.json")
@click.option("--limit", default=None, type=int, help="Only run first N HCPs")
def main(output: str, limit: int | None) -> None:
    if not ANTHROPIC_API_KEY:
        raise click.ClickException("Missing ANTHROPIC_API_KEY in environment")
    if not TAVILY_API_KEY:
        raise click.ClickException("Missing TAVILY_API_KEY in environment")

    targets = HCPS[:limit] if limit else HCPS
    print(f"Validating leadership extraction on {len(targets)} HCPs\n")

    results = []
    for hcp in targets:
        results.append(validate_hcp(hcp))

    with open(output, "w", encoding="utf-8") as handle:
        json.dump(results, handle, indent=2, ensure_ascii=False)

    print("\n\n=== Summary ===")
    for result in results:
        recall_signals = [
            ev["role_title"]
            for ev in result["evidence"]
            if ev.get("confidence", 0) >= 0.7
        ]
        print(f"\n{result['hcp']}")
        print(f"  Known: {result['known_roles']}")
        print(f"  Found (conf ≥ 0.7): {recall_signals}")
        print(
            f"  Pages: {result['pages_fetched']} fetched, "
            f"{result['pages_with_extraction']} with evidence"
        )
        print(f"  Total deduped evidence items: {result['evidence_count_deduped']}")

    print(f"\nFull results saved to {output}")


if __name__ == "__main__":
    main()
