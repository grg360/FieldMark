"""Freshness gate — is each artifact newer than its inputs, PER THERAPEUTIC AREA?

WHY THIS EXISTS. Every coverage query in docs/ta_completeness_manifest.draft.yaml asks
whether an artifact has rows for a TA. None asks whether it was produced after its inputs
last changed. On 2026-09-09 workstream B added 19,043 NPI-native records, four downstream
producers were never re-run, every coverage query stayed green, and the colorectal
community board sat at 116 members instead of 13,914 for eight days. Stale, not missing.

THREE STATES, AND unknown NEVER FOLDS INTO ok. A check that cannot answer must say so.
Folding unknown into ok is how the coverage queries read green for eight days; folding it
into stale would cry wolf on artifacts nobody can fix. Every unknown carries a REASON.

EVERY READ IS TA-SCOPED. A whole-relation max() is not a weaker answer here, it is a wrong
one. Measured 2026-09-18: hcp_community_scores_v2 whole-table max reads "today" while
hepatology's rows are 114 days old and rare-disease's 114 days old. The same shape hid the
colorectal rot behind lung's freshness. No pg_stat_user_tables, no relation mtime, no
n_tup_ins -- those reset on restart, count vacuum rather than writes, and are whole-relation
besides, so they would have called all four of the 2026-09-09 tables fresh.

WHAT THIS CAN AND CANNOT PROVE. It can prove staleness. It CANNOT prove freshness: a
producer that ran and wrote nothing -- because its input was empty, or it read the wrong
table, or it was refused at the boundary -- leaves max(ts) unchanged and is indistinguishable
from one that never ran. All three happened in this codebase in September 2026. That is why
the prospective ledger (pipeline_runs) exists alongside this, and why a missing ledger row
escalates rather than passes.
"""
from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import psycopg
from dotenv import load_dotenv

# ── The watermark ─────────────────────────────────────────────────────────────────────────
# CATEGORY-B ARTIFACTS CARRIED A FIRST-WRITE DATE UNTIL THIS DAY. Their timestamp columns
# have DEFAULT now(), which fires only on the INSERT half of an upsert, so a re-run left the
# stamp at its original value. The payloads were repaired on 2026-09-18 -- but repairing a
# payload only makes the stamp correct GOING FORWARD. Every value already stored is a
# first-write date, and after the repair it is indistinguishable from a correct one until
# that producer next runs.
#
# So any category-B timestamp at or before this date resolves to unknown/pre_watermark.
#
# THIS IS DELIBERATELY NOT A BACKFILL. NULLing or rewriting those columns would mutate
# production data on live tables to fix an observability problem, and any reader that
# displays or sorts on them would acquire a defect from a freshness fix. The watermark
# mutates nothing and cannot break a reader. One constant, one place.
STAMP_REPAIR_DATE = datetime(2026, 9, 18, tzinfo=timezone.utc)

# Artifacts whose stored stamps predate the repair. Each names the site that was fixed.
CATEGORY_B: Dict[str, str] = {
    "publication_therapeutic_areas_v2": "ingest/pubmed_pipeline.py upsert payload",
    "hcp_open_payments_by_ta_v2": "aggregate/open_payments_aggregator.py upsert payload",
    "theme_to_canonical_v1": "classify/bucket_themes.py upsert payload",
    "hcp_rising_board_snapshots": "utilities/take_weekly_snapshot.py DO UPDATE (refreshed_at)",
}

# ── Reason codes ──────────────────────────────────────────────────────────────────────────
# no_producer RENDERS AT THE WEIGHT OF stale, NOT WITH THE OTHER THREE. The other reasons
# mean "we cannot measure this"; no_producer means "nothing can change this" -- the artifact
# is dead and no re-run will ever refresh it. An operator must be able to tell those apart at
# a glance, because the actions are opposite: investigate versus retire.
R_NO_TIMESTAMP = "no_timestamp"
R_PRE_WATERMARK = "pre_watermark"
# no_producer is retained and wired, but NO ARTIFACT CURRENTLY CARRIES IT. The r3 audit
# checked the one candidate (hcp_scores_v2) and found a real, indirect writer. The code path
# stays because a retired producer is a question this gate must be able to answer - and
# because removing it would mean the next dead artifact silently reads as merely unmeasured.
R_NO_PRODUCER = "no_producer"
R_UPSTREAM_UNKNOWN = "upstream_unknown"

