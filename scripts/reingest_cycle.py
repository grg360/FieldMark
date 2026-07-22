"""
FieldMark - single orchestrator for ONE incremental reingest cycle (Monday-3am cron entrypoint).

PURE ORCHESTRATION: this file contains NO scoring/data logic and does NOT reimplement any stage.
It chains the existing stage scripts via subprocess, fail-fast, threading the cycle's run ids.
The only direct DB access is three tiny read-only SELECT-to-file glue queries (ta_id, the TA's
hcp-ids, and the batch's pub-ids) - because run_sql.py prints a formatted table, not bare uuids.

TWO RUN IDS (both captured, used where noted):
  * PUB_RUN_ID  - minted+printed by pubmed_pipeline.py (stage 1) as "[pubmed_pipeline]
                  ingestion_run_id=...". Stamps publications_v2.ingestion_run_id. Used in stage 6
                  to find the batch's new pubs.
  * HCP_RUN_ID  - minted by create_hcps_v2.py (stage 2), read from its --summary-out JSON
                  ("ingestion_run_id"). The canonical HCP run id. Used in stages 3, 7, 8c.

STAGES (fail-fast: any non-zero exit -> stop, mark FAILED, exit 1):
  1 ingest            pubmed_pipeline.py --ta <slug>                (capture PUB_RUN_ID)
  2 create_hcps       create_hcps_v2.py --ta <slug> --incremental --summary-out <run_summary.json>
                      (read HCP_RUN_ID)
    [gen batch_pubs]  SELECT id FROM publications_v2 WHERE ingestion_run_id=<PUB_RUN_ID> -> batch_pubs.txt
  3 affected          compute_affected_hcps.py --run-id <HCP_RUN_ID> --pub-ids-file batch_pubs.txt --out affected.txt
  4 ta_tagging        ta_tagging_rebuild_v2.py --ta <slug> --candidate-hcp-ids-file affected.txt --execute
    [gen ta_hcp_ids]  SELECT hcp_id FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id=<TA_ID> -> ta_hcp_ids.txt
  5 step_f            rebuild_publication_authors_v2.py --hcp-ids-file ta_hcp_ids.txt --execute
  6 authorship_9b     derive_authorship_position_v2.py --pub-ids-file batch_pubs.txt --author-position-mode skip --execute
  7 dedup             dedup_detect.py --ingestion-run-id <HCP_RUN_ID>  ;  dedup_merge.py --execute
  8 career            8a career_enrichment_from_clusters.py --only-changed-today --target-version v2
                      8b openalex_author_enrichment.py --hcp-ids-file affected.txt --snapshot-date <TODAY>
                      8c derive_career_first_pub_year_v2.py --ta <slug> --ingestion-run-id <HCP_RUN_ID> --snapshot-date <TODAY> --execute
                      8d cohort_classification_v2.py --ta <slug> --execute
  9 score             rising_score.py --ta <slug> --execute

SNAPSHOT-DATE: captured ONCE at cycle start and passed identically to 8b and 8c (they must match
or 8c reads zero rows - a real past bug).

--dry-run: prints the full plan (all stages, resolved commands with run-id/ta_id placeholders,
snapshot-date, mode) and executes NOTHING. (A real chained dry-run is incoherent because dry
stages do not produce the run ids / files later stages consume; per-stage dry-runs are done by
running each script with --dry-run individually.)

--resume-from STAGE: skip to a named/numbered stage, reusing the previous run's ids + generated
files persisted in the per-TA work dir. If those are missing, recovery is: re-run from the top
(all stages are upsert/idempotent).

Env: DATABASE_URL (for the glue SELECTs) + whatever the stage scripts need.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent  # scripts/reingest_cycle.py -> scripts -> repo root

SCRIPTS: Dict[str, str] = {
    "pubmed": "scripts/ingest/pubmed_pipeline.py",
    "create_hcps": "scripts/classify/create_hcps_v2.py",
    "compute_affected": "scripts/utilities/compute_affected_hcps.py",
    "ta_tagging": "scripts/classify/ta_tagging_rebuild_v2.py",
    "step_f": "scripts/classify/rebuild_publication_authors_v2.py",
    "authorship_9b": "scripts/classify/derive_authorship_position_v2.py",
    "dedup_detect": "scripts/dedup/dedup_detect.py",
    "dedup_merge": "scripts/dedup/dedup_merge.py",
    "career_enrich": "scripts/enrich/career_enrichment_from_clusters.py",
    "openalex_enrich": "scripts/enrich/openalex_author_enrichment.py",
    "career_first": "scripts/enrich/derive_career_first_pub_year_v2.py",
    "cohort": "scripts/classify/cohort_classification_v2.py",
    "rising_score": "scripts/score/rising_score.py",
}

# dedup_merge write policy for the UNATTENDED 3am job -- EARN-PROMOTION policy: only the PROVEN
# tier auto-merges; every other tier stays in the candidate CSV, logged, for manual review, and is
# promoted to auto-merge only after it proves itself correct across watched cycles.
# Currently the sole proven tier is merge_fragment_high_confidence: this cycle all 3 of its merges
# were shared_coauthors-corroborated and manually confirmed correct. merge_high_confidence is
# UNTESTED (we have never inspected what lands in it), and merge_review / low-evidence are lower
# confidence -- so all three are deliberately left for manual review, NOT auto-merged at 3am.
# --tier restricts dedup_merge to this one recommended_action.
DEDUP_MERGE_EXTRA_ARGS: List[str] = ["--tier", "merge_fragment_high_confidence"]

# Stage 1 MUST always be date-windowed. An un-windowed pubmed_pipeline run (config years_back=null)
# enters "full PubMed history / unlimited fetch" mode and pulls the entire corpus back to 1947 --
# always wrong for an incremental cycle. So when no --days/--mindate/--maxdate is given we default
# to a 7-day window; there is deliberately no code path that ingests without a window.
DEFAULT_INGEST_DAYS = 7

# Ordered stages for --resume-from and the plan.
STAGE_ORDER: List[Tuple[int, str]] = [
    (1, "ingest"),
    (2, "create_hcps"),
    (3, "affected"),
    (4, "ta_tagging"),
    (5, "step_f"),
    (6, "authorship"),
    (7, "dedup"),
    (8, "career"),
    (9, "score"),
]
STAGE_NAME_TO_NUM = {name: n for n, name in STAGE_ORDER}


class StageFailure(Exception):
    def __init__(self, stage_no: int, name: str, returncode: int):
        super().__init__(f"stage {stage_no} ({name}) exited {returncode}")
        self.stage_no = stage_no
        self.name = name
        self.returncode = returncode


def get_required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise SystemExit(f"Missing required env var: {name}")
    return v


def py(script_key: str) -> List[str]:
    return [sys.executable, str(REPO_ROOT / SCRIPTS[script_key])]


def _display(cmd: List[str]) -> str:
    """Readable command: 'python <relative-script> <args>'."""
    if len(cmd) >= 2 and cmd[0] == sys.executable:
        try:
            rel = str(Path(cmd[1]).resolve().relative_to(REPO_ROOT))
        except Exception:
            rel = cmd[1]
        return "python " + " ".join([rel] + cmd[2:])
    return " ".join(cmd)


# ---------------------------------------------------------------------------
# Command builders (used BOTH for the dry-run plan (placeholder values) and for
# real execution (resolved values)) -- so plan and execution can never diverge.
# ---------------------------------------------------------------------------

def build_ingest_date_args(
    days: Optional[int], mindate: Optional[str], maxdate: Optional[str]
) -> List[str]:
    """Stage-1 date-window pass-through for pubmed_pipeline (--days OR --mindate/--maxdate).

    NEVER returns an empty window: if none is given it falls back to DEFAULT_INGEST_DAYS, so the
    orchestrator can never invoke pubmed_pipeline un-windowed (which would pull the full corpus).
    """
    if days is not None:
        return ["--days", str(days)]
    if mindate and maxdate:
        return ["--mindate", mindate, "--maxdate", maxdate]
    return ["--days", str(DEFAULT_INGEST_DAYS)]


def cmd_ingest(
    slug: str, ingest_limit: Optional[int] = None, date_args: Optional[List[str]] = None
) -> List[str]:
    cmd = py("pubmed") + ["--ta", slug]
    if ingest_limit is not None:
        cmd += ["--limit", str(ingest_limit)]
    if date_args:
        cmd += date_args
    return cmd


def cmd_create_hcps(slug: str, summary_path: str) -> List[str]:
    return py("create_hcps") + ["--ta", slug, "--incremental", "--summary-out", summary_path]


def cmd_compute_affected(hcp_run_id: str, batch_pubs_path: str, affected_path: str) -> List[str]:
    return py("compute_affected") + [
        "--run-id", hcp_run_id, "--pub-ids-file", batch_pubs_path, "--out", affected_path,
    ]


def cmd_ta_tagging(slug: str, affected_path: str) -> List[str]:
    return py("ta_tagging") + ["--ta", slug, "--candidate-hcp-ids-file", affected_path, "--execute"]


def cmd_step_f(ta_hcp_ids_path: str) -> List[str]:
    return py("step_f") + ["--hcp-ids-file", ta_hcp_ids_path, "--execute"]


def cmd_authorship(batch_pubs_path: str) -> List[str]:
    return py("authorship_9b") + [
        "--pub-ids-file", batch_pubs_path, "--author-position-mode", "skip", "--execute",
    ]


def cmd_dedup_detect(hcp_run_id: str) -> List[str]:
    return py("dedup_detect") + ["--ingestion-run-id", hcp_run_id]


def cmd_dedup_merge() -> List[str]:
    return py("dedup_merge") + ["--execute"] + DEDUP_MERGE_EXTRA_ARGS


def cmd_career_enrich() -> List[str]:
    return py("career_enrich") + ["--only-changed-today", "--target-version", "v2"]


def cmd_openalex_enrich(affected_path: str, snapshot: str) -> List[str]:
    return py("openalex_enrich") + ["--hcp-ids-file", affected_path, "--snapshot-date", snapshot]


def cmd_career_first(slug: str, hcp_run_id: str, snapshot: str) -> List[str]:
    return py("career_first") + [
        "--ta", slug, "--ingestion-run-id", hcp_run_id, "--snapshot-date", snapshot, "--execute",
    ]


def cmd_cohort(slug: str) -> List[str]:
    return py("cohort") + ["--ta", slug, "--execute"]


def cmd_rising_score(slug: str) -> List[str]:
    return py("rising_score") + ["--ta", slug, "--execute"]


# ---------------------------------------------------------------------------
# Subprocess runner (streams live output, optionally captures a stdout pattern), fail-fast.
# ---------------------------------------------------------------------------

def run_stage(stage_no: int, name: str, cmd: List[str], capture_pattern: Optional[str] = None) -> Optional[str]:
    print(f"\n{'='*72}\n[stage {stage_no}] {name}\n  $ {_display(cmd)}\n{'='*72}", flush=True)
    t0 = time.time()
    captured: Optional[str] = None
    # Force UTF-8 both ways: decode child output as utf-8 with errors="replace" so a stray
    # byte (accented author names on Windows' cp1252 default) becomes a replacement char
    # instead of crashing the reader; PYTHONIOENCODING makes the children emit utf-8 too.
    child_env = dict(os.environ, PYTHONIOENCODING="utf-8")
    proc = subprocess.Popen(
        cmd, cwd=str(REPO_ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", bufsize=1, env=child_env,
    )
    assert proc.stdout is not None
    pat = re.compile(capture_pattern) if capture_pattern else None
    for line in proc.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
        if pat and captured is None:
            m = pat.search(line)
            if m:
                captured = m.group(1)
    proc.wait()
    dt = time.time() - t0
    if proc.returncode != 0:
        raise StageFailure(stage_no, name, proc.returncode)
    print(f"[stage {stage_no}] {name} OK ({dt:.0f}s)", flush=True)
    return captured


# ---------------------------------------------------------------------------
# Direct DB glue (3 read-only SELECT-to-file queries; robust vs run_sql's table output).
# ---------------------------------------------------------------------------

def _connect():
    import psycopg  # local import so --dry-run needs no DB / no dep
    return psycopg.connect(get_required_env("DATABASE_URL"))


def resolve_ta_id(slug: str) -> str:
    with _connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM therapeutic_areas WHERE slug = %s", (slug,))
        row = cur.fetchone()
        if not row:
            raise SystemExit(f"No therapeutic_area with slug '{slug}'.")
        return str(row[0])


def _write_ids_file(sql: str, params: Tuple, path: Path, label: str) -> int:
    with _connect() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        ids = [str(r[0]) for r in cur.fetchall() if r and r[0]]
    path.write_text("\n".join(ids) + ("\n" if ids else ""), encoding="utf-8")
    print(f"  [gen] {label}: {len(ids):,} id(s) -> {path}")
    return len(ids)


def gen_batch_pubs_file(pub_run_id: str, path: Path) -> int:
    return _write_ids_file(
        "SELECT id FROM publications_v2 WHERE ingestion_run_id = %s", (pub_run_id,),
        path, "batch pub-ids",
    )


def gen_ta_hcp_ids_file(ta_id: str, path: Path) -> int:
    return _write_ids_file(
        "SELECT hcp_id FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id = %s", (ta_id,),
        path, "TA hcp-ids",
    )


# ---------------------------------------------------------------------------
# Run-state (persisted so --resume-from can recover the run ids) + completion marker.
# ---------------------------------------------------------------------------

def work_dir_for(slug: str) -> Path:
    d = REPO_ROOT / ".reingest_work" / slug
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_state(work: Path, state: Dict) -> None:
    (work / "run_state.json").write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")


def load_state(work: Path) -> Dict:
    p = work / "run_state.json"
    if not p.exists():
        raise SystemExit(
            f"--resume-from: no run_state.json in {work}. Cannot resume; re-run from the top "
            f"(all stages are idempotent)."
        )
    return json.loads(p.read_text(encoding="utf-8"))


def write_completion_marker(work: Path, marker: Dict) -> None:
    path = work / "reingest_last_run.json"
    path.write_text(json.dumps(marker, indent=2, sort_keys=True), encoding="utf-8")
    print(f"\n[reingest_cycle] completion marker -> {path}")


# ---------------------------------------------------------------------------
# Plan (dry-run)
# ---------------------------------------------------------------------------

def print_plan(
    slug: str, snapshot: str, work: Path,
    ingest_limit: Optional[int] = None, date_args: Optional[List[str]] = None,
) -> None:
    A = str(work / "affected.txt")
    B = str(work / "batch_pubs.txt")
    T = str(work / "ta_hcp_ids.txt")
    S = str(work / "run_summary.json")
    HCP = "<HCP_RUN_ID>"
    PUB = "<PUB_RUN_ID>"
    TAID = "<TA_ID>"

    ingest_label = "1  ingest (capture PUB_RUN_ID from stdout)"
    window_note = " ".join(date_args) if date_args else "full corpus"
    ingest_label += f"  [window: {window_note}]"
    if ingest_limit is not None:
        ingest_label += f"  [--limit {ingest_limit}]"
    else:
        ingest_label += "  [unbounded]"

    plan: List[Tuple[str, List[str]]] = [
        (ingest_label, cmd_ingest(slug, ingest_limit, date_args)),
        ("2  create_hcps (mints HCP_RUN_ID -> run_summary.json)", cmd_create_hcps(slug, S)),
        ("   [gen] batch_pubs.txt = publications_v2 WHERE ingestion_run_id=" + PUB, []),
        ("3  affected", cmd_compute_affected(HCP, B, A)),
        ("4  ta_tagging", cmd_ta_tagging(slug, A)),
        ("   [gen] ta_hcp_ids.txt = hcp_therapeutic_areas_v2 WHERE therapeutic_area_id=" + TAID, []),
        ("5  step_f", cmd_step_f(T)),
        ("6  authorship_9b", cmd_authorship(B)),
        ("7a dedup_detect", cmd_dedup_detect(HCP)),
        ("7b dedup_merge", cmd_dedup_merge()),
        ("8a career_enrichment", cmd_career_enrich()),
        ("8b openalex_enrichment", cmd_openalex_enrich(A, snapshot)),
        ("8c career_first_pub_year", cmd_career_first(slug, HCP, snapshot)),
        ("8d cohort_classification", cmd_cohort(slug)),
        ("9  rising_score", cmd_rising_score(slug)),
    ]

    print("=" * 72)
    print("  REINGEST CYCLE - PLAN (DRY-RUN: nothing is executed)")
    print("=" * 72)
    print(f"  TA:            {slug}")
    print(f"  ta_id:         {TAID}  (resolved at execute time)")
    print(f"  HCP_RUN_ID:    {HCP}   (minted by stage 2)")
    print(f"  PUB_RUN_ID:    {PUB}   (minted by stage 1, from stdout)")
    print(f"  snapshot_date: {snapshot}  (passed identically to 8b and 8c)")
    print(f"  work dir:      {work}")
    print(f"  Mode:          DRY-RUN (plan only)")
    print("-" * 72)
    for label, cmd in plan:
        if cmd:
            print(f"  {label}\n       {_display(cmd)}")
        else:
            print(f"  {label}")
    print("-" * 72)
    if DEDUP_MERGE_EXTRA_ARGS:
        print(f"  dedup_merge tier: {' '.join(DEDUP_MERGE_EXTRA_ARGS)}")
    else:
        print("  dedup_merge tier: DEFAULT (auto-merges merge_high_confidence + merge_review +")
        print("                    merge_fragment_high_confidence; low-evidence stays in CSV).")
    print("=" * 72)
    print("Dry-run complete: no stages executed. Run with --execute to run the cycle.")


# ---------------------------------------------------------------------------
# Execute
# ---------------------------------------------------------------------------

def run_cycle(
    slug: str, resume_from: Optional[int],
    ingest_limit: Optional[int] = None, date_args: Optional[List[str]] = None,
) -> int:
    work = work_dir_for(slug)
    affected = work / "affected.txt"
    batch_pubs = work / "batch_pubs.txt"
    ta_hcp_ids = work / "ta_hcp_ids.txt"
    run_summary = work / "run_summary.json"
    snapshot = date.today().isoformat()
    started_at = datetime.now(timezone.utc).isoformat()
    t0 = time.time()

    start_n = resume_from or 1
    stage_status: List[Dict] = []

    # Resolve / recover shared state.
    if resume_from:
        state = load_state(work)
        pub_run_id = state.get("pub_run_id")
        hcp_run_id = state.get("hcp_run_id")
        ta_id = state.get("ta_id") or resolve_ta_id(slug)
        print(f"[reingest_cycle] RESUME from stage {resume_from}: "
              f"hcp_run_id={hcp_run_id} pub_run_id={pub_run_id} ta_id={ta_id}")
    else:
        pub_run_id = None
        hcp_run_id = None
        ta_id = resolve_ta_id(slug)

    def note(n: int, name: str, status: str) -> None:
        stage_status.append({"stage": n, "name": name, "status": status})

    def running(n: int) -> bool:
        return n >= start_n

    print("=" * 72)
    print(f"  REINGEST CYCLE - EXECUTE  ta={slug} ta_id={ta_id} snapshot={snapshot}")
    print(f"  work dir: {work}   resume_from: {resume_from or '(top)'}")
    print("=" * 72)

    try:
        # 1 INGEST
        if running(1):
            pub_run_id = run_stage(1, "ingest", cmd_ingest(slug, ingest_limit, date_args),
                                   capture_pattern=r"\[pubmed_pipeline\]\s+ingestion_run_id=(\S+)")
            if not pub_run_id:
                raise StageFailure(1, "ingest", 1)  # could not capture PUB_RUN_ID
            save_state(work, {"ta_id": ta_id, "pub_run_id": pub_run_id, "hcp_run_id": hcp_run_id})
            note(1, "ingest", "OK")

        # 2 CREATE HCPS (mint HCP_RUN_ID)
        if running(2):
            run_stage(2, "create_hcps", cmd_create_hcps(slug, str(run_summary)))
            if not run_summary.exists():
                raise SystemExit("create_hcps did not write run_summary.json.")
            summary = json.loads(run_summary.read_text(encoding="utf-8"))
            hcp_run_id = summary.get("ingestion_run_id")
            if not hcp_run_id:
                raise SystemExit("run_summary.json has no ingestion_run_id.")
            print(f"  captured HCP_RUN_ID={hcp_run_id}")
            save_state(work, {"ta_id": ta_id, "pub_run_id": pub_run_id, "hcp_run_id": hcp_run_id})
            note(2, "create_hcps", "OK")

        # [gen batch_pubs] needed by stages 3 and 6
        if running(3) or running(6):
            if not pub_run_id:
                raise SystemExit("PUB_RUN_ID unknown (resume without run_state). Re-run from top.")
            if running(3) or not batch_pubs.exists():
                gen_batch_pubs_file(pub_run_id, batch_pubs)

        # 3 AFFECTED
        if running(3):
            if not hcp_run_id:
                raise SystemExit("HCP_RUN_ID unknown. Re-run from top.")
            run_stage(3, "affected", cmd_compute_affected(hcp_run_id, str(batch_pubs), str(affected)))
            note(3, "affected", "OK")

        # 4 TA TAGGING
        if running(4):
            if not affected.exists():
                raise SystemExit(f"{affected} missing. Re-run from stage 3.")
            run_stage(4, "ta_tagging", cmd_ta_tagging(slug, str(affected)))
            note(4, "ta_tagging", "OK")

        # [gen ta_hcp_ids] for stage 5
        if running(5):
            gen_ta_hcp_ids_file(ta_id, ta_hcp_ids)

        # 5 STEP F
        if running(5):
            run_stage(5, "step_f", cmd_step_f(str(ta_hcp_ids)))
            note(5, "step_f", "OK")

        # 6 AUTHORSHIP 9b
        if running(6):
            if not batch_pubs.exists():
                raise SystemExit(f"{batch_pubs} missing. Re-run from stage 3.")
            run_stage(6, "authorship_9b", cmd_authorship(str(batch_pubs)))
            note(6, "authorship_9b", "OK")

        # 7 DEDUP (detect then merge)
        if running(7):
            if not hcp_run_id:
                raise SystemExit("HCP_RUN_ID unknown. Re-run from top.")
            run_stage(7, "dedup_detect", cmd_dedup_detect(hcp_run_id))
            run_stage(7, "dedup_merge", cmd_dedup_merge())
            note(7, "dedup", "OK")

        # 8 CAREER CHAIN (8a-8d)
        if running(8):
            if not affected.exists():
                raise SystemExit(f"{affected} missing. Re-run from stage 3.")
            if not hcp_run_id:
                raise SystemExit("HCP_RUN_ID unknown. Re-run from top.")
            run_stage(8, "career_enrichment(8a)", cmd_career_enrich())
            run_stage(8, "openalex_enrichment(8b)", cmd_openalex_enrich(str(affected), snapshot))
            run_stage(8, "career_first_pub_year(8c)", cmd_career_first(slug, hcp_run_id, snapshot))
            run_stage(8, "cohort_classification(8d)", cmd_cohort(slug))
            note(8, "career", "OK")

        # 9 SCORE
        if running(9):
            run_stage(9, "rising_score", cmd_rising_score(slug))
            note(9, "score", "OK")

    except StageFailure as f:
        note(f.stage_no, f.name, f"FAILED(exit={f.returncode})")
        write_completion_marker(work, {
            "ta": slug, "ta_id": ta_id, "hcp_run_id": hcp_run_id, "pub_run_id": pub_run_id,
            "snapshot_date": snapshot, "started_at": started_at,
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "stages": stage_status, "result": "FAILED",
            "failed_stage": {"stage": f.stage_no, "name": f.name, "returncode": f.returncode},
        })
        print(f"\n{'='*72}\n  FAILED at stage {f.stage_no}: {f.name} (exit {f.returncode}). "
              f"Chain stopped.\n{'='*72}", file=sys.stderr)
        return 1

    write_completion_marker(work, {
        "ta": slug, "ta_id": ta_id, "hcp_run_id": hcp_run_id, "pub_run_id": pub_run_id,
        "snapshot_date": snapshot, "started_at": started_at,
        "ended_at": datetime.now(timezone.utc).isoformat(),
        "stages": stage_status, "result": "SUCCESS", "failed_stage": None,
    })
    print(f"\n{'='*72}\n  REINGEST CYCLE SUCCESS  ta={slug}  ({time.time()-t0:.0f}s)\n{'='*72}")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Single orchestrator for one incremental reingest cycle.")
    p.add_argument("--ta", required=True, metavar="SLUG", help="Therapeutic area slug (e.g. nsclc).")
    p.add_argument("--dry-run", action="store_true", help="Print the full plan; execute nothing (default).")
    p.add_argument("--execute", action="store_true", help="Run the cycle for real.")
    p.add_argument("--ingest-limit", type=int, default=None, metavar="N",
                   help="Cap stage 1 (pubmed_pipeline) to N via --limit N. Omit to run unbounded.")
    p.add_argument("--days", type=int, default=None, metavar="N",
                   help="Date-window stage 1 to the last N days (pubmed_pipeline --days N), e.g. "
                        "--days 7 for the weekly cron. Mutually exclusive with --mindate/--maxdate.")
    p.add_argument("--mindate", default=None, metavar="YYYY/MM/DD",
                   help="Explicit stage-1 window start (with --maxdate). Mutually exclusive with --days.")
    p.add_argument("--maxdate", default=None, metavar="YYYY/MM/DD",
                   help="Explicit stage-1 window end (with --mindate). Mutually exclusive with --days.")
    p.add_argument("--resume-from", metavar="STAGE", default=None,
                   help="Skip to a stage (number 1-9 or name: "
                        + ", ".join(name for _, name in STAGE_ORDER)
                        + "), reusing the last run's ids/files from the work dir.")
    args = p.parse_args()
    # --days and --mindate/--maxdate are mutually exclusive; an explicit range needs both bounds.
    if args.days is not None and (args.mindate or args.maxdate):
        p.error("--days is mutually exclusive with --mindate/--maxdate.")
    if bool(args.mindate) != bool(args.maxdate):
        p.error("--mindate and --maxdate must be given together.")
    return args


def resolve_resume(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    v = value.strip().lower()
    if v.isdigit() and 1 <= int(v) <= 9:
        return int(v)
    if v in STAGE_NAME_TO_NUM:
        return STAGE_NAME_TO_NUM[v]
    raise SystemExit(
        f"--resume-from: unknown stage '{value}'. Use 1-9 or one of: "
        + ", ".join(name for _, name in STAGE_ORDER)
    )


def main() -> int:
    args = parse_args()
    load_dotenv()
    slug = args.ta
    execute = args.execute and not args.dry_run  # dry-run is the safe default
    resume_from = resolve_resume(args.resume_from)
    date_args = build_ingest_date_args(args.days, args.mindate, args.maxdate)
    if args.days is None and not (args.mindate and args.maxdate):
        print(f"[reingest_cycle] No date window given; DEFAULTING stage 1 to --days "
              f"{DEFAULT_INGEST_DAYS} (un-windowed ingest would pull the full PubMed corpus back "
              f"to 1947 -- never correct for an incremental cycle). Pass --days N or "
              f"--mindate/--maxdate to override.")

    if not execute:
        print_plan(slug, date.today().isoformat(), work_dir_for(slug), args.ingest_limit, date_args)
        return 0
    return run_cycle(slug, resume_from, args.ingest_limit, date_args)


if __name__ == "__main__":
    sys.exit(main())
