"""
Per-TA NPPES taxonomy configuration -- ONE implementation, read by every script.

TWO LISTS, TWO JOBS. They were one list, `nppes.taxonomies`, and that conflation cost
real writes on real physicians.

  population_taxonomies  WHO COUNTS AS A MEMBER OF THIS TA.
      Read by nppes_workstream_b_ingest.py, which CREATES an HCP record for every NPPES
      individual carrying one of these codes. Narrow is correct here and the cost of
      breadth is enormous: 208600000X "Surgery" admits 42,905 people, mostly hernia and
      trauma surgeons, and admitting them would define colorectal cancer as "surgery".
      This list is founder input -- it is the definition of the TA's population.

  confirming_taxonomies  WHAT CORROBORATES A NAME MATCH THAT ALREADY EXISTS.
      Read by targeted_nppes_enrichment.py and nppes_matcher.py. It never admits anyone.
      It only asks, of a candidate the name search already found: does this person's
      registered specialty make them a plausible clinician for this disease? Narrow is
      WRONG here, and the cost is invisible -- correct matches held for no safety gain.
      208600000X belongs on this list for exactly the reason it must stay off the other:
      it is how colorectal and surgical oncologists are commonly registered, and as a
      confirmer it cannot admit anyone on its own.

The lists therefore overlap but neither contains the other, and a code moving between
them is a real decision, not a tidy-up. Split 2026-09-08 after a narrow confirmer list
held 26 correct-looking writes -- MSK and Cornell colorectal surgeons among them --
because their NPPES code was 208600000X rather than one of the six population codes.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Tuple

TA_CONFIG_DIR = Path(__file__).resolve().parents[2] / "config" / "therapeutic_areas"

POPULATION_KEY = "population_taxonomies"
CONFIRMING_KEY = "confirming_taxonomies"


def _load(slug: str) -> Dict:
    path = TA_CONFIG_DIR / f"{slug}.json"
    if not path.exists():
        raise SystemExit(
            f"No TA config at {path}.\n"
            f"  Available: {', '.join(sorted(p.stem for p in TA_CONFIG_DIR.glob('*.json')))}"
        )
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _codes(cfg: Dict, key: str) -> List[str]:
    value = (cfg.get("nppes") or {}).get(key)
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise SystemExit(f"nppes.{key} must be a list of taxonomy code strings; got {value!r}.")
    return list(value)


def load_population_taxonomies(slug: str) -> List[str]:
    """
    Codes that make an NPPES individual a member of this TA. Empty is a valid,
    meaningful state -- it means the founder has not defined the population yet, and the
    caller should refuse to run rather than guess.
    """
    return _codes(_load(slug), POPULATION_KEY)


def load_confirming_taxonomies(slug: str) -> Tuple[str, ...]:
    """
    Codes that corroborate a name match for this TA.

    Empty is returned, not raised: a TA without a confirmer list cannot confirm on
    taxonomy, which is a survivable state (matches are held, never wrongly written).
    Callers say so loudly rather than failing the run.
    """
    return tuple(_codes(_load(slug), CONFIRMING_KEY))


def load_confirming_candidates(slug: str) -> List[Dict]:
    """
    Codes proposed for the confirmer list and NOT yet accepted -- held for clinical
    review, with the argument for and against recorded beside each.

    JSON has no comments, so a held candidate is a data row rather than a commented-out
    line. It is deliberately a separate key: nothing reads it as a confirmer, and a
    reviewer sees the reasoning instead of a bare code.
    """
    value = (_load(slug).get("nppes") or {}).get("confirming_taxonomies_candidates")
    return list(value) if isinstance(value, list) else []