OK, STALE, UNKNOWN = "ok", "stale", "unknown"


class Artifact:
    """One manifest artifact, reduced to what the gate needs."""

    def __init__(self, name: str, ts_column: Optional[str], ta_column: Optional[str],
                 upstreams: List[str], producer: Optional[str],
                 instrumentable: bool = True):
        self.name = name
        self.ts_column = ts_column
        self.ta_column = ta_column
        self.upstreams = upstreams
        self.producer = producer
        # instrumentable: false SUPPRESSES ONLY THE LEDGER-ABSENCE ESCALATION. The artifact
        # does not read stale merely for having no pipeline_runs row, because its writer
        # cannot reach the ta_cycle/generate_cycle call sites at all (pulse_ai_synthesis is
        # written by a Supabase Edge Function). IT SUPPRESSES NOTHING ELSE: the retrospective
        # comparison still runs against it, and a genuine stale verdict from that comparison
        # still fires. This field is otherwise an obvious place for a future artifact to
        # hide, so the boundary is stated here and enforced in evaluate() below.
        self.instrumentable = instrumentable


# ── The registry ──────────────────────────────────────────────────────────────────────────
# Column names verified against live pg_attribute on 2026-09-18, not inferred from repo
# files. ta_column None means the table carries no TA key and cannot be scoped -- those
# resolve to unknown/no_timestamp regardless of whether a timestamp column exists, because a
# whole-relation answer is the wrong answer.
ARTIFACTS: List[Artifact] = [
    Artifact("hcp_therapeutic_areas_v2", "assigned_at", "therapeutic_area_id",
             [], "classify/ta_tagging_rebuild_v2.py"),
    Artifact("publication_therapeutic_areas_v2", "tagged_at", "therapeutic_area_id",
             [], "ingest/pubmed_pipeline.py"),
    Artifact("hcp_cohort_classification_v2", "classified_at", "therapeutic_area_id",
             ["hcp_therapeutic_areas_v2", "publication_therapeutic_areas_v2"],
             "classify/cohort_classification_v2.py"),
    Artifact("hcp_publication_leadership_v2", "computed_at", "therapeutic_area_id",
             ["publication_therapeutic_areas_v2"], "score/publication_leadership_scoring.py"),
    Artifact("hcp_network_centrality_v2", "computed_at", "therapeutic_area_id",
             ["publication_therapeutic_areas_v2"], "score/network_centrality_scoring.py"),
    Artifact("hcp_scientific_momentum_v1", "computed_at", "therapeutic_area_id",
             ["publication_therapeutic_areas_v2"], "score/scientific_momentum_scoring.py"),
    Artifact("hcp_network_momentum_v1", "computed_at", "therapeutic_area_id",
             ["hcp_network_centrality_v2"], "score/network_momentum_scoring.py"),
    Artifact("hcp_scientific_emergence_v1", "computed_at", "therapeutic_area_id",
             ["hcp_scientific_momentum_v1"], "score/emergence_scoring.py"),
    Artifact("hcp_rising_star_ranks_v3", "computed_at", "therapeutic_area_id",
             ["hcp_scientific_momentum_v1", "hcp_network_momentum_v1",
              "hcp_cohort_classification_v2"],
             # The ORCHESTRATOR, deliberately: rising_score.py names rising_star_scoring.py
             # at :104 and subprocesses it at :243. "What do I re-run" is the question.
             "score/rising_score.py"),
    Artifact("hcp_rising_composite_v1", "computed_at", "therapeutic_area_id",
             ["hcp_scientific_emergence_v1"], "score/rising_composite_scoring.py"),
    Artifact("hcp_established_scores_v2", "scored_at", "therapeutic_area_id",
             ["hcp_publication_leadership_v2", "hcp_network_centrality_v2"],
             "score/established_scoring.py"),
    Artifact("hcp_established_ranks_v3", "computed_at", "therapeutic_area_id",
             ["hcp_established_scores_v2"], "score/recompute_established_ranks_v3.py"),
    Artifact("hcp_community_scores_v2", "scored_at", "therapeutic_area_id",
             ["hcp_cohort_classification_v2", "hcp_medicare_by_ta_v2",
              "hcp_open_payments_by_ta_v2"], "score/community_scoring.py"),
    Artifact("hcp_medicare_by_ta_v2", "aggregated_at", "therapeutic_area_id",
             [], "aggregate/medicare_aggregator.py"),
    Artifact("hcp_open_payments_by_ta_v2", "aggregated_at", "therapeutic_area_id",
             [], "aggregate/open_payments_aggregator.py"),
    Artifact("hcp_pharma_engagement_v2", "computed_at", "therapeutic_area_id",
             ["hcp_open_payments_by_ta_v2"], "score/pharma_engagement_scoring.py"),
    Artifact("hcp_top_collaborators_v2", "computed_at", "therapeutic_area_id",
             ["publication_therapeutic_areas_v2"], "aggregate/compute_top_collaborators.py"),
    Artifact("hcp_research_themes_v2", "extracted_at", "therapeutic_area",
             ["publication_therapeutic_areas_v2"], "classify/extract_research_themes.py"),
    Artifact("theme_canonical_v1", "created_at", "therapeutic_area",
             ["hcp_research_themes_v2"], "classify/bucket_themes.py"),
    Artifact("theme_to_canonical_v1", "assigned_at", "therapeutic_area",
             ["hcp_research_themes_v2"], "classify/bucket_themes.py"),
    Artifact("publication_theme_v1", "labeled_at", "therapeutic_area_id",
             ["publication_therapeutic_areas_v2"], "label_pub_themes.py"),
    Artifact("hcp_scientific_positions_v1", "extracted_at", "therapeutic_area_id",
             ["hcp_rising_star_ranks_v3"], "narrative/extract_scientific_positions.py"),
    Artifact("hcp_ai_overviews", "generated_at", "therapeutic_area",
             ["hcp_scientific_positions_v1"],
             "narrative/generate_scientific_position_synthesis.py"),
    Artifact("hcp_narratives_v2", "generated_at", "therapeutic_area_slug",
             ["hcp_rising_star_ranks_v3", "hcp_established_ranks_v3",
              "hcp_community_scores_v2"], "narrative/generate_narratives_v2.py"),
    Artifact("clinical_trials_ta_v2", "tagged_at", "therapeutic_area_id",
             [], "classify/trial_ta_mapping.py"),
    Artifact("hcp_rising_board_snapshots", "refreshed_at", "therapeutic_area_id",
             ["hcp_rising_star_ranks_v3"], "utilities/take_weekly_snapshot.py"),
    Artifact("hcp_established_board_snapshots", "created_at", "therapeutic_area_id",
             ["hcp_established_ranks_v3"], "utilities/take_weekly_snapshot.py"),
    # instrumentable=False: written by supabase/functions/generate-pulse-synthesis/
    # index.ts:166, an Edge Function that cannot reach the ta_cycle call sites.
    Artifact("pulse_ai_synthesis", "generated_at", "ta_slug", [], "edge:generate-pulse-synthesis",
             instrumentable=False),
    # hcp_scores_v2 HAS a producer. A grep for the literal finds only a comment
    # (scoring_pipeline.py:894), a read (rerun_ranks.py:9,14) and an id-remap entry
    # (dedup_merge.py:542) - which briefly produced a false "no writer exists" finding
    # during the r3 audit. The write is real and indirect: scores_table =
    # get_table_name("hcp_scores", target_version) at :1153, upsert at :1201.
    Artifact("hcp_scores_v2", "scored_at", "therapeutic_area_id", [],
             "score/scoring_pipeline.py"),
]

