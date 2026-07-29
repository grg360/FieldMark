"""
FieldMark - single orchestrator for ONE incremental reingest cycle (Monday-3am cron entrypoint).

PURE ORCHESTRATION: this file contains NO scoring/data logic and does NOT reimplement any stage.
It chains the existing stage scripts via subprocess, fail-fast, threading the cycle's run ids.
The only direct DB access is three tiny read-only SELECT-to-file glue queries (ta_id, the TA's
hcp-ids, and the batch's pub-ids) - because run_sql.py prints a formatted table, not bare uuids.

BATCH IDENTITY (authoritative): stage 1 emits primary_pmids.txt via --primary-pmids-out -- the
PRIMARY windowed-query pmids (esearch result), enrichment/author-history pmids EXCLUDED. batch_pubs
is resolved from that (pubmed_id = ANY(primary_pmids)), NOT from the run_id stamp. The insert-only
run_id stamp is created-by and under-captures re-ingested papers that kept an older run_id (caused
"batch pub-ids: 0" -> stage 3 crash); the pmid set is complete regardless of provenance.

QUIET WEEK: if primary_pmids.txt is EMPTY (0 new primary papers this window), the whole cycle is
skipped cleanly after stage 1 -- completion marker SUCCESS/skipped, exit 0 (no affected-set fan-out,
no rescore). A MISSING file (stage 1 failed to emit it) is a hard error, not a quiet week.

TWO RUN IDS (both captured, used where noted):
  * PUB_RUN_ID  - minted+printed by pubmed_pipeline.py (stage 1) as "[pubmed_pipeline]
                  ingestion_run_id=...". Stamps publications_v2.ingestion_run_id (created-by; NO
                  LONGER the batch definition -- see BATCH IDENTITY above).
  * HCP_RUN_ID  - minted by create_hcps_v2.py (stage 2), read from its --summary-out JSON
                  ("ingestion_run_id"). The canonical HCP run id. Used in stages 3, 7, 8c.

STAGES (fail-fast: any non-zero exit -> stop, mark FAILED, exit 1):
  1 ingest            pubmed_pipeline.py --ta <slug> --primary-pmids-out <primary_pmids.txt>
                      (capture PUB_RUN_ID; quiet-week gate: empty primary_pmids -> skip cycle, exit 0)
     [OpenAlex sub-sequence -- create_hcps' prerequisites; runs ONLY on a non-quiet week, AFTER the gate]
     1b openalex_pipeline.py --target-version v2 --skip-career-enrichment  (env SKIP_DOI_ENRICHMENT=0)
        -> publications_v2.authorships. Runs the DOI-enrichment phase (forced on via SKIP_DOI_ENRICHMENT=0;
        this env sets it truthy, which would otherwise skip the phase -> silent no-op). GATE-A: ALL pubs
        with a DOI and openalex_enriched_at IS NULL -- primary + 2nd-pass author-history + any un-enriched
        backlog, NOT just the ~primary batch (pubmed_pipeline inserts every pub with enriched_at=NULL).
        BILLED (OpenAlex API). See §billing note.
     1c run_sql.py --file build_author_flat.sql  (full O(corpus) rebuild of author_pub_flat)  GATE-D: after 1b.
     1d run_sql.py --file sql/reingest/inventory_upsert_incremental.sql --param ta_id=<TA_ID>
        --statement-timeout 30min  (openalex_author_inventory upsert, HAVING count>=3, GREATEST no-clobber) GATE-B.
  2 create_hcps       create_hcps_v2.py --ta <slug> --incremental --summary-out <run_summary.json>
                      (read HCP_RUN_ID; requires author_pub_flat + openalex_author_inventory, now populated by 1b-1d)
    [gen batch_pubs]  SELECT id FROM publications_v2 WHERE pubmed_id = ANY(primary_pmids.txt) -> batch_pubs.txt
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
 10 asset_matches      build_asset_matches.py  (rebuild asset_publication_v1 from config/assets.json)
                      NON-BLOCKING + NSCLC-ONLY: runs after scoring; failure -> WARN (not FAILED), so a
                      stale asset table never gates the cycle. Swap-in build (~2s live lock, ~95s total).

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
    "openalex_pipeline": "scripts/enrich/openalex_pipeline.py",   # 1b: pub-level authorships enrichment
    "run_sql": "scripts/utilities/run_sql.py",                    # 1c/1d: execute the flatten + inventory SQL
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
    "asset_matches": "scripts/assets/build_asset_matches.py",         # 10: derived asset-mention table (NSCLC only)
}

# Stage 10 ASSET MATCHES: rebuild asset_publication_v1 from config/assets.json (the Drug
# Intelligence vocabulary is the file; this derives the asset<->publication edges). NSCLC-ONLY --
# the config is scoped to the lung-cancer corpus -- so it runs only when --ta nsclc. NON-BLOCKING:
# it comes AFTER the scoring chain and its failure is isolated (noted WARN, never FAILED), because
# a stale asset table costs little (~400 NSCLC pubs/month) and must never gate the rising scores.
# SWAP-IN: the ~95s truncate-and-rebuild matches into a temp staging table off the live table, then
# swaps in the precomputed rows in a ~2s transaction -- so a concurrent asset-page read never blocks
# for the full build (the same fix build_author_flat needed). Weekly cadence = this cron's cadence.
ASSET_MATCHES_TA = "nsclc"

# 1c FLATTEN: full rebuild of author_pub_flat from publications_v2.authorships (TA-agnostic, unbilled
# SQL). GATE-D is satisfied by ORDER -- it runs AFTER 1b, so it flattens the freshly-enriched pubs.
# PERF: this is a FULL-CORPUS rebuild (DROP + CREATE TABLE AS over all publications_v2.authorships),
# i.e. O(corpus), not scoped to the batch. Accepted as-is (matches the playbook, and it's unbilled
# SQL). If weekly runtime becomes a problem, the candidate optimization is an APPEND-ONLY flatten:
# delete + re-insert only the batch pubs' author rows instead of rebuilding the whole table.
BUILD_AUTHOR_FLAT_SQL = REPO_ROOT / "build_author_flat.sql"

# 1d INVENTORY UPSERT: refresh openalex_author_inventory for THIS TA's authors from author_pub_flat.
# The SQL lives in a committed file (ta_id as a BOUND param, GATE-B GREATEST fix documented in its
# header) so the correctness property is visible in the SQL layer, not buried here. The on-disk
# build_inventory_ad.sql is deliberately NOT used (AD-hardcoded + EXCLUDED-clobber = the GATE-B bug).
INVENTORY_UPSERT_SQL_FILE = REPO_ROOT / "sql" / "reingest" / "inventory_upsert_incremental.sql"
INVENTORY_STATEMENT_TIMEOUT = "30min"  # heavy aggregate over the full author_pub_flat

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
    (10, "asset_matches"),
]
STAGE_NAME_TO_NUM = {name: n for n, name in STAGE_ORDER}
MAX_STAGE = STAGE_ORDER[-1][0]


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
    slug: str, ingest_limit: Optional[int] = None, date_args: Optional[List[str]] = None,
    primary_pmids_out: Optional[str] = None, run_summary_out: Optional[str] = None,
) -> List[str]:
    # --reset-checkpoint ALWAYS: a stale per-TA checkpoint marks publication_upsert complete by
    # batch-count without verifying the DB. On resume the writes are skipped, so the batch is lost
    # (23 vs 368 pubs, proven A/B). Stages are idempotent upserts, so always re-writing is safe;
    # resuming is not. (The name-based HCP path that made the loss silent is now removed -- ingest
    # persists publications only -- but re-writing every cycle is still the correct posture.)
    cmd = py("pubmed") + ["--ta", slug, "--reset-checkpoint"]
    if ingest_limit is not None:
        cmd += ["--limit", str(ingest_limit)]
    if date_args:
        cmd += date_args
    if primary_pmids_out is not None:
        cmd += ["--primary-pmids-out", primary_pmids_out]
    if run_summary_out is not None:
        cmd += ["--run-summary-out", run_summary_out]
    return cmd


# --- OpenAlex sub-sequence (1b/1c/1d): the prerequisites create_hcps/ta_tagging/Step F depend on. ---

def cmd_openalex_enrich_pubs() -> List[str]:
    # 1b: pub-level OpenAlex enrichment -> publications_v2.authorships. v2 tables; skip the HCP career
    # phase (that's stage 8; v2 auto-skips it anyway). The DOI-ENRICHMENT phase (the one that writes
    # authorships + sets openalex_enriched_at) is what we need -- it is forced ON via the
    # SKIP_DOI_ENRICHMENT=0 env override at the run_stage call site (this env sets that var truthy,
    # which would otherwise skip the phase and make 1b a no-op). There is no CLI flag to force it on.
    # GATE-A is built into the script: it enriches pubs with a DOI where
    # openalex_enriched_at IS NULL. BILLING NOTE: that is the primary batch PLUS the second-pass
    # author-history pubs PLUS any un-enriched backlog -- NOT scoped to the ~primary batch. This is
    # intentional (the 2nd-pass pubs were ingested for career depth and must be flattened+inventoried
    # to count toward thin HCPs' corpus_pub_count). Steady-state volume ~= new pubs/week; the FIRST
    # run clears the whole backlog (potentially large). To scope tighter, openalex_pipeline would need
    # a --pmids/--pub-ids filter (it has none today) -- a deliberate follow-up, not silently assumed.
    return py("openalex_pipeline") + ["--target-version", "v2", "--skip-career-enrichment"]


def cmd_run_sql_file(
    sql_path: str,
    params: Optional[Dict[str, str]] = None,
    statement_timeout: Optional[str] = None,
) -> List[str]:
    cmd = py("run_sql") + ["--file", sql_path]
    for key, value in (params or {}).items():
        cmd += ["--param", f"{key}={value}"]
    if statement_timeout is not None:
        cmd += ["--statement-timeout", statement_timeout]
    return cmd


def cmd_create_hcps(slug: str, summary_path: str) -> List[str]:
    return py("create_hcps") + ["--ta", slug, "--incremental", "--summary-out", summary_path]


def cmd_compute_affected(hcp_run_id: str, batch_pubs_path: str, affected_path: str) -> List[str]:
    return py("compute_affected") + [
        "--run-id", hcp_run_id, "--pub-ids-file", batch_pubs_path, "--out", affected_path,
    ]


def cmd_ta_tagging(slug: str, affected_path: str) -> List[str]:
    # --yes: ta_tagging's --execute path prompts input() for confirmation; unattended (3am cron) there
    # is no TTY to answer it, so without --yes the stage blocks forever after its read phase. (Also
    # hardened at the subprocess level: run_stage gives every child stdin=DEVNULL -- see run_stage.)
    return py("ta_tagging") + [
        "--ta", slug, "--candidate-hcp-ids-file", affected_path, "--execute", "--yes",
    ]


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


def cmd_build_asset_matches() -> List[str]:
    # 10: rebuild asset_publication_v1 from config/assets.json (swap-in; no args -- reads DATABASE_URL).
    return py("asset_matches")


# ---------------------------------------------------------------------------
# Subprocess runner (streams live output, optionally captures a stdout pattern), fail-fast.
# ---------------------------------------------------------------------------

def run_stage(
    stage_no: int, name: str, cmd: List[str],
    capture_pattern: Optional[str] = None, extra_env: Optional[Dict[str, str]] = None,
) -> Optional[str]:
    print(f"\n{'='*72}\n[stage {stage_no}] {name}\n  $ {_display(cmd)}\n{'='*72}", flush=True)
    t0 = time.time()
    captured: Optional[str] = None
    # Force UTF-8 both ways: decode child output as utf-8 with errors="replace" so a stray
    # byte (accented author names on Windows' cp1252 default) becomes a replacement char
    # instead of crashing the reader; PYTHONIOENCODING makes the children emit utf-8 too.
    child_env = dict(os.environ, PYTHONIOENCODING="utf-8")
    # Per-stage env overrides. NOTE: these must be values the child's load_dotenv(override=False)
    # will NOT clobber -- since the key is already present in the child env, .env is ignored for it.
    if extra_env:
        child_env.update(extra_env)
    # stdin=DEVNULL: this orchestrator is unattended (3am cron). No stage should ever expect
    # interactive input; with DEVNULL a stray input() gets EOF and raises (fail-fast) instead of
    # blocking forever on an inherited pipe/TTY -- the exact ta_tagging hang after its committed reads.
    proc = subprocess.Popen(
        cmd, cwd=str(REPO_ROOT), stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
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


def read_pmids_file(path: Path) -> List[str]:
    """One pmid per line; blanks ignored. Missing file -> empty list."""
    if not path.exists():
        return []
    out: List[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s:
            out.append(s)
    return out


def gen_batch_pubs_file(primary_pmids_path: Path, batch_pubs_path: Path) -> int:
    """Resolve THIS cycle's batch pub uuids from the authoritative PRIMARY pmid set.

    Batch identity comes from stage 1's --primary-pmids-out file (the esearch windowed result),
    NOT from publications_v2.ingestion_run_id. The run_id stamp is insert-only (created-by), so it
    under-captures re-ingested papers that kept an older run_id -> "batch pub-ids: 0". Resolving
    pmid -> id via `WHERE pubmed_id = ANY(...)` is complete regardless of created-by provenance.
    Caller handles the empty case (0 primary pmids = quiet week) BEFORE this is reached.
    """
    pmids = read_pmids_file(primary_pmids_path)
    if not pmids:
        batch_pubs_path.write_text("", encoding="utf-8")
        print(f"  [gen] batch pub-ids: 0 (no primary pmids) -> {batch_pubs_path}")
        return 0
    return _write_ids_file(
        "SELECT id FROM publications_v2 WHERE pubmed_id = ANY(%s)", (pmids,),
        batch_pubs_path, "batch pub-ids",
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
    P = str(work / "primary_pmids.txt")
    IS = str(work / "ingest_run_summary.json")
    HCP = "<HCP_RUN_ID>"
    PUB = "<PUB_RUN_ID>"
    TAID = "<TA_ID>"

    ingest_label = "1  ingest (capture PUB_RUN_ID from stdout; emit PRIMARY pmids -> primary_pmids.txt)"
    window_note = " ".join(date_args) if date_args else "full corpus"
    ingest_label += f"  [window: {window_note}]"
    if ingest_limit is not None:
        ingest_label += f"  [--limit {ingest_limit}]"
    else:
        ingest_label += "  [unbounded]"

    plan: List[Tuple[str, List[str]]] = [
        (ingest_label, cmd_ingest(slug, ingest_limit, date_args, P, IS)),
        ("   [quiet-week gate] if primary_pmids.txt is EMPTY -> skip whole cycle (incl. all billed OpenAlex), mark SUCCESS/skipped, exit 0", []),
        ("1b openalex enrich pubs -> publications_v2.authorships  [GATE-A: ALL enriched_at IS NULL DOI pubs "
         "= primary + 2nd-pass author-history + any backlog; BILLED, NOT just the ~primary batch]",
         cmd_openalex_enrich_pubs()),
        ("1c flatten author_pub_flat (full O(corpus) rebuild from authorships)  [GATE-D: runs AFTER 1b; unbilled SQL]",
         cmd_run_sql_file(str(BUILD_AUTHOR_FLAT_SQL))),
        ("1d inventory upsert -> openalex_author_inventory (HAVING count>=3, GREATEST no-clobber "
         "[GATE-B]; committed SQL, ta_id bound param; unbilled)",
         cmd_run_sql_file(str(INVENTORY_UPSERT_SQL_FILE), {"ta_id": TAID}, INVENTORY_STATEMENT_TIMEOUT)),
        ("2  create_hcps (mints HCP_RUN_ID -> run_summary.json)  [now has author_pub_flat + inventory]", cmd_create_hcps(slug, S)),
        ("   [gen] batch_pubs.txt = publications_v2 WHERE pubmed_id = ANY(primary_pmids.txt)", []),
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
        (("10 asset_matches (rebuild asset_publication_v1 from config/assets.json; swap-in ~2s live lock; "
          "NON-BLOCKING -- WARN not FAILED)" if slug == ASSET_MATCHES_TA
          else f"10 asset_matches  [SKIPPED: NSCLC-only, ta={slug}]"),
         cmd_build_asset_matches() if slug == ASSET_MATCHES_TA else []),
    ]

    print("=" * 72)
    print("  REINGEST CYCLE - PLAN (DRY-RUN: nothing is executed)")
    print("=" * 72)
    print(f"  TA:            {slug}")
    print(f"  ta_id:         {TAID}  (resolved at execute time)")
    print(f"  HCP_RUN_ID:    {HCP}   (minted by stage 2)")
    print(f"  PUB_RUN_ID:    {PUB}   (minted by stage 1; created-by stamp, NO LONGER the batch definition)")
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
    ingest_summary = work / "ingest_run_summary.json"  # stage-1 funnel counters + hard-guard summary
    primary_pmids = work / "primary_pmids.txt"  # authoritative batch identity, emitted by stage 1
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
            pub_run_id = run_stage(
                1, "ingest",
                cmd_ingest(slug, ingest_limit, date_args, str(primary_pmids), str(ingest_summary)),
                capture_pattern=r"\[pubmed_pipeline\]\s+ingestion_run_id=(\S+)",
            )
            if not pub_run_id:
                raise StageFailure(1, "ingest", 1)  # could not capture PUB_RUN_ID
            save_state(work, {"ta_id": ta_id, "pub_run_id": pub_run_id, "hcp_run_id": hcp_run_id})
            note(1, "ingest", "OK")

            # QUIET-WEEK GATE: stage 1 emits primary_pmids.txt (the authoritative batch = the esearch
            # windowed result). A MISSING file is a misconfiguration (stage 1 must emit it); an EMPTY
            # file is a genuinely quiet week -- 0 new primary papers, nothing to process. On a quiet
            # week, skip the whole cycle cleanly: no affected-set fan-out, no rescore (nothing changed).
            # Mark the completion marker SUCCESS/skipped and exit 0 -- NOT fail-fast, NOT whole-TA
            # reprocessing (which is what an empty batch_pubs previously degenerated into).
            if not primary_pmids.exists():
                raise SystemExit(
                    f"stage 1 did not emit {primary_pmids} (expected --primary-pmids-out). "
                    f"Cannot determine batch identity; aborting."
                )
            primary_count = len(read_pmids_file(primary_pmids))
            print(f"  primary papers this window: {primary_count:,}")
            if primary_count == 0:
                note(1, "quiet_week", "SKIPPED")
                write_completion_marker(work, {
                    "ta": slug, "ta_id": ta_id, "hcp_run_id": hcp_run_id, "pub_run_id": pub_run_id,
                    "snapshot_date": snapshot, "started_at": started_at,
                    "ended_at": datetime.now(timezone.utc).isoformat(),
                    "stages": stage_status, "result": "SUCCESS", "skipped": "quiet_week",
                    "note": "quiet week: 0 new primary papers, nothing to do", "failed_stage": None,
                })
                print(f"\n{'='*72}\n  QUIET WEEK  ta={slug}: 0 new primary papers this window; "
                      f"nothing to do.\n  Cycle skipped cleanly (SUCCESS). "
                      f"({time.time()-t0:.0f}s)\n{'='*72}")
                return 0

            # ----------------------------------------------------------------------------------
            # OpenAlex sub-sequence (1b/1c/1d) -- grouped under stage 1 (like 7a/7b, 8a-8d). Runs
            # ONLY on a non-quiet week (after the gate's return 0 above), so a quiet week never
            # incurs the billed OpenAlex calls. These populate create_hcps' prerequisites
            # (publications_v2.authorships -> author_pub_flat -> openalex_author_inventory), which
            # is exactly what was missing -> the "0 new HCPs every run" + empty-Group-B defect.
            # ----------------------------------------------------------------------------------
            # 1b: pub-level OpenAlex enrichment (BILLED). GATE-A: only enriched_at IS NULL pubs.
            # SKIP_DOI_ENRICHMENT=0 FORCES the DOI-enrichment phase ON: openalex_pipeline gates that
            # phase on `args.skip_doi_enrichment OR env_flag_true("SKIP_DOI_ENRICHMENT")`, and this
            # env has that var set truthy -> without the override, 1b skips the very phase that writes
            # publications_v2.authorships and is a silent no-op. The child's load_dotenv(override=False)
            # keeps our "0" (the key is already present in the child env), so .env cannot re-enable it.
            run_stage(1, "openalex_enrich_pubs(1b)", cmd_openalex_enrich_pubs(),
                      extra_env={"SKIP_DOI_ENRICHMENT": "0"})
            note(1, "openalex_enrich_pubs(1b)", "OK")

            # 1c: rebuild author_pub_flat from the now-enriched authorships (GATE-D: after 1b).
            run_stage(1, "flatten_author_pub_flat(1c)", cmd_run_sql_file(str(BUILD_AUTHOR_FLAT_SQL)))
            note(1, "flatten_author_pub_flat(1c)", "OK")

            # 1d: inventory upsert for this TA's authors (GATE-B: GREATEST no-clobber, in the committed
            # SQL). ta_id is a BOUND param; run_sql raises statement_timeout for the heavy aggregate.
            run_stage(1, "inventory_upsert(1d)", cmd_run_sql_file(
                str(INVENTORY_UPSERT_SQL_FILE), {"ta_id": ta_id}, INVENTORY_STATEMENT_TIMEOUT))
            note(1, "inventory_upsert(1d)", "OK")

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

        # [gen batch_pubs] needed by stages 3 and 6 -- resolved from the PRIMARY pmid set
        # (authoritative batch identity: pubmed_id = ANY(primary_pmids.txt)), NOT the created-by
        # run_id stamp, which under-captures re-ingested papers that kept an older run_id.
        if running(3) or running(6):
            if not primary_pmids.exists():
                raise SystemExit(
                    f"{primary_pmids} missing (stage 1 emits it). Re-run from top."
                )
            if running(3) or not batch_pubs.exists():
                gen_batch_pubs_file(primary_pmids, batch_pubs)

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

        # 10 ASSET MATCHES (NSCLC only) -- NON-BLOCKING. After the scoring chain; failure is
        # isolated so it never marks the cycle FAILED (a stale asset table costs ~400 pubs/month
        # and must not gate the rising scores). Skipped for non-NSCLC TAs (no asset config).
        if running(10):
            if slug != ASSET_MATCHES_TA:
                note(10, "asset_matches", f"SKIPPED(not {ASSET_MATCHES_TA})")
            else:
                try:
                    run_stage(10, "asset_matches", cmd_build_asset_matches())
                    note(10, "asset_matches", "OK")
                except Exception as ae:  # non-blocking: log + continue (StageFailure incl.)
                    note(10, "asset_matches", f"WARN({type(ae).__name__})")
                    print(f"\n[reingest_cycle] WARN: stage 10 asset_matches failed ({ae}); "
                          f"cycle still SUCCESS (non-blocking). Asset table left at prior build.",
                          file=sys.stderr)

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
                   help=f"Skip to a stage (number 1-{MAX_STAGE} or name: "
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
    if v.isdigit() and 1 <= int(v) <= MAX_STAGE:
        return int(v)
    if v in STAGE_NAME_TO_NUM:
        return STAGE_NAME_TO_NUM[v]
    raise SystemExit(
        f"--resume-from: unknown stage '{value}'. Use 1-{MAX_STAGE} or one of: "
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
