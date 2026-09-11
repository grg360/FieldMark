"""
cms_geography_anchor_probe.py -- does the CRC anchor absence come from suppression, or
from site of care?

READ-ONLY. Touches no database, writes no data, needs no credentials. It queries the
public data.cms.gov API and prints a table. Run it whenever convenient; nothing is
blocked on it.

    python scripts/utilities/cms_geography_anchor_probe.py
    python scripts/utilities/cms_geography_anchor_probe.py --years 2021 2022 2023


THE QUESTION
------------
J9303 panitumumab, J9055 cetuximab and J9400 ziv-aflibercept have ZERO rows in the
CMS "Physician & Other Practitioners -- by Provider and Service" files we hold, for
2021, 2022 and 2023. Verified against both the parquets and the raw CSVs. Those are the
three codes the clinical advisor designated to carry colorectal's `strict` anchor tier,
so their absence removes the anchor arm of the CRC evidence model entirely.

There are two possible reasons and they have opposite consequences:

  SUPPRESSION      CMS redacts any provider x HCPCS x place-of-service row with fewer
                   than 11 distinct beneficiaries. If these drugs are given in offices
                   but thinly per provider, every row is redacted and the drug vanishes
                   at provider grain while still existing in the programme.
                   -> The anchors are REAL but UNOBSERVABLE at provider grain. We would
                      need a different grain or a different dataset, and the tier model
                      could still be right.

  SITE OF CARE     These are given hospital-outpatient, billed under OPPS, and therefore
                   never appear in a non-institutional practitioner file at all.
                   -> The anchors DO NOT EXIST in Part B practitioner data, at any grain,
                      and no dataset of this family recovers them. The evidence model
                      must be pattern-level, permanently.

THE TEST
--------
The "by Geography and Service" file is built from the same Part B non-institutional
claims but aggregated to national/state level before redaction is applied. A drug
suppressed at provider grain still surfaces nationally, because the national cell is far
above 11 beneficiaries.

  present nationally, zero at NPI level -> SUPPRESSION
  absent or negligible nationally too   -> SITE OF CARE

The file also carries Place_Of_Srvc (F = facility, O = non-facility/office), which is a
second, independent read on the same question.


MY STATED PRIOR, RECORDED BEFORE THE RESULT
-------------------------------------------
I expect SITE OF CARE, and the reasoning should be on the record so the result is read
against it rather than after it.

Redaction removes LOW-VOLUME provider rows. It does not remove drugs. In the same 2023
file, bevacizumab J9035 survives on 1,854 provider rows and oxaliplatin J9263 on 516 --
so the 11-beneficiary floor is plainly not erasing oncology infusions as a class. For
panitumumab and cetuximab to hit exactly zero, EVERY administering provider in the United
States would have to fall below 11 Medicare beneficiaries for that code in that year.
Cetuximab in particular is a long-established agent with head-and-neck use on top of
colorectal; a complete provider-level wipeout by redaction alone is a strong claim.

Zero is a suspicious shape for suppression. Suppression produces a thinned tail -- which
is visible here: J9035 on 1,854 rows, Q5126 on 29, Q5129 on 1. It does not usually
produce nothing at all.

IF I AM WRONG and these appear nationally in volume, the consequence is good news and a
real change of plan: the anchor tier becomes recoverable at a coarser grain, and the
question shifts to whether any provider-attributable dataset can carry it.

IF I AM RIGHT, the CRC evidence model stays pattern-level permanently, and the composite
practice fingerprint in CRC_COMMUNITY_BUILD.md is not a workaround -- it is the design.

Either way this settles it factually. Do not read the absence as confirming the prior
without running it; a bulk download of the same file is an equally valid way to answer,
and this script exists only because it is cheaper.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

# data.cms.gov dataset: "Medicare Physician & Other Practitioners - by Geography and Service".
# Distribution UUIDs change with each annual release, so the script RESOLVES them from the
# catalog rather than hard-coding an id that would silently rot.
CATALOG_URL = "https://data.cms.gov/data.json"
DATASET_TITLE_MATCH = "by geography and service"

ANCHOR_CODES = ["J9303", "J9055", "J9400"]
# Controls: present in our provider-level data, so they prove the query itself works.
CONTROL_CODES = ["J9035", "J9263"]

TIMEOUT = 60


def _get(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "fieldmark-anchor-probe/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def resolve_distributions(years: List[int]) -> Dict[int, str]:
    """year -> distribution id, resolved from the CMS catalog."""
    try:
        catalog = _get(CATALOG_URL)
    except Exception as exc:
        raise SystemExit(
            f"Could not reach the CMS catalog ({exc}).\n"
            "  The API may be down, or this machine may be behind a proxy. Falling back to a\n"
            "  bulk download of the same file is a valid alternative -- see the module docstring."
        )
    found: Dict[int, str] = {}
    for ds in catalog.get("dataset", []):
        title = str(ds.get("title") or "")
        if DATASET_TITLE_MATCH not in title.lower():
            continue
        for year in years:
            if str(year) not in title:
                continue
            for dist in ds.get("distribution") or []:
                url = str(dist.get("accessURL") or dist.get("downloadURL") or "")
                if "/data-viewer" in url or "/api/1/datastore" in url:
                    ident = url.rstrip("/").split("/")[-1].split("?")[0]
                    if ident:
                        found.setdefault(year, ident)
    return found


def query_code(dist_id: str, code: str) -> Optional[List[Dict[str, Any]]]:
    """National-level rows for one HCPCS code, all places of service."""
    params = {
        "conditions[0][property]": "HCPCS_Cd",
        "conditions[0][value]": code,
        "conditions[0][operator]": "=",
        "conditions[1][property]": "Rndrng_Prvdr_Geo_Lvl",
        "conditions[1][value]": "National",
        "conditions[1][operator]": "=",
        "limit": "50",
    }
    url = f"https://data.cms.gov/data-api/v1/dataset/{dist_id}/data?" + urllib.parse.urlencode(params)
    try:
        return _get(url)
    except urllib.error.HTTPError as exc:
        print(f"    [HTTP {exc.code}] {code}: {exc.reason}", file=sys.stderr)
        return None
    except Exception as exc:
        print(f"    [ERROR] {code}: {exc}", file=sys.stderr)
        return None


def summarise(rows: List[Dict[str, Any]]) -> str:
    if not rows:
        return "no national rows"
    out = []
    for r in rows:
        pos = r.get("Place_Of_Srvc") or r.get("Plc_Of_Srvc") or "?"
        benes = r.get("Tot_Benes") or r.get("Tot_Bene_Cnt") or "?"
        srvcs = r.get("Tot_Srvcs") or "?"
        prov = r.get("Tot_Rndrng_Prvdrs") or r.get("Tot_Prvdrs") or "?"
        out.append(f"POS={pos} benes={benes} srvcs={srvcs} providers={prov}")
    return " | ".join(out)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--years", nargs="+", type=int, default=[2021, 2022, 2023])
    args = ap.parse_args()

    print("CMS Physician & Other Practitioners -- by Geography and Service")
    print("National-level probe for the CRC anchor codes. Read-only.\n")
    print("PRIOR ON RECORD: site of care, not suppression. Zero is a suspicious shape for")
    print("redaction -- see the module docstring for the reasoning, written before the result.\n")

    dists = resolve_distributions(args.years)
    missing = [y for y in args.years if y not in dists]
    if missing:
        print(f"[WARN] no distribution resolved for: {missing}. CMS may have renamed the")
        print("       dataset or changed its catalog shape; check data.cms.gov by hand.\n")
    if not dists:
        raise SystemExit("No distributions resolved -- nothing to query.")

    for year in sorted(dists):
        print(f"=== {year}  (distribution {dists[year]}) ===")
        for label, codes in (("ANCHOR ", ANCHOR_CODES), ("control", CONTROL_CODES)):
            for code in codes:
                rows = query_code(dists[year], code)
                if rows is None:
                    continue
                print(f"  {label} {code}: {summarise(rows)}")
        print()

    print("HOW TO READ IT")
    print("  Controls J9035/J9263 must return national rows. If they do not, the query is")
    print("  wrong and the anchor result means nothing -- fix that before concluding.")
    print("  Anchors present nationally  -> SUPPRESSION: real but unobservable at NPI grain.")
    print("  Anchors absent nationally   -> SITE OF CARE: not in Part B practitioner data at")
    print("                                 all, and the CRC model stays pattern-level.")


if __name__ == "__main__":
    main()