BY_NAME = {a.name: a for a in ARTIFACTS}

# Artifacts a billed stage depends on. A stale input here does not merely produce a stale
# artifact, it produces confidently-worded prose about the wrong population -- 867 briefs in
# the September case. ta_cycle.py:7-8 already stops before the billed narrative stages when
# the board is unvalidated; this is the same rule, applied to the same stages.
BILLED_INPUTS = {
    "hcp_community_scores_v2", "hcp_rising_star_ranks_v3", "hcp_established_ranks_v3",
    "hcp_scientific_positions_v1", "hcp_cohort_classification_v2",
}


def _conn():
    load_dotenv()
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set")
    return psycopg.connect(url)


def _ta_filter(art: Artifact, ta_slug: str, ta_id: str) -> Tuple[str, Any]:
    """The per-TA predicate for this artifact's key form. Text keys in this corpus are NOT
    uniformly cased -- hcp_research_themes_v2 holds 'NSCLC' and 'COLORECTAL-CANCER',
    hcp_ai_overviews holds 'colorectal-cancer' -- so text comparison is case-insensitive
    against the slug. uuid keys compare exactly."""
    col = art.ta_column
    if col in ("therapeutic_area_id",):
        return "%s = %%s" % col, ta_id
    return "lower(%s) = lower(%%s)" % col, ta_slug


