"""
established_npi_resolver.py — resolve missing NPIs (and practice location) for the
Established cohort of a therapeutic area, matching publication-side HCPs to the
NPPES provider registry.

WHY THIS EXISTS
---------------
Established HCPs are ingested from publications (OpenAlex/PubMed) and usually have
no NPI and no US practice state — so the frontend territory filter can't place them.
The community pipeline (community_nppes_backfill.py / nppes_matcher.py) is scoped to
the *community* cohort only, and the legacy all-cohort matcher
(archive/superseded/nppes_enrichment.py) was retired in the v2 rebuild. This tool is
the Established-cohort equivalent, built during the AD (atopic-dermatitis) launch.

MATCHING MODEL (precision-first — a wrong NPI puts the wrong location/payments on a
KOL's profile, which is worse than a blank field)
  1. Candidate set: no-NPI Established HCPs for the TA (hcp_established_ranks_v3,
     scope_type='global'), restricted to US / unknown country (non-US HCPs have no
     US NPI). NOTE: the ~500-pub gate used by targeted_nppes_enrichment.py is NOT
     applied — Established-cohort membership is already the quality filter, and AD
     authors rarely exceed a few dozen pubs.
  2. Surname normalization: strip accents/diacritics (NFKD) and normalize unicode
     hyphens; search NPPES across surname variants (full / hyphen->space /
     compressed / each hyphen component) so compound names (e.g. "Guttman-Yassky")
     actually get returned by the registry.
  3. Verification (whole-name, format-insensitive): NPPES record must match on exact
     first token AND whole-surname compressed-equality (accent/hyphen/space-insensitive
     — a lone component never validates a compound surname, preserving precision).
  4. TAXONOMY ALLOW-LIST (positive gate): the record's primary taxonomy must contain
     one of the allowed keywords (default: dermatolog / allergy / immunolog). This
     replaces a negative exclusion list, which let common-name collisions through to
     unrelated specialties (veterinarians, dentists, counselors). ***This list is
     TA-specific — override it per TA via --taxonomy-allow.***
  5. CONFIDENCE GATE: only a SINGLE verified, taxonomy-allowed NPPES record is written
     ("high"). Multiple verified candidates -> "ambiguous" (held null). Zero -> "no_match".
     The `match` step also emits review flags (common-name: many NPPES candidates;
     industry: institution looks like a pharma/biotech company) for human review.

WORKFLOW (two subcommands; writes are always fill-only + guarded)
  # 1) MATCH: live NPPES lookups -> proposals CSV (NO DB writes). Needs network access
  #    to npiregistry.cms.hhs.gov (run on the pipeline machine).
  python scripts/enrich/established_npi_resolver.py match --ta atopic-dermatitis \
         --out docs/ad_established_npi_proposals.csv

  # 2) Human review: delete rejected rows from the CSV (drop location-mismatch /
  #    industry-collision / wrong-person rows). The CSV that reaches `write` should
  #    contain ONLY approved rows. Manual additions (e.g. hyphenated-surname KOLs the
  #    registry search misses) can be hand-added as rows with proposed_npi/state/city.

  # 3) WRITE (dry-run default; --execute to commit): two fill-only steps.
  python scripts/enrich/established_npi_resolver.py write --ta atopic-dermatitis \
         --csv docs/ad_established_npi_proposals_approved.csv            # dry-run
  python scripts/enrich/established_npi_resolver.py write --ta atopic-dermatitis \
         --csv docs/ad_established_npi_proposals_approved.csv --execute  # commit

WRITE GUARDRAILS
  - hcp_id is resolved by exact DB name within the TA's Established cohort, with a hard
    uniqueness guard (a name resolving to != 1 hcp_id is EXCLUDED, never guessed).
  - Step 1 sets npi_number  ONLY WHERE npi_number IS NULL          (never overwrites).
  - Step 2 sets nppes_practice_state/city ONLY WHERE nppes_practice_state IS NULL.
  - Duplicate-NPI guard: a proposed NPI already held by a different hcps_v2 row is
    EXCLUDED (those are duplicate-HCP records — resolve via dedup/merge, not here).

REUSE ACROSS TAs
  --ta <slug> resolves the ta_id from the therapeutic_areas table, so this runs for any
  TA. Remember to set --taxonomy-allow to that TA's relevant specialties (e.g. oncology
  would use "oncology,hematolog"), and sanity-check the candidate country mix (heavily
  international cohorts have a small US-resolvable universe).

Env: SUPABASE .env with DATABASE_URL (service role). READ-ONLY for `match`; `write`
commits only under --execute.
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import time
import unicodedata

import psycopg
import requests
from dotenv import load_dotenv

load_dotenv()

NPPES_API = "https://npiregistry.cms.hhs.gov/api/"
DEFAULT_TAXONOMY_ALLOW = "dermatolog,allergy,immunolog"
COMMON_NAME_CANDIDATE_THRESHOLD = 8
INDUSTRY_RE = re.compile(
    r"\b(therapeutics|biotherapeutics|biosciences|biopharma|pharmaceuticals?|pharma|"
    r"biotech|inc|llc|ltd|corp(oration)?|incorporated|atara|genentech|regeneron|"
    r"pfizer|abbvie|sanofi|incyte|dermavant|arcutis|galderma|amgen|novartis|lilly|"
    r"boehringer|astrazeneca|bristol|gsk|glaxo|ucb|kyowa|dermira|aslan|sitryx|leo pharma)\b",
    re.I,
)


# ---------------------------------------------------------------- text helpers
def deacc(s: str) -> str:
    s = s or ""
    for h in ("‐", "‑", "‒", "–", "—", "−"):
        s = s.replace(h, "-")
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def compress(s: str) -> str:
    return re.sub(r"[^a-z]", "", deacc(s).lower())


def nfull(s: str) -> str:
    return re.sub(r"\s+", " ", deacc(s).strip().lower())


def first_tok(s: str) -> str:
    t = deacc(s or "").strip().split()
    return t[0] if t else ""


def surname_variants(last: str) -> list[str]:
    base = deacc(last or "").strip()
    out: list[str] = []
    for v in (base, base.replace("-", " "), base.replace("-", ""), *re.split(r"[-\s]+", base)):
        v = v.strip()
        if v and len(v) >= 3 and v not in out:
            out.append(v)
    return out


# ---------------------------------------------------------------- NPPES helpers
def primary_taxonomy(rec: dict) -> str:
    tx = rec.get("taxonomies") or []
    for t in tx:
        if t.get("primary"):
            return t.get("desc") or ""
    return tx[0].get("desc", "") if tx else ""


def location(rec: dict) -> tuple[str, str]:
    for a in rec.get("addresses") or []:
        if (a.get("address_purpose") or "").lower() == "location":
            return (a.get("state") or "").upper(), a.get("city") or ""
    a = (rec.get("addresses") or [{}])[0]
    return (a.get("state") or "").upper(), a.get("city") or ""


def is_verified(fn: str, ln: str, rec: dict, allow: tuple[str, ...]) -> bool:
    b = rec.get("basic") or {}
    ft = first_tok(fn)
    if not ft or compress(b.get("first_name")) != compress(ft):
        return False
    if compress(b.get("last_name")) != compress(ln):
        return False
    return any(k in (primary_taxonomy(rec) or "").lower() for k in allow)


def nppes_search(fn_tok: str, last: str, state: str) -> list[dict]:
    params = {"version": "2.1", "first_name": fn_tok, "last_name": last,
              "state": (state or "").strip(), "limit": 20}
    try:
        r = requests.get(NPPES_API, params=params, timeout=20)
        return (r.json().get("results") or []) if r.ok else []
    except Exception:
        return []
    finally:
        time.sleep(0.11)


def gather(fn: str, ln: str, state: str, allow: tuple[str, ...]) -> list[dict]:
    ft = first_tok(fn)
    seen: dict[str, dict] = {}
    for v in surname_variants(ln):
        for st in ([state, ""] if state else [""]):
            for r in nppes_search(ft, v, st):
                npi = r.get("number")
                if npi and npi not in seen:
                    seen[npi] = r
            if any(is_verified(fn, ln, r, allow) for r in seen.values()):
                return list(seen.values())
    return list(seen.values())


def score(fn: str, ln: str, results: list[dict], allow: tuple[str, ...]) -> tuple[str, dict | None]:
    verified = [r for r in results if is_verified(fn, ln, r, allow)]
    if not verified:
        return ("no_match", None)
    if len(verified) == 1:
        return ("high", verified[0])
    return ("ambiguous", None)   # multiple verified -> hold null


# ---------------------------------------------------------------- DB helpers
def connect() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set in .env")
    return psycopg.connect(url)


def resolve_ta_id(cur, slug: str) -> str:
    cur.execute("SELECT id::text FROM therapeutic_areas WHERE slug = %s", (slug,))
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"No therapeutic_area with slug={slug!r}")
    return row[0]


# ---------------------------------------------------------------- subcommand: match
def cmd_match(args) -> None:
    allow = tuple(k.strip().lower() for k in args.taxonomy_allow.split(",") if k.strip())
    con = connect()
    cur = con.cursor()
    ta_id = resolve_ta_id(cur, args.ta)
    cur.execute(f"""
        SELECT * FROM (
          SELECT DISTINCT ON (h.id)
            r.rank, h.first_name, h.last_name, h.institution_normalized,
            h.derived_state, COALESCE(h.country,'') AS country
          FROM hcp_established_ranks_v3 r JOIN hcps_v2 h ON h.id = r.hcp_id
          WHERE r.therapeutic_area_id = %s AND r.scope_type = 'global'
            AND h.npi_number IS NULL
          ORDER BY h.id, r.rank
        ) t ORDER BY t.rank
    """, (ta_id,))
    rows = [dict(rank=a, fn=b, ln=c, inst=d, dstate=(e or "").upper(), country=g.upper())
            for a, b, c, d, e, g in cur.fetchall()]
    con.close()

    us = [r for r in rows if r["country"] in ("US", "USA", "")]
    print(f"[{args.ta}] no-NPI Established: {len(rows)} | US/unknown (querying NPPES): {len(us)} "
          f"| taxonomy allow-list: {allow}")

    highs, counts = [], {"high": 0, "ambiguous": 0, "no_match": 0}
    for r in us:
        results = gather(r["fn"], r["ln"], r["dstate"], allow)
        label, rec = score(r["fn"], r["ln"], results, allow)
        counts[label] += 1
        if label == "high" and rec:
            st, city = location(rec)
            b = rec.get("basic") or {}
            r.update(npi=rec.get("number"), nstate=st, ncity=city,
                     ntax=primary_taxonomy(rec), ncand=len(results),
                     nname=f"{b.get('first_name','')} {b.get('last_name','')}".strip())
            highs.append(r)

    print(f"  HIGH={counts['high']}  AMBIGUOUS={counts['ambiguous']}  NO_MATCH={counts['no_match']}")

    with open(args.out, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["rank", "hcp_name", "institution", "country", "proposed_npi",
                    "matched_nppes_name", "state", "city", "taxonomy",
                    "nppes_candidate_count", "review_flag"])
        for r in sorted(highs, key=lambda x: x["rank"]):
            reasons = []
            if r["ncand"] >= COMMON_NAME_CANDIDATE_THRESHOLD:
                reasons.append("common name")
            if INDUSTRY_RE.search(r["inst"] or ""):
                reasons.append("industry")
            flag = f"REVIEW ({'; '.join(reasons)})" if reasons else ""
            w.writerow([r["rank"], f"{r['fn']} {r['ln']}".strip(), r["inst"] or "",
                        r["country"] or "", r["npi"], r["nname"], r["nstate"], r["ncity"],
                        r["ntax"], r["ncand"], flag])
    print(f"[match] wrote {len(highs)} proposals -> {args.out}  "
          f"(flagged {sum(1 for r in highs if r['ncand'] >= COMMON_NAME_CANDIDATE_THRESHOLD or INDUSTRY_RE.search(r['inst'] or ''))})")


# ---------------------------------------------------------------- subcommand: write
def cmd_write(args) -> None:
    with open(args.csv, encoding="utf-8-sig") as f:
        approved = list(csv.DictReader(f))
    print(f"[write] approved rows in CSV: {len(approved)}  (dry-run={not args.execute})")

    con = connect()
    cur = con.cursor()
    ta_id = resolve_ta_id(cur, args.ta)
    cur.execute("""
        SELECT DISTINCT h.id::text, h.first_name, h.last_name, h.npi_number, h.nppes_practice_state
        FROM hcp_established_ranks_v3 r JOIN hcps_v2 h ON h.id = r.hcp_id
        WHERE r.therapeutic_area_id = %s AND r.scope_type = 'global'
    """, (ta_id,))
    pool: dict[str, list] = {}
    for hid, fn, ln, npi, st in cur.fetchall():
        pool.setdefault(nfull(f"{fn} {ln}"), []).append((hid, npi, st))

    plan, issues = [], []
    for r in approved:
        key, npi = nfull(r["hcp_name"]), (r["proposed_npi"] or "").strip()
        m = pool.get(key, [])
        if len(m) != 1:
            issues.append((r["hcp_name"], npi, f"name resolves to {len(m)} hcp_ids -> EXCLUDED"))
            continue
        hid, cur_npi, cur_state = m[0]
        if cur_npi:
            issues.append((r["hcp_name"], npi, f"already has npi {cur_npi} -> skip (fill-only)"))
            continue
        cur.execute("SELECT id::text FROM hcps_v2 WHERE npi_number = %s", (npi,))
        other = [x[0] for x in cur.fetchall() if x[0] != hid]
        if other:
            issues.append((r["hcp_name"], npi, f"NPI already on other hcp {other[0][:8]} -> EXCLUDED"))
            continue
        plan.append(dict(hid=hid, name=r["hcp_name"], npi=npi,
                         state=r.get("state") or "", city=r.get("city") or "",
                         cur_state=cur_state))

    print(f"=== WRITE PLAN: {len(plan)} HCPs | excluded/skipped: {len(issues)} ===")
    for p in sorted(plan, key=lambda x: x["name"]):
        sc = "(has state, skip step2)" if p["cur_state"] else f"{p['state']}/{p['city']}"
        print(f"  {p['name']:<28} id={p['hid'][:8]} npi={p['npi']} state->{sc}")
    for n, npi, why in issues:
        print(f"  [skip] {n:<24} npi={npi}  {why}")

    if not args.execute:
        print("[DRY RUN] no writes. Re-run with --execute to commit.")
        con.close()
        return

    s1 = s2 = 0
    for p in plan:
        cur.execute("UPDATE hcps_v2 SET npi_number = %s WHERE id = %s AND npi_number IS NULL",
                    (p["npi"], p["hid"]))
        s1 += cur.rowcount
    for p in plan:
        cur.execute("UPDATE hcps_v2 SET nppes_practice_state = %s, nppes_practice_city = %s "
                    "WHERE id = %s AND nppes_practice_state IS NULL",
                    (p["state"], p["city"], p["hid"]))
        s2 += cur.rowcount
    con.commit()
    print(f"[EXECUTED] npi_number set: {s1} | practice_state/city set: {s2}")
    cur.execute("""
        SELECT count(DISTINCT r.hcp_id) FROM hcp_established_ranks_v3 r
        JOIN hcps_v2 h ON h.id = r.hcp_id
        WHERE r.therapeutic_area_id = %s AND r.scope_type = 'global'
          AND h.nppes_practice_state IS NOT NULL
    """, (ta_id,))
    print(f"[COVERAGE] {args.ta} Established (global) with practice_state: {cur.fetchone()[0]}")
    con.close()


def main() -> None:
    p = argparse.ArgumentParser(description="Resolve Established-cohort NPIs + practice location via NPPES.")
    p.add_argument("--ta", default="atopic-dermatitis", help="therapeutic_areas.slug (default: atopic-dermatitis)")
    sub = p.add_subparsers(dest="cmd", required=True)

    m = sub.add_parser("match", help="live NPPES lookups -> proposals CSV (no writes)")
    m.add_argument("--out", required=True, help="output proposals CSV path")
    m.add_argument("--taxonomy-allow", default=DEFAULT_TAXONOMY_ALLOW,
                   help=f"comma-separated taxonomy keywords (default: {DEFAULT_TAXONOMY_ALLOW})")
    m.set_defaults(func=cmd_match)

    w = sub.add_parser("write", help="fill-only two-step write from an approved CSV")
    w.add_argument("--csv", required=True, help="approved proposals CSV (only rows to write)")
    w.add_argument("--execute", action="store_true", help="commit (omit for dry-run)")
    w.set_defaults(func=cmd_write)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
