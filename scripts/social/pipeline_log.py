"""pipeline_runs writers for the social pipeline.

Non-blocking by design: a logging failure prints a WARN and never fails the
run - observability must not gate capture (KNOWN_ISSUES: silent-failure
entries). start_run inserts status='running'; a row stuck in 'running' is
itself signal - a crashed run leaves a trace instead of silence.
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
              metrics: Optional[Dict[str, Any]] = None) -> Optional[str]:
    try:
        resp = _client().table("pipeline_runs").insert({
            "pipeline_name": pipeline_name,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "status": "running",
            "metrics": metrics or {},
            "triggered_by": triggered_by,
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