def read_ts(cur, art: Artifact, ta_slug: str, ta_id: str) -> Optional[datetime]:
    if not art.ts_column or not art.ta_column:
        return None
    pred, val = _ta_filter(art, ta_slug, ta_id)
    cur.execute(
        "SELECT max(%s) FROM public.%s WHERE %s" % (art.ts_column, art.name, pred), (val,)
    )
    row = cur.fetchone()
    return row[0] if row else None


def ledger_ts(cur, artifact_name: str, ta_id: str) -> Optional[datetime]:
    """Last SUCCESSFUL run recorded for this artifact and TA. NULL therapeutic_area_id means
    NOT TA-SCOPED and must never be read as covering every TA, so it is not matched here."""
    cur.execute(
        """
        SELECT max(completed_at) FROM public.pipeline_runs
        WHERE target_artifact = %s AND therapeutic_area_id = %s AND status = 'success'
        """,
        (artifact_name, ta_id),
    )
    row = cur.fetchone()
    return row[0] if row else None


def evaluate(cur, art: Artifact, ta_slug: str, ta_id: str) -> Dict[str, Any]:
    """One verdict. Order matters: the reasons that make a comparison impossible are
    resolved before the comparison is attempted."""
    res: Dict[str, Any] = {
        "artifact": art.name, "state": UNKNOWN, "reason": None,
        "artifact_ts": None, "newest_upstream": None, "upstream_name": None,
        "billed": art.name in BILLED_INPUTS,
    }

    if art.producer is None:
        res["reason"] = R_NO_PRODUCER
        return res

    if not art.ts_column or not art.ta_column:
        res["reason"] = R_NO_TIMESTAMP
        return res

    ts = read_ts(cur, art, ta_slug, ta_id)
    res["artifact_ts"] = ts
    if ts is None:
        res["reason"] = R_NO_TIMESTAMP
        return res

    if art.name in CATEGORY_B and ts <= STAMP_REPAIR_DATE:
        res["reason"] = R_PRE_WATERMARK
        return res

    newest, newest_name = None, None
    unknown_upstream = None
    for up in art.upstreams:
        ua = BY_NAME.get(up)
        if ua is None:
            unknown_upstream = up
            continue
        uts = read_ts(cur, ua, ta_slug, ta_id)
        if uts is None:
            unknown_upstream = up
            continue
        if ua.name in CATEGORY_B and uts <= STAMP_REPAIR_DATE:
            unknown_upstream = up
            continue
        if newest is None or uts > newest:
            newest, newest_name = uts, up

    res["newest_upstream"] = newest
    res["upstream_name"] = newest_name

    if newest is not None and ts < newest:
        res["state"] = STALE
        return res

    # LEDGER ESCALATION, AND THE ONE THING instrumentable SUPPRESSES. Row-max cannot prove a
    # producer ran; a run that wrote nothing looks identical to one that never happened. If
    # the artifact is instrumentable and the ledger has no successful run for it in this TA,
    # we cannot confirm it ran -- and the fail-safe direction is unknown, never ok.
    if art.instrumentable and ledger_ts(cur, art.name, ta_id) is None:
        res["reason"] = R_UPSTREAM_UNKNOWN if unknown_upstream else "no_ledger_row"
        return res

    if unknown_upstream:
        res["reason"] = R_UPSTREAM_UNKNOWN
        return res

    if newest is None and art.upstreams:
        res["reason"] = R_UPSTREAM_UNKNOWN
        return res

    res["state"] = OK
    return res


