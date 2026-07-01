"""
scrape_leadership_signals.py — Production leadership signal scraping for top Established HCPs.

Faculty-page-first strategy: Phase 1 faculty profile query, Phase 2 peripheral
queries only if Phase 1 yields fewer than 2 evidence items. Persists to
hcp_leadership_evidence.

Usage:
    python scrape_leadership_signals.py --ta nsclc --scope-type region --scope-value US --limit 200
    python scrape_leadership_signals.py --start-at 50 --limit 100

Required environment variables (.env):
    ANTHROPIC_API_KEY
    TAVILY_API_KEY
    DATABASE_URL
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime
from urllib.parse import urlparse
from uuid import uuid4

import click
import psycopg2
import requests
import trafilatura
from anthropic import Anthropic
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor, execute_values

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

client = Anthropic(api_key=ANTHROPIC_API_KEY)

# === Domain whitelist ===
INSTITUTIONAL_DOMAINS = [
    "mdanderson.org",
    "dana-farber.org",
    "dfci.harvard.edu",
    "mskcc.org",
    "yale.edu",
    "yalecancercenter.org",
    "stanford.edu",
    "stanfordhealthcare.org",
    "ucsf.edu",
    "ucsfhealth.org",
    "uclahealth.org",
    "ucla.edu",
    "mayo.edu",
    "mayoclinic.org",
    "hopkinsmedicine.org",
    "jhmi.edu",
    "vumc.org",
    "vanderbilt.edu",
    "northwestern.edu",
    "nm.org",
    "lurie.org",
    "upenn.edu",
    "pennmedicine.org",
    "duke.edu",
    "dukehealth.org",
    "wustl.edu",
    "barnesjewish.org",
    "siteman.wustl.edu",
    "uchicago.edu",
    "uchicagomedicine.org",
    "rochester.edu",
    "urmc.rochester.edu",
    "med.unc.edu",
    "unclineberger.org",
    "med.miami.edu",
    "sylvester.org",
    "med.usc.edu",
    "uscnorris.com",
    "mountsinai.org",
    "icahn.mssm.edu",
    "weill.cornell.edu",
    "med.cornell.edu",
    "nyp.org",
    "columbia.edu",
    "cuimc.columbia.edu",
    "med.nyu.edu",
    "perlmutter.med.nyu.edu",
    "cityofhope.org",
    "moffitt.org",
    "foxchase.org",
    "roswellpark.org",
    "huntsmancancer.org",
    "huntsman.utah.edu",
    "karmanos.org",
    "massgeneral.org",
    "mghpartners.org",
    "bidmc.org",
    "brighamandwomens.org",
    "ohsu.edu",
    "knightcancer.ohsu.edu",
    "uw.edu",
    "fredhutch.org",
    "iuhealth.org",
    "medicine.iu.edu",
    "umich.edu",
    "rogelcancercenter.org",
    "med.umich.edu",
    "georgetown.edu",
    "lombardi.georgetown.edu",
    "med.emory.edu",
    "winshipcancer.emory.edu",
    "med.virginia.edu",
    "uvahealth.com",
    "uphs.upenn.edu",
    "henryford.com",
    "vacancercenter.com",
    "sarahcannon.com",
    "ucdmc.ucdavis.edu",
    "health.ucdavis.edu",
    "mc.vanderbilt.edu",
]

SOCIETY_DOMAINS = [
    "asco.org",
    "ascopubs.org",
    "esmo.org",
    "aacr.org",
    "aacrjournals.org",
    "jto.org",
    "annalsofoncology.org",
    "nejm.org",
    "thelancet.com",
    "jamanetwork.com",
    "nature.com",
    "bmj.com",
    "iaslc.org",
    "nccn.org",
    "cancer.org",
    "cancer.gov",
]

ALL_TRUSTED = set(INSTITUTIONAL_DOMAINS + SOCIETY_DOMAINS)


def domain_trust_level(url: str) -> str:
    """Returns 'high', 'medium', or 'low'."""
    domain = urlparse(url).netloc.lower()
    if any(d in domain for d in ALL_TRUSTED):
        return "high"
    if domain.endswith(".edu") or domain.endswith(".gov") or domain.endswith(".org"):
        return "medium"
    return "low"


def build_phase_1_query(name: str, institution: str) -> str:
    """Single targeted query to find the institutional faculty page."""
    return f'"{name}" "{institution}" faculty profile'


def build_phase_2_queries(name: str, institution: str) -> list[tuple[str, int]]:
    """Returns (query, tier) tuples for peripheral signal hunting."""
    return [
        (f'"{name}" "{institution}" chair', 1),
        (f'"{name}" "{institution}" "division chief"', 1),
        (f'"{name}" "{institution}" "program director"', 1),
        (f'"{name}" "{institution}" "center director"', 1),
        (f'"{name}" "{institution}" lung cancer program', 2),
        (f'"{name}" "{institution}" thoracic oncology', 2),
        (f'"{name}" "clinical practice guideline"', 3),
        (f'"{name}" ASCO guideline', 3),
        (f'"{name}" ESMO guideline', 3),
        (f'"{name}" editorial board', 4),
        (f'"{name}" associate editor', 4),
        (f'"{name}" ASCO committee', 5),
        (f'"{name}" ESMO committee', 5),
    ]


def search_tavily(query: str, max_results: int = 5) -> list[dict]:
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
        return response.json().get("results", [])
    except Exception as exc:
        print(f"    Tavily error: {exc}")
        return []


def fetch_page_text(url: str) -> str | None:
    try:
        response = requests.get(
            url,
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (FieldMark research bot)"},
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
    except Exception:
        return None


EXTRACTION_PROMPT = """You are extracting leadership signals for {name} ({institution}) from a web page.

