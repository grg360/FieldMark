"""pipeline_runs writers.

Non-blocking by design: a logging failure prints a WARN and never fails the
run - observability must not gate capture (KNOWN_ISSUES: silent-failure
entries). start_run inserts status='running'; a row stuck in 'running' is
itself signal - a crashed run leaves a trace instead of silence.

NON-BLOCKING IS STILL CORRECT NOW THAT A FRESHNESS GATE DEPENDS ON THIS, AND THE REASON IS
THE GATE'S DEFAULT, NOT THIS MODULE. scripts/utils/freshness.py treats a MISSING ledger row
as unknown, never as pass. So a logging outage degrades toward a false alarm and never
toward a false all-clear, which is the direction that costs nothing to be wrong in. Making
the stamp blocking would let an observability failure stop a pipeline while buying no
safety the fail-safe default does not already provide.

No longer social-only: ta_cycle.py and generate_cycle.py write here too. The call sites stay
in the two orchestrators rather than in 30+ producer scripts - one place to get right, and a
producer run OUTSIDE a cycle correctly logs nothing, which is honest, because an
out-of-cycle run is exactly the unobserved case the gate exists to flag.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from supabase import create_client


def _client():
    load_dotenv()
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def start_run(pipeline_name: str, triggered_by: str,
              metrics: Optional[Dict[str, Any]] = None,
              *,
              therapeutic_area_id: Optional[str] = None,
              target_artifact: Optional[str] = None) -> Optional[str]:
    """Open a run row.

    therapeutic_area_id AND target_artifact ARE KEYWORD-ONLY AND OPTIONAL (2026-09-18) so
    the three existing callers - dol_matching.py:563, scheduled_capture.py:109 and the
    hcpcs top-up - are untouched and keep writing NULL for both.

    NULL therapeutic_area_id MEANS NOT TA-SCOPED, NEVER ALL TAS. scripts/utils/freshness.py
    matches the ledger on an explicit ta id and will not treat a NULL row as covering a TA.

    target_artifact is the TABLE the run produces, not the script: pipeline_name identifies
    the producer, and one producer can write several artifacts (reingest_diff.py writes
    three; generate_narratives_v2 writes one table for three cohorts). The freshness gate
    joins on the artifact.
    """
    try:
        resp = _client().table("pipeline_runs").insert({
            "pipeline_name": pipeline_name,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "status": "running",
            "metrics": metrics or {},
            "triggered_by": triggered_by,
            "therapeutic_area_id": therapeutic_area_id,
            "target_artifact": target_artifact,
        }).execute()
        return resp.data[0]["id"]
    except Exception as exc:  # never fail the pipeline for the log
        print(f"[pipeline_log] WARN: start_run failed: {exc}", flush=True)
        return None


def finish_run(run_id: Optional[str], status: str, *,
               rows_processed: Optional[int] = None,
               rows_succeeded: Optional[int] = None,
               rows_failed: Optional[int] = None,
               metrics: Optional[Dict[str, Any]] = None,
               error_message: Optional[str] = None) -> None:
    if run_id is None:
        return
    try:
        _client().table("pipeline_runs").update({
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "rows_processed": rows_processed,
            "rows_succeeded": rows_succeeded,
            "rows_failed": rows_failed,
            "metrics": metrics or {},
            "error_message": error_message,
        }).eq("id", run_id).execute()
    except Exception as exc:
        print(f"[pipeline_log] WARN: finish_run failed: {exc}", flush=True)