def run_gate(ta_slugs: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {}
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, slug FROM public.therapeutic_areas WHERE slug = ANY(%s)",
                    (ta_slugs,))
        rows = cur.fetchall()
        found = {r[1]: str(r[0]) for r in rows}
        for slug in ta_slugs:
            ta_id = found.get(slug)
            if ta_id is None:
                out[slug] = [{"artifact": "(TA)", "state": UNKNOWN,
                              "reason": "slug not in therapeutic_areas",
                              "artifact_ts": None, "newest_upstream": None,
                              "upstream_name": None, "billed": False}]
                continue
            out[slug] = [evaluate(cur, a, slug, ta_id) for a in ARTIFACTS]
    return out


def _fmt(ts) -> str:
    return ts.strftime("%Y-%m-%d") if ts else "-"


def render(results: Dict[str, List[Dict[str, Any]]], verbose: bool = False) -> Tuple[int, int]:
    """Prints per TA. Returns (stale_count, billed_stale_count)."""
    stale_total = billed_stale = 0
    for slug, rows in results.items():
        stale = [r for r in rows if r["state"] == STALE]
        dead = [r for r in rows if r["reason"] == R_NO_PRODUCER]
        unk = [r for r in rows if r["state"] == UNKNOWN and r["reason"] != R_NO_PRODUCER]
        ok = [r for r in rows if r["state"] == OK]
        print("\n=== %s ===" % slug)
        print("  ok %d   stale %d   dead %d   unknown %d" % (len(ok), len(stale), len(dead), len(unk)))
        for r in stale:
            mark = "BILLED" if r["billed"] else "      "
            print("  STALE   %s %-34s %s  <  %s (%s)" % (
                mark, r["artifact"], _fmt(r["artifact_ts"]),
                _fmt(r["newest_upstream"]), r["upstream_name"]))
            stale_total += 1
            if r["billed"]:
                billed_stale += 1
        # no_producer renders at the weight of stale: it means dead, not unmeasured.
        for r in dead:
            print("  DEAD    %-41s %s  no producer exists; no run can refresh it"
                  % (r["artifact"], _fmt(r["artifact_ts"])))
        if verbose:
            for r in unk:
                print("  unknown %-41s reason=%s" % (r["artifact"], r["reason"]))
            for r in ok:
                print("  ok      %-41s %s" % (r["artifact"], _fmt(r["artifact_ts"])))
        else:
            by_reason: Dict[str, int] = {}
            for r in unk:
                by_reason[r["reason"]] = by_reason.get(r["reason"], 0) + 1
            if by_reason:
                print("  unknown by reason: " + ", ".join(
                    "%s=%d" % (k, v) for k, v in sorted(by_reason.items())))
    return stale_total, billed_stale


def gate(ta_slugs: List[str], verbose: bool = False) -> int:
    """Exit code: 0 clean or warn-only, 1 when a BILLED input is stale.

    WARN ON UNBILLED, BLOCK ON BILLED. Not a compromise -- it is the rule the codebase
    already applies at ta_cycle.py:7-8, where the billed narrative stages are refused
    against an unvalidated board. A stale scoring table makes a cheap stage produce a stale
    artifact; it makes an expensive stage produce hundreds of confident briefs about the
    wrong population. The asymmetry in cost is the asymmetry in enforcement.
    """
    results = run_gate(ta_slugs)
    stale, billed_stale = render(results, verbose=verbose)
    print("\n--- freshness summary ---")
    print("stale artifacts: %d (billed inputs: %d)" % (stale, billed_stale))
    if billed_stale:
        print("BLOCK: a billed stage's input is stale. Re-run its producer before generating.")
        return 1
    if stale:
        print("WARN: stale artifacts found, none of them a billed input.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="TA freshness gate (read-only).")
    ap.add_argument("--ta", action="append", default=None,
                    help="TA slug; repeatable. Default: every slug in therapeutic_areas.")
    ap.add_argument("--verbose", action="store_true", help="list ok and unknown rows too")
    args = ap.parse_args()
    slugs = args.ta
    if not slugs:
        with _conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT slug FROM public.therapeutic_areas ORDER BY slug")
            slugs = [r[0] for r in cur.fetchall()]
    return gate(slugs, verbose=args.verbose)


if __name__ == "__main__":
    raise SystemExit(main())