Identify named leadership roles for this specific individual ONLY. Do not extract:
- Roles for other people on the page
- Incidental uses of "chair" (e.g., "session chair", "chaired the meeting")
- Authorship of papers (not leadership unless guideline panel)
- General membership without titled role
- Commercial/company roles (co-founder, advisor) — only academic/clinical leadership

Extract ONLY clear, named, persistent leadership positions:
- Department Chair, Division Chief, Section Head/Chief, Program Director, Center Director, Deputy Director
- Endowed Professor or Endowed Chair positions
- Guideline panel member or chair (NCCN, ASCO, ESMO, etc.)
- Journal editorial board / Editor / Associate Editor / Deputy Editor
- Society leadership: committee chair, board of directors, scientific committee
- Cancer center program leadership (e.g., "Lung Cancer Program Leader")

Return strictly valid JSON with this structure:
{{
  "evidence": [
    {{
      "tier": 1-5 (1=institutional, 2=disease program, 3=guideline, 4=editorial, 5=society),
      "role_type": "department_chair | division_chief | section_head | program_director | center_director | deputy_director | endowed_chair | guideline_panel | editorial_board | society_committee | other",
      "role_title": "exact title as stated",
      "organization": "named institution or organization",
      "snippet": "verbatim quote from source page that supports this role (max 300 chars)",
      "confidence": 0.0-1.0
    }}
  ]
}}

If no leadership evidence is found, return {{"evidence": []}}.

