"""
FieldMark - rising-star scoring dispatcher.

Runs the CORRECT rising-star scoring methodology for a therapeutic area, selected by the TA's
configured model, so `--ta <slug>` picks both the TA and its methodology. Replaces manually
running the right script chain per TA.

This is a PURE ORCHESTRATOR: it contains NO scoring math and writes NO tables of its own. It
invokes the existing (unchanged) scoring scripts in order via subprocess, passing through
--ta / --dry-run|--execute / --debug-top, and fails fast if any step exits non-zero.

Usage:
  python scripts/score/rising_score.py --ta nsclc              [--dry-run] [--execute] [--debug-top N]
  python scripts/score/rising_score.py --ta atopic-dermatitis  [--dry-run] [--execute]

MODEL RESOLUTION (source of truth, in priority order):
  (a) a per-TA config field, if one exists: probed on therapeutic_area_ingestion_config and
      therapeutic_areas (columns rising_model / scoring_model). The probe tolerates a missing
      column (equivalent to checking information_schema for it) and moves on.
  (b) if no config field exists yet: an explicit hardcoded MAP below (stopgap), with a LOUD
      warning that this should move to config.

FLAG-CONVENTION NOTE (why the dispatcher translates its mode per chain):
  * momentum chain scripts have NO --execute flag; they WRITE BY DEFAULT and take --dry-run to
    suppress writes. So dispatcher --execute => pass nothing; --dry-run => pass --dry-run.
  * emergence chain scripts default to dry-run and require --execute to write. So dispatcher
    --execute => pass --execute; --dry-run => pass --dry-run.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from typing import Dict, List, Optional, Tuple

from dotenv import load_dotenv

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))  # scripts/score -> scripts -> repo root

# --- Stopgap model map (until a config column exists). Using it prints a LOUD warning. ---
RISING_MODEL: Dict[str, str] = {
    "nsclc": "momentum",
    "atopic-dermatitis": "emergence_composite",
}

# Config sources probed for a per-TA model, in priority order.
# key: 'ta_id' -> match therapeutic_area_id (slug resolved first); 'slug' -> match slug.
CONFIG_PROBES: List[Tuple[str, str, str]] = [
    ("therapeutic_area_ingestion_config", "rising_model", "ta_id"),
    ("therapeutic_area_ingestion_config", "scoring_model", "ta_id"),
    ("therapeutic_areas", "rising_model", "slug"),
    ("therapeutic_areas", "scoring_model", "slug"),
]

# Output table each model writes (for the end-of-run report; the scripts do the writing).
MODEL_OUTPUT_TABLE: Dict[str, str] = {
    "momentum": "hcp_rising_star_ranks_v3",
    "emergence_composite": "hcp_rising_composite_v1",
}

# Step chains. Each step = (script_filename, model-specific extra args). The mode flags
# (--dry-run / --execute / --debug-top) are appended by build_command() per the convention.
MOMENTUM_STEPS: List[Tuple[str, List[str]]] = [
    ("network_centrality_scoring.py",
     ["--window-type", "hist_2016_2020", "--start-year", "2016", "--end-year", "2020"]),
    ("network_centrality_scoring.py",
     ["--window-type", "recent_2021_2025", "--start-year", "2021", "--end-year", "2025"]),
    ("scientific_momentum_scoring.py", []),
    ("network_momentum_scoring.py", []),
    ("rising_star_scoring.py", []),
]
EMERGENCE_STEPS: List[Tuple[str, List[str]]] = [
    ("emergence_scoring.py", []),
    ("rising_composite_scoring.py", []),
]
MODEL_STEPS: Dict[str, List[Tuple[str, List[str]]]] = {
    "momentum": MOMENTUM_STEPS,
    "emergence_composite": EMERGENCE_STEPS,
}


def init_client_or_none():
    """Best-effort Supabase client for the config probe. None if env/init unavailable -- the
    dispatcher then falls back to the hardcoded MAP rather than hard-failing."""
    try:
        from supabase import create_client  # local import so --help works without the dep
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            return None
        return create_client(url, key)
    except Exception as exc:  # noqa: BLE001
        print(f"[rising_score] (config probe unavailable: {type(exc).__name__}: {exc})")
        return None


def resolve_rising_model(client, slug: str) -> Tuple[str, str]:
    """Resolve the TA's rising model. Returns (model, source_description). Raises SystemExit if
    the TA has neither a config value nor a MAP entry."""
    # (a) config probe (tolerant of missing tables/columns).
    if client is not None:
        ta_id: Optional[str] = None
        try:
            r = client.table("therapeutic_areas").select("id").eq("slug", slug).limit(1).execute().data or []
            if r:
                ta_id = str(r[0]["id"])
        except Exception:  # noqa: BLE001
            ta_id = None

        for table, column, key in CONFIG_PROBES:
            try:
                q = client.table(table).select(column)
                if key == "ta_id":
                    if ta_id is None:
                        continue
                    q = q.eq("therapeutic_area_id", ta_id)
                else:
                    q = q.eq("slug", slug)
                rows = q.limit(1).execute().data or []
                if rows and rows[0].get(column):
                    return str(rows[0][column]).strip(), f"config {table}.{column}"
            except Exception:  # noqa: BLE001 -- column/table absent -> try the next probe
                continue

    # (b) hardcoded stopgap MAP.
    if slug in RISING_MODEL:
        model = RISING_MODEL[slug]
        print("\n" + "!" * 72)
        print(f"[rising_score] WARNING: no per-TA rising-model config found for '{slug}'.")
        print(f"[rising_score] Using the HARDCODED stopgap map -> '{model}'.")
        print("[rising_score] TODO: move this to a therapeutic_area config column "
              "(rising_model) and delete the map.")
        print("!" * 72 + "\n")
        return model, "hardcoded MAP (stopgap)"

    raise SystemExit(
        f"[rising_score] ERROR: no rising model for TA '{slug}' - not in config and not in the "
        f"stopgap MAP {sorted(RISING_MODEL)}. Refusing to guess."
    )


def build_command(
    model: str, script: str, extra: List[str], slug: str, dry_run: bool, debug_top: Optional[int]
) -> List[str]:
    """Full subprocess command for one step, with mode flags per the chain's convention."""
    cmd = [sys.executable, os.path.join(SCRIPT_DIR, script), "--ta", slug] + list(extra)
    if debug_top is not None:
        cmd += ["--debug-top", str(debug_top)]
    if dry_run:
        cmd += ["--dry-run"]
    else:
        # momentum scripts write by default (no --execute flag); emergence scripts need --execute.
        if model == "emergence_composite":
            cmd += ["--execute"]
    return cmd


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Rising-star scoring dispatcher (selects methodology by TA).")
    p.add_argument("--ta", required=True, metavar="SLUG", help="Therapeutic area slug (e.g. nsclc).")
    p.add_argument("--dry-run", action="store_true", help="Compute only; pass --dry-run to every step (default).")
    p.add_argument("--execute", action="store_true", help="Enable writes (translated per chain).")
    p.add_argument("--debug-top", type=int, default=None, metavar="N", help="Pass --debug-top N to every step.")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    load_dotenv()
    slug = args.ta

    # dry-run is the safe default; --execute writes only when --dry-run is not also set.
    dry_run = not (args.execute and not args.dry_run)

    client = init_client_or_none()
    model, source = resolve_rising_model(client, slug)
    steps = MODEL_STEPS.get(model)
    if steps is None:
        raise SystemExit(
            f"[rising_score] ERROR: unknown rising model '{model}' for TA '{slug}' "
            f"(known: {sorted(MODEL_STEPS)}). Refusing to guess."
        )

    out_table = MODEL_OUTPUT_TABLE.get(model, "(unknown)")

    # --- Plan (visible confirmation BEFORE any work) ---
    print("=" * 72)
    print("  RISING-STAR SCORING DISPATCH")
    print("=" * 72)
    print(f"  TA:            {slug}")
    print(f"  Model:         {model}   (source: {source})")
    print(f"  Mode:          {'DRY-RUN (no writes)' if dry_run else 'EXECUTE (writes enabled)'}")
    print(f"  Output table:  {out_table}")
    print(f"  Steps ({len(steps)}) that will run, in order:")
    planned = [build_command(model, s, extra, slug, dry_run, args.debug_top) for s, extra in steps]
    for i, cmd in enumerate(planned, 1):
        # show the command relative to script names for readability
        shown = " ".join([os.path.basename(cmd[1])] + cmd[2:])
        print(f"    {i}. {shown}")
    print("=" * 72 + "\n")

    # --- Run, fail-fast ---
    for i, ((script, _extra), cmd) in enumerate(zip(steps, planned), 1):
        print(f"\n----- [step {i}/{len(steps)}] {script} -----")
        print(f"  $ {' '.join(cmd)}")
        result = subprocess.run(cmd, cwd=REPO_ROOT)
        if result.returncode != 0:
            print("\n" + "=" * 72)
            print(f"  [rising_score] STEP {i}/{len(steps)} FAILED: {script} exited "
                  f"{result.returncode}. Stopping the chain (remaining steps NOT run).")
            print("=" * 72)
            return result.returncode
        print(f"----- [step {i}/{len(steps)}] {script} OK -----")

    print("\n" + "=" * 72)
    print(f"  [rising_score] DONE - all {len(steps)} step(s) succeeded for TA '{slug}' "
          f"(model '{model}').")
    print(f"  {'Would have written' if dry_run else 'Wrote'} results to: {out_table}")
    print("=" * 72)
    return 0


if __name__ == "__main__":
    sys.exit(main())