Page content:
---
{content}
"""


def parse_extraction_json(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        if len(parts) >= 2:
            cleaned = parts[1].strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
    return json.loads(cleaned)


def extract_leadership(
    name: str,
    institution: str,
    content: str,
    url: str,
    trust: str,
) -> list[dict]:
    """Returns list of evidence dicts. Caps confidence based on trust level."""
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
        evidence = parsed.get("evidence", [])
        if trust == "medium":
            for item in evidence:
                item["confidence"] = min(item.get("confidence", 0.5), 0.85)
        domain = urlparse(url).netloc.lower()
        for item in evidence:
            item["source_url"] = url
            item["source_domain"] = domain
        return evidence
    except Exception as exc:
        print(f"    Extraction error: {exc}")
        return []


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def fetch_target_hcps(
    conn,
    ta_slug: str,
    scope_type: str,
    scope_value: str,
    limit: int,
) -> list[dict]:
    """Top N HCPs by Established rank for given TA + scope."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
              er.hcp_id,
              er.rank,
              er.first_name,
              er.last_name,
              er.institution_normalized AS institution
            FROM hcp_established_ranks_v2 er
            JOIN therapeutic_areas ta ON ta.id = er.therapeutic_area_id
            WHERE ta.slug = %s
              AND er.scope_type = %s
              AND er.scope_value = %s
            ORDER BY er.rank
            LIMIT %s
            """,
            (ta_slug, scope_type, scope_value, limit),
        )
        return cur.fetchall()


def persist_evidence(
    conn,
    hcp_id: str,
    evidence_list: list[dict],
    run_id: str,
    ta_slug: str,
    model_name: str,
) -> int:
    """Insert evidence rows. UNIQUE constraint handles deduplication."""
    if not evidence_list:
        return 0
    # Dedupe within batch by unique constraint key:
    # (hcp_id, role_type, organization, source_url)
    # Keep the highest-confidence row per key.
    by_key: dict[tuple, dict] = {}
    for item in evidence_list:
        key = (
            item.get("role_type", "other"),
            item.get("organization", ""),
            item.get("source_url", ""),
        )
        confidence = float(item.get("confidence", 0.5))
        if key not in by_key or confidence > float(by_key[key].get("confidence", 0.0)):
            by_key[key] = item

    rows = []
    for item in by_key.values():
        rows.append(
            (
                str(hcp_id),
                item.get("tier"),
                item.get("role_type", "other"),
                item.get("role_title", ""),
                item.get("organization", ""),
                (item.get("snippet", "") or "")[:1000],
                item.get("source_url", ""),
                item.get("source_domain", ""),
                float(item.get("confidence", 0.5)),
                model_name,
                ta_slug,
                run_id,
            )
        )
    try:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO hcp_leadership_evidence
                  (hcp_id, tier, role_type, role_title, organization, snippet,
                   source_url, source_domain, confidence, extraction_model,
                   therapeutic_area, enrichment_run_id)
                VALUES %s
                ON CONFLICT (hcp_id, role_type, organization, source_url)
                DO UPDATE SET
                  last_seen_at = now(),
                  confidence = GREATEST(hcp_leadership_evidence.confidence, EXCLUDED.confidence),
                  snippet = COALESCE(EXCLUDED.snippet, hcp_leadership_evidence.snippet)
                """,
                rows,
            )
        conn.commit()
        return len(rows)
    except Exception as exc:
        conn.rollback()
        print(f"    persist_evidence error (rolled back): {exc}")
        return 0


def scrape_hcp(
    conn,
    hcp: dict,
    run_id: str,
    ta_slug: str,
    model_name: str,
) -> dict:
    """Faculty-first scraping flow. Phase 2 only if Phase 1 yields <2 evidence."""
    name = f"{hcp['first_name']} {hcp['last_name']}"
    institution = hcp["institution"] or ""
    print(f"\n[#{hcp['rank']}] {name} ({institution})")

    fetched_urls: set[str] = set()
    pages_extracted = 0
    total_evidence_count = 0
    phase_1_evidence = 0

    p1_query = build_phase_1_query(name, institution)
    p1_results = search_tavily(p1_query, max_results=5)

    for result in p1_results:
        page_url = result.get("url")
        if not page_url or page_url in fetched_urls:
            continue
        trust = domain_trust_level(page_url)
        if trust == "low":
            continue
        fetched_urls.add(page_url)
        text = fetch_page_text(page_url)
        if not text:
            continue
        evidence = extract_leadership(name, institution, text, page_url, trust)
        if evidence:
            for item in evidence:
                if not item.get("tier"):
                    item["tier"] = 1
            inserted = persist_evidence(
                conn,
                hcp["hcp_id"],
                evidence,
                run_id,
                ta_slug,
                model_name,
            )
            pages_extracted += 1
            phase_1_evidence += inserted
            total_evidence_count += inserted
            print(f"    Phase 1 {trust} {page_url[:80]}")
            print(f"      → {inserted} evidence")
        time.sleep(0.3)

    if phase_1_evidence >= 2:
        print(f"    Faculty page yielded {phase_1_evidence} evidence — skipping Phase 2")
        return {
            "hcp_id": hcp["hcp_id"],
            "name": name,
            "rank": hcp["rank"],
            "pages_fetched": len(fetched_urls),
            "pages_with_evidence": pages_extracted,
            "evidence_inserted": total_evidence_count,
            "phase_2_run": False,
        }

    print(f"    Faculty page yielded {phase_1_evidence} evidence — proceeding to Phase 2")
    time.sleep(0.5)

    p2_queries = build_phase_2_queries(name, institution)

    for query, tier in p2_queries:
        results = search_tavily(query, max_results=5)
        if not results:
            continue
        for result in results:
            page_url = result.get("url")
            if not page_url or page_url in fetched_urls:
                continue
            trust = domain_trust_level(page_url)
            if trust == "low":
                continue
            fetched_urls.add(page_url)
            text = fetch_page_text(page_url)
            if not text:
                continue
            evidence = extract_leadership(name, institution, text, page_url, trust)
            if evidence:
                for item in evidence:
                    item["tier"] = tier
                inserted = persist_evidence(
                    conn,
                    hcp["hcp_id"],
                    evidence,
                    run_id,
                    ta_slug,
                    model_name,
                )
                pages_extracted += 1
                total_evidence_count += inserted
                print(f"    Phase 2 T{tier} {trust} {page_url[:80]}")
                print(f"      → {inserted} evidence")
            time.sleep(0.3)
        time.sleep(0.5)

    return {
        "hcp_id": hcp["hcp_id"],
        "name": name,
        "rank": hcp["rank"],
        "pages_fetched": len(fetched_urls),
        "pages_with_evidence": pages_extracted,
        "evidence_inserted": total_evidence_count,
        "phase_2_run": True,
    }


@click.command()
@click.option("--ta", default="nsclc", help="Therapeutic area slug")
@click.option("--scope-type", default="region", help="Rank scope type")
@click.option("--scope-value", default="US", help="Rank scope value")
@click.option("--limit", default=200, help="Top N HCPs to process")
@click.option("--model", default="claude-sonnet-4-6", help="Claude model for extraction")
@click.option("--start-at", default=0, help="Start at rank N (for resume)")
def main(
    ta: str,
    scope_type: str,
    scope_value: str,
    limit: int,
    model: str,
    start_at: int,
) -> None:
    if not ANTHROPIC_API_KEY:
        raise click.ClickException("Missing ANTHROPIC_API_KEY")
    if not TAVILY_API_KEY:
        raise click.ClickException("Missing TAVILY_API_KEY")
    if not DATABASE_URL:
        raise click.ClickException("Missing DATABASE_URL")

    conn = get_conn()
    run_id = str(uuid4())

    print(f"Run ID: {run_id}")
    print(f"Loading top {limit} HCPs (ta={ta}, scope={scope_type}/{scope_value})...")

    hcps = fetch_target_hcps(conn, ta, scope_type, scope_value, limit)
    if start_at > 0:
        hcps = [h for h in hcps if h["rank"] >= start_at]
    print(f"Processing {len(hcps)} HCPs starting at rank {start_at if start_at else 1}")

    started = datetime.now()
    results: list[dict] = []

    for hcp in hcps:
        try:
            result = scrape_hcp(conn, hcp, run_id, ta, model)
            results.append(result)
            if len(results) % 5 == 0:
                elapsed = (datetime.now() - started).total_seconds()
                rate = len(results) / elapsed
                eta_min = (len(hcps) - len(results)) / rate / 60 if rate > 0 else 0
                total_evidence = sum(r["evidence_inserted"] for r in results)
                print(
                    f"\n  ----- Progress: {len(results)}/{len(hcps)} | "
                    f"{total_evidence} evidence rows | ETA: {eta_min:.1f} min -----"
                )
        except Exception as exc:
            print(f"  ERROR on {hcp.get('last_name')}: {exc}")

    elapsed = (datetime.now() - started).total_seconds()
    total_evidence = sum(r["evidence_inserted"] for r in results)
    phase_2_count = sum(1 for r in results if r.get("phase_2_run"))
    print(f"\n\nComplete in {elapsed / 60:.1f} min")
    print(f"  HCPs processed: {len(results)}")
    print(f"  Total evidence rows: {total_evidence}")
    print(f"  Avg per HCP: {total_evidence / len(results) if results else 0:.1f}")
    print(
        f"  Phase 2 needed: {phase_2_count}/{len(results)} HCPs "
        f"({phase_2_count * 100 // len(results) if results else 0}%)"
    )
    print(f"\nRun ID: {run_id}")

    conn.close()


if __name__ == "__main__":
    main()
