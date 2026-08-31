"""
generate_cycle.py — Phase 2 generation orchestrator.

Runs AFTER ta_cycle.py completes. ta_cycle produces a corpus, identities and the
boards; this produces the surfaces a demo actually shows — research themes, canonical theme
buckets, collaborators, scientific positions, position synthesis, payment rollups, community
scores, and narratives.

Design: docs/canonical/GENERATE_CYCLE_DESIGN.md (2026-08-25).
Companions: docs/canonical/TA_GENERATION_LAYER.md, docs/canonical/ORCHESTRATOR_DEBT.md.

PURE ORCHESTRATION. No scoring or generation logic lives here. Every stage is an existing script
invoked by subprocess. What this file owns is the things phase 1 got wrong and paid for: key
resolution, verified completion, batch-scoped guards, stop/resume, and a spend gate.

    python scripts/generate_cycle.py --ta colorectal-cancer                      # dry-run (default)
    python scripts/generate_cycle.py --ta colorectal-cancer --execute            # unbilled stages only
    python scripts/generate_cycle.py --ta colorectal-cancer --execute --allow-billed --yes
    python scripts/generate_cycle.py --ta colorectal-cancer --execute --stop-after G3
    python scripts/generate_cycle.py --ta colorectal-cancer --execute --resume-from G4

Environment: DATABASE_URL (direct 5432), ANTHROPIC_API_KEY (token counting + billed stages).
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import subprocess
import sys
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import psycopg2
from dotenv import load_dotenv

load_dotenv()

REPO_ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable

# Model the billed stages actually pin (all five agree; verified 2026-08-27 by reading their
# MODEL / MODEL_NAME / ANTHROPIC_MODEL constants). Pricing is the current published rate for that
# model. If a stage's constant changes, this goes stale -- it is read from source below, not
# trusted from here.
BILLED_MODEL_FALLBACK = "claude-sonnet-4-6"
PRICE_PER_MTOK_INPUT = 3.00
PRICE_PER_MTOK_OUTPUT = 15.00

POSTCONDITION_RATIO = 0.90
STATE_DIR = REPO_ROOT / ".generate_work"

# ── CHILD OUTPUT CAPTURE ─────────────────────────────────────────────────────
# Three diagnoses in the 2026-08-27/28 CRC session each cost multiple round-trips purely
# because a child's output was gone by the time anyone looked:
#   * bucket_themes pass-2 truncation -- needed a synthetic response rebuilt from real theme
#     names and a count_tokens call to establish that 200 items could not fit in 8,192.
#   * G8 exiting 1 -- needed reading generate_narratives_v2 end to end to find the
#     confirmation prompt that EOFs without --yes.
#   * "1,206 extracted / 393 held" -- needed tracing write_positions by hand.
# Every one of those was answerable from the child's own stdout. It was streamed to a
# terminal and discarded.
#
# TAIL_LINES = 150. Sized from what actually needs to survive, not a round number: a chained
# Python traceback runs ~40-60 lines, generate_narratives_v2's cost-estimate plus summary
# block ~25, and the progress lines immediately before a failure -- the causal context -- are
# another ~20. 150 carries all three with room, and caps the state file at roughly 18 KB per
# stage, which keeps generate_state.json something a person still reads rather than greps.
# The FULL output always goes to the log file, so the tail is a convenience, never the record.
TAIL_LINES = 150
LOG_DIR_NAME = "logs"
# ─────────────────────────────────────────────────────────────────────────────


# ─────────────────────────────────────────────────────────────────────────────
# THE RESOLUTION TRAP  (docs/canonical/GENERATE_CYCLE_DESIGN.md § "slug / name / id")
#
# The generation layer keys therapeutic area THREE ways, and one column is internally
# inconsistent. hcp_ai_overviews holds 'NSCLC' for one TA and 'atopic-dermatitis' for another --
# one column, two kinds of string. A mis-resolved key fails in BOTH directions with no error: a
# verification query returns 0 for a stage that completed (re-runs a billed stage, pays twice), or
# a skip query matches nothing (silently skips work that never ran).
#
# So: resolve every form ONCE, carry them together, never pass a bare string to a stage, and
# ASSERT at startup that each text-keyed form matches >=1 row for a known-good TA.
# ─────────────────────────────────────────────────────────────────────────────

KNOWN_GOOD_SLUG = "nsclc"


@dataclass
class ResolvedTA:
    slug: str
    name: str
    uuid: str
    #: hcp_research_themes_v2.therapeutic_area -- G1's OWN literal from its TA_CONFIGS dict.
    #: NOT the slug and NOT the name (nsclc writes 'NSCLC'; AD writes 'Atopic Dermatitis').
    #: None when the TA has no TA_CONFIGS entry, which is itself the G1 blocker.
    themes_tag: Optional[str]
    #: theme_canonical_v1 / theme_to_canonical_v1 -- bucket_themes.py computes slug.upper()
    #: independently of G1's literal. The two agree ONLY for nsclc. See G2's precondition.
    buckets_key: str

    def label(self) -> str:
        return f"{self.name} ({self.slug})"


def get_conn():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set (direct 5432 connection, not the 6543 pooler).")
    return psycopg2.connect(url)


def scalar(conn, sql: str, params=()) -> int:
    """params may be a tuple (%s placeholders) or a dict (%(name)s placeholders)."""
    with conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        return int(row[0]) if row and row[0] is not None else 0


def _themes_ta_configs() -> Optional[Dict[str, Dict]]:
    """extract_research_themes.TA_CONFIGS, imported -- not regex-parsed out of the source.

    This used to scrape the dict with a regex, on the belief that importing would run
    load_dotenv() and construct an Anthropic client. That was wrong: both happen inside
    main() (:648 and :692), and the module has no top-level statements at all. bucket_themes
    now imports it for exactly this reason.

    Importing rather than parsing is what makes the WORK-SET honest. The regex could only
    ever reach `tag`; the thing that actually decides G1's cost and completion is the
    `selection` SQL, which is a multi-line string that regex-scraping a nested dict cannot
    reliably recover. Returns None if the import fails for any reason -- callers degrade to a
    labelled proxy rather than crashing the orchestrator over a config read.
    """
    try:
        sys.path.insert(0, str(REPO_ROOT / "scripts" / "classify"))
        import extract_research_themes as _themes  # noqa: PLC0415
        return dict(_themes.TA_CONFIGS)
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] could not import extract_research_themes.TA_CONFIGS ({exc}); "
              f"G1 falls back to a labelled proxy work-set")
        return None


def read_ta_configs_tag(slug: str) -> Optional[str]:
    """G1's `tag` for this slug -- the literal written to
    hcp_research_themes_v2.therapeutic_area.

    It cannot be derived from the slug or the name; whatever sits in that dict BECOMES the
    stored value. A missing entry is not a config gap to paper over -- it means nobody has
    made the cohort-scoping decision for this TA yet (the entry also needs a `selection`
    SQL), so G1 is genuinely not runnable.
    """
    cfg = _themes_ta_configs()
    if not cfg:
        return None
    entry = cfg.get(slug)
    return entry.get("tag") if entry else None


def themes_selection_sql(slug: str) -> Tuple[Optional[str], Optional[str]]:
    """(sql, scope_name) for the TA's DEFAULT selection scope, or (None, reason).

    THIS IS THE FIX for G1 reporting BELOW THRESHOLD on a stage that completed. G1's
    work-set was the whole TA population -- every HCP in hcp_therapeutic_areas_v2 without a
    theme row, 106,551 for CRC -- but extract_research_themes does not target that. It
    targets TA_CONFIGS[slug]["selection"][scope], which for CRC's default scope is the
    140-member rising board. The postcheck therefore demanded 90% of 106,551 (95,792) from a
    run that had correctly written 115, and re-ran a completed billed stage.

    Same root cause as the cost estimate's upper bound: a proxy standing in for a scope the
    orchestrator could have read directly.
    """
    cfg = _themes_ta_configs()
    if not cfg:
        return None, "TA_CONFIGS unavailable"
    entry = cfg.get(slug)
    if not entry:
        return None, f"no TA_CONFIGS entry for {slug}"
    scope = entry.get("default_scope")
    sql = (entry.get("selection") or {}).get(scope)
    if not sql:
        return None, f"no selection SQL for default_scope={scope!r}"
    if "%(scope_value)s" in sql:
        # Region-scoped selections need a country list the orchestrator has no way to
        # choose. Refuse to guess -- a wrong country list is a wrong work-set, which is the
        # bug being fixed.
        return None, f"default_scope={scope!r} is region-scoped and needs --scope-value"
    return sql, scope


def read_str_constant(rel_path: str, names: Tuple[str, ...]) -> Optional[str]:
    """First matching module-level string constant, parsed not imported. Used for the model id."""
    path = REPO_ROOT / rel_path
    if not path.exists():
        return None
    text = io.open(path, encoding="utf-8").read()
    for name in names:
        m = re.search(rf'^{re.escape(name)}\s*=\s*"([^"]+)"\s*$', text, re.MULTILINE)
        if m:
            return m.group(1)
    return None


def resolve_ta(conn, slug: str) -> ResolvedTA:
    with conn.cursor() as cur:
        cur.execute("SELECT id::text, slug, name FROM therapeutic_areas WHERE slug = %s", (slug,))
        row = cur.fetchone()
    if not row:
        with conn.cursor() as cur:
            cur.execute("SELECT slug FROM therapeutic_areas ORDER BY slug")
            known = ", ".join(r[0] for r in cur.fetchall())
        raise SystemExit(f"TA slug not found: {slug}\nKnown slugs: {known}")
    return ResolvedTA(
        slug=row[1],
        name=row[2],
        uuid=row[0],
        themes_tag=read_ta_configs_tag(slug),
        buckets_key=slug.upper(),
    )


def assert_key_conventions(conn) -> None:
    """Fail at second zero if a text-key convention moved, not at stage seven.

    Each check resolves a text key for the KNOWN-GOOD TA exactly the way a stage would, then
    asserts it matches at least one live row. If any of these ever returns 0, a convention changed
    and every verification query built on that form is silently wrong.
    """
    good_tag = read_ta_configs_tag(KNOWN_GOOD_SLUG)
    checks = [
        (
            f"hcp_research_themes_v2.therapeutic_area == TA_CONFIGS['{KNOWN_GOOD_SLUG}']['tag']"
            f" == {good_tag!r}",
            "SELECT count(*) FROM hcp_research_themes_v2 WHERE therapeutic_area = %s",
            (good_tag,),
        ),
        (
            f"theme_canonical_v1.therapeutic_area == '{KNOWN_GOOD_SLUG}'.upper()"
            f" == {KNOWN_GOOD_SLUG.upper()!r}",
            "SELECT count(*) FROM theme_canonical_v1 WHERE therapeutic_area = %s",
            (KNOWN_GOOD_SLUG.upper(),),
        ),
        (
            f"hcp_narratives_v2.therapeutic_area_slug == {KNOWN_GOOD_SLUG!r}",
            "SELECT count(*) FROM hcp_narratives_v2 WHERE therapeutic_area_slug = %s",
            (KNOWN_GOOD_SLUG,),
        ),
        (
            "therapeutic_areas.id is a uuid that hcp_rising_star_ranks_v3 keys on",
            "SELECT count(*) FROM hcp_rising_star_ranks_v3 r JOIN therapeutic_areas t "
            "ON t.id = r.therapeutic_area_id WHERE t.slug = %s",
            (KNOWN_GOOD_SLUG,),
        ),
    ]
    print(f"Key-convention assertions (against {KNOWN_GOOD_SLUG}):")
    failed = []
    for label, sql, params in checks:
        if good_tag is None and "TA_CONFIGS" in label:
            failed.append((label, "TA_CONFIGS entry missing for the known-good TA"))
            print(f"  FAIL  {label}  -> no TA_CONFIGS entry")
            continue
        n = scalar(conn, sql, params)
        status = "ok  " if n > 0 else "FAIL"
        print(f"  {status}  {label}  -> {n:,} rows")
        if n == 0:
            failed.append((label, "matched 0 rows"))
    if failed:
        raise SystemExit(
            "\nKey-convention assertion failed. A text-key convention has moved, so every "
            "verification and skip query built on that form is silently wrong in one of two "
            "directions (re-run a billed stage, or skip work that never ran). Fix the resolution "
            "before running anything.\n"
            + "\n".join(f"  - {l}: {why}" for l, why in failed)
        )
    print()


# ─────────────────────────────────────────────────────────────────────────────
# Stage definitions
# ─────────────────────────────────────────────────────────────────────────────


# ─────────────────────────────────────────────────────────────────────────────
# SPEND LIMITS
#
# There is no balance endpoint and no spend header. Checked 2026-08-27 against the API
# reference and against a live messages call: the response carries twelve
# anthropic-ratelimit-* headers, all per-minute throughput buckets that refill
# continuously, and NOTHING carrying credit, cost or a monetary limit. The Usage & Cost
# Admin API reports spend-to-date, lags 5+ minutes, and needs a separate admin credential.
# So there is no number to gate on in advance.
#
# What IS detectable is the wall itself, and it has two distinct shapes:
#
#   TIER CAP (organization monthly cap):  HTTP 429, error.type='rate_limit_error',
#     error.details.error_code='enforced_spend_limit_reached', and NO retry-after header.
#     The SDK's automatic retry cannot help -- it retries 429s by default, so it burns its
#     whole budget on a wall that will not move until 00:00 UTC on the 1st. Every client
#     this orchestrator constructs therefore sets max_retries=0 for the probe.
#
#   SELF-SET LIMIT:  HTTP 400, error.type='invalid_request_error', message beginning
#     "You have reached your specified API usage limits" (or "...specified workspace API
#     usage limits"). Raising or removing the limit in the Console restores access.
#
# BOTH ARE ORGANIZATION-WIDE. That is the whole reason this aborts the run instead of
# marking one stage failed: if G1 hits the cap, G2/G4/G5/G8 will hit it identically, and
# marching through them produces four more identical failures, four more misleading
# "BELOW THRESHOLD" postchecks, and a state file that says four stages were attempted
# when the account was simply switched off.
# ─────────────────────────────────────────────────────────────────────────────

SPEND_LIMIT_CODE = "enforced_spend_limit_reached"
SPEND_LIMIT_MARKERS = (
    SPEND_LIMIT_CODE,
    "You have reached your specified API usage limits",
    "You have reached your specified workspace API usage limits",
    "You have reached your API usage limits",
)
#: "You will regain access on 2026-09-01 at 00:00 UTC."
_RESUME_RE = re.compile(
    r"(?:regain access|resumes?|access resumes)\s+(?:on\s+)?(\d{4}-\d{2}-\d{2}"
    r"(?:\s+at\s+\d{2}:\d{2}(?:\s*UTC)?)?)",
    re.IGNORECASE,
)


class SpendLimitReached(RuntimeError):
    """Organization-wide spend wall. Aborts the run; never retried, never per-stage."""

    def __init__(self, kind: str, detail: str, resumes_at: Optional[str], stage_id: str = ""):
        self.kind = kind              # 'tier-cap' | 'self-set'
        self.detail = detail
        self.resumes_at = resumes_at
        self.stage_id = stage_id
        super().__init__(detail)


def _resume_from(text: str) -> Optional[str]:
    m = _RESUME_RE.search(text or "")
    return m.group(1).strip() if m else None


def spend_limit_from_exception(exc: Exception) -> Optional[SpendLimitReached]:
    """Classify an Anthropic SDK exception as a spend wall, or None if it is something else.

    Reads error.details.error_code where the SDK exposes it and falls back to the message
    text. The error_code is the documented discriminator -- the 429's type is
    'rate_limit_error', identical to an ordinary rate limit, so the code is the ONLY thing
    that tells the two apart.
    """
    body = getattr(exc, "body", None)
    err = (body or {}).get("error") if isinstance(body, dict) else None
    if isinstance(err, dict):
        code = ((err.get("details") or {}) if isinstance(err.get("details"), dict) else {}).get(
            "error_code"
        )
        msg = str(err.get("message") or "")
        if code == SPEND_LIMIT_CODE:
            return SpendLimitReached("tier-cap", msg or str(exc), _resume_from(msg))
        if err.get("type") == "invalid_request_error" and any(
            m in msg for m in SPEND_LIMIT_MARKERS
        ):
            return SpendLimitReached("self-set", msg, _resume_from(msg))
    text = str(exc)
    if SPEND_LIMIT_CODE in text:
        return SpendLimitReached("tier-cap", text, _resume_from(text))
    if any(m in text for m in SPEND_LIMIT_MARKERS):
        return SpendLimitReached("self-set", text, _resume_from(text))
    return None


def spend_limit_from_output(line: str, stage_id: str) -> Optional[SpendLimitReached]:
    """Same classification against a CHILD PROCESS's output.

    The stages are separate processes, so their SDK exceptions are unreachable as objects --
    they arrive as a traceback on stdout. Matching on the documented error_code string and
    the two documented message prefixes is the only signal available, and it is a stable
    one: error_code exists precisely so callers can discriminate this case.
    """
    if not any(m in line for m in SPEND_LIMIT_MARKERS):
        return None
    kind = "tier-cap" if SPEND_LIMIT_CODE in line else "self-set"
    return SpendLimitReached(kind, line.strip(), _resume_from(line), stage_id)


def preflight_spend_check(model: str) -> None:
    """One 1-token call before the first billed stage. Raises SpendLimitReached, or returns.

    Cheap insurance: it costs a single-digit number of tokens and converts "four stages
    fail confusingly forty minutes in" into "refused in one second, here is the date".

    max_retries=0 IS THE POINT. The tier-cap response is a 429 with no retry-after, and the
    SDK retries 429s by default -- so the stock client would sit through its full backoff
    schedule against a wall that does not move for days.

    Any OTHER failure here is deliberately NOT fatal: a network blip or a missing key must
    not block a run whose billed stages might still be refused for other reasons. Only a
    positively-identified spend wall stops the run.
    """
    try:
        import anthropic
    except ImportError:
        print("  spend     SKIPPED -- anthropic SDK not installed")
        return
    try:
        client = anthropic.Anthropic(max_retries=0)
        client.messages.create(
            model=model, max_tokens=1, messages=[{"role": "user", "content": "."}]
        )
        print(f"  spend     OK -- probe accepted ({model}, 1 token, max_retries=0)")
    except Exception as exc:  # noqa: BLE001
        hit = spend_limit_from_exception(exc)
        if hit:
            raise hit
        print(f"  spend     probe inconclusive ({type(exc).__name__}) -- not treating as a "
              f"spend wall; billed stages will report their own errors")


def report_spend_limit(hit: SpendLimitReached) -> None:
    where = f" during {hit.stage_id}" if hit.stage_id else " on the pre-flight probe"
    print(f"\n{'=' * 78}\nRUN ABORTED -- API SPEND LIMIT REACHED{where}\n{'=' * 78}")
    if hit.kind == "tier-cap":
        print("  Your organization has crossed its monthly API usage cap (HTTP 429,")
        print("  error_code=enforced_spend_limit_reached). This 429 carries NO retry-after;")
        print("  retrying cannot succeed, and the SDK's automatic retries would only burn")
        print("  their budget against it.")
        print("  Restore access by moving to a higher tier, or wait for the reset.")
    else:
        print("  A spend limit YOU set has been reached (HTTP 400, invalid_request_error).")
        print("  Raise or remove it under Console -> Settings -> Billing -> Spend limits.")
    if hit.resumes_at:
        print(f"\n  ACCESS RESUMES: {hit.resumes_at}")
    else:
        print("\n  ACCESS RESUMES: not stated in the error; see Console -> Settings -> Billing.")
    print(f"\n  API said: {hit.detail[:400]}")
    print("\n  The cap is ORGANIZATION-WIDE, so every remaining billed stage would fail")
    print("  identically. Unbilled stages (G3, G6, G7) are unaffected and can be run with")
    print("  --allow-billed off. Re-run with --resume-from once access is restored; each")
    print("  stage re-verifies against the database, so nothing is redone or double-paid.")


@dataclass
class Stage:
    id: str
    title: str
    script: str
    billed: bool
    #: (conn, ta) -> (ok, message). Fails BEFORE spending. Modelled on phase 1 stage 4's
    #: "curated_ta_concepts is empty - cannot proceed", and on G6's ta_drug_keywords guard, which
    #: is the highest-value one in the set: it turns today's silent zero into a one-second failure
    #: naming the missing thing.
    precondition: Callable[[object, ResolvedTA], Tuple[bool, str]]
    #: (conn, ta) -> (actual, human label). The completion test. Read from the TARGET TABLE.
    verify: Callable[[object, ResolvedTA], Tuple[int, str]]
    #: (conn, ta) -> expected row count for THIS run's work-set. Postcondition compares against it.
    workset: Callable[[object, ResolvedTA], int]
    #: (ta, execute) -> argv
    build_cmd: Callable[[ResolvedTA, bool], List[str]]
    #: relative path + constant names for the pinned model, and the static prompt template
    #: constant used for the count_tokens floor. None for unbilled stages.
    prompt_source: Optional[Tuple[str, Tuple[str, ...], Tuple[str, ...]]] = None
    notes: str = ""


def _py(rel: str) -> List[str]:
    # -u: unbuffered child stdout. Two reasons. ORCHESTRATOR_DEBT.md records "children run
    # without -u -- the operator flies blind by construction" as an open finding; and the
    # spend-limit scanner below reads the child's output line by line, so a block-buffered
    # child would hide the error until it exited anyway.
    return [PY, "-u", str(REPO_ROOT / rel)]


def _ok(msg: str = "") -> Tuple[bool, str]:
    return True, msg


# --- preconditions ----------------------------------------------------------

def pre_g1(conn, ta):
    if ta.themes_tag is None:
        return False, (
            f"extract_research_themes.py has no TA_CONFIGS entry for '{ta.slug}'. That entry is "
            f"not boilerplate -- it needs `tag`, `domain`, `generic_negative`, `theme_examples`, "
            f"and a `selection` SQL defining WHICH HCPs to extract for, which is a cohort-scoping "
            f"decision. Note also that --ta is declared choices=tuple(TA_CONFIGS.keys()), so "
            f"argparse rejects '{ta.slug}' today; and omitting --ta silently runs NSCLC on a "
            f"billed script. See GENERATE_CYCLE_DESIGN.md section 1."
        )
    n = scalar(
        conn,
        "SELECT count(*) FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    )
    if n == 0:
        return False, f"no hcp_therapeutic_areas_v2 rows for {ta.slug} -- nothing to extract for"
    return _ok(f"TA_CONFIGS tag={ta.themes_tag!r}, {n:,} HCPs in the TA")


def pre_g2(conn, ta):
    n = scalar(
        conn,
        "SELECT count(*) FROM hcp_research_themes_v2 WHERE therapeutic_area = %s",
        (ta.themes_tag,),
    ) if ta.themes_tag else 0
    if n == 0:
        return False, (
            f"G1 has written no themes for {ta.slug} "
            f"(hcp_research_themes_v2.therapeutic_area = {ta.themes_tag!r})"
        )
    if ta.themes_tag != ta.buckets_key:
        return False, (
            f"KEY MISMATCH, and this is the defect, not a config gap. G1 wrote "
            f"{ta.themes_tag!r}; bucket_themes.py computes ta.upper() = {ta.buckets_key!r} and "
            f"raises 'No themes found' for anything else. The two agree ONLY for nsclc. This is "
            f"why Atopic Dermatitis has {n if ta.slug == 'atopic-dermatitis' else 3499:,} theme "
            f"rows and ZERO canonical themes -- billed extraction that has never been bucketed. "
            f"Set tag == {ta.buckets_key!r} to conform, or fix bucket_themes.py to read "
            f"TA_CONFIGS[slug]['tag'] from the same source G1 writes from (the real fix, and it "
            f"retires the class)."
        )
    return _ok(f"{n:,} theme rows under {ta.themes_tag!r}; key agrees with ta.upper()")


def pre_g3(conn, ta):
    n = scalar(
        conn,
        "SELECT count(*) FROM publication_authors_v2 pa "
        "JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = pa.publication_id "
        "WHERE pta.therapeutic_area_id = %s",
        (ta.uuid,),
    )
    if n == 0:
        return False, f"no publication_authors_v2 rows for {ta.slug}'s publications"
    return _ok(f"{n:,} author links")


def pre_g4(conn, ta):
    rising = scalar(
        conn, "SELECT count(*) FROM hcp_rising_star_ranks_v3 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    )
    if rising == 0:
        return False, (
            f"hcp_rising_star_ranks_v3 has 0 rows for {ta.slug} -- the rising board does not exist "
            f"yet. Run ta_cycle stage 9 (rising_score.py --ta {ta.slug}) first. Refusing "
            f"rather than targeting zero HCPs and exiting 0."
        )
    return _ok(f"rising board {rising:,}; scoped to --cohort rising_star (the default 'both' "
               f"silently half-fails)")


def pre_g5(conn, ta):
    n = scalar(
        conn,
        "SELECT count(DISTINCT hcp_id) FROM hcp_scientific_positions_v1 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    )
    if n == 0:
        return False, f"hcp_scientific_positions_v1 is empty for {ta.slug} -- G4 must run first"
    return _ok(f"{n:,} positioned HCPs")


def pre_g6(conn, ta):
    """The highest-value guard in the set (design §4)."""
    n = scalar(
        conn, "SELECT count(*) FROM ta_drug_keywords WHERE therapeutic_area_id = %s", (ta.uuid,)
    )
    if n == 0:
        return False, (
            f"ta_drug_keywords has 0 rows for {ta.slug}. open_payments_aggregator builds its TA "
            f"slice with INNER JOIN drug_keywords ON dk.therapeutic_area_id = ht.therapeutic_area_id, "
            f"so it would write ZERO rows to hcp_open_payments_by_ta_v2 and exit 0. No script "
            f"populates ta_drug_keywords -- it is hand-curated content, not code. This guard is "
            f"the whole point: a one-second failure naming the missing thing instead of a silent "
            f"empty surface that only shows up as blank payment facts on a community profile."
        )
    return _ok(f"{n:,} drug keywords")


def pre_g7(conn, ta):
    n = scalar(
        conn,
        "SELECT count(*) FROM hcp_cohort_classification_v2 "
        "WHERE therapeutic_area_id = %s AND cohort = 'community'",
        (ta.uuid,),
    )
    if n == 0:
        return False, f"no cohort='community' rows in hcp_cohort_classification_v2 for {ta.slug}"
    pay = scalar(
        conn, "SELECT count(*) FROM hcp_open_payments_by_ta_v2 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    )
    med = scalar(
        conn, "SELECT count(*) FROM hcp_medicare_by_ta_v2 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    )
    degraded = []
    if pay == 0:
        degraded.append("hcp_open_payments_by_ta_v2 (needs G6, which needs ta_drug_keywords)")
    if med == 0:
        degraded.append("hcp_medicare_by_ta_v2 (medicare_aggregator.py has no --ta)")
    if degraded:
        # DEGRADED, NOT BLOCKED. Community's composite was removed in Phase 2
        # (community_scoring.py:60 -- "no normalization, no weighting, no composite"), so missing
        # payment/medicare inputs blank DISPLAYED FACTS rather than corrupting a score. Warn and
        # proceed; refusing would block a stage that still produces useful rows.
        return True, "DEGRADED -- two of five displayed facts will be null: " + "; ".join(degraded)
    return _ok(f"{n:,} community-classified HCPs, payment and medicare slices present")


def pre_g8(conn, ta):
    themes = scalar(
        conn, "SELECT count(*) FROM hcp_research_themes_v2 WHERE therapeutic_area = %s",
        (ta.themes_tag,),
    ) if ta.themes_tag else 0
    positions = scalar(
        conn, "SELECT count(*) FROM hcp_scientific_positions_v1 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    )
    rising = scalar(
        conn, "SELECT count(*) FROM hcp_rising_star_ranks_v3 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    )
    if rising == 0:
        return False, f"no board rows for {ta.slug} -- nothing to write narratives about"
    thin = []
    if themes == 0:
        thin.append("themes (G1)")
    if positions == 0:
        thin.append("positions (G4)")
    if thin:
        # THE HIGHEST-COST FAILURE IN THE SET. Narratives assemble context from themes and
        # positions. Running without them produces text that is structurally valid, materially
        # thinner, at FULL token cost, with no error. Re-running means paying twice. Refuse.
        return False, (
            f"context inputs missing: {', '.join(thin)}. Narratives would be structurally valid, "
            f"materially thinner, at full token cost, with no error raised -- and re-running to "
            f"fix it means paying twice. Run those stages first, or pass --allow-thin-narratives "
            f"if you have decided the thinner text is acceptable."
        )
    return _ok(f"themes {themes:,}, positions {positions:,}, rising board {rising:,}")


# --- verification (read the TARGET TABLE; never a counter) -------------------

def ver_g1(conn, ta):
    """Themed HCPs WITHIN THE SELECTION, so verify and work-set count the same population.

    Counting themed HCPs across the whole TA while the work-set counted the selection was
    half the mismatch: the two numbers described different sets, so their ratio meant
    nothing. Both now describe the selection.
    """
    if not ta.themes_tag:
        return 0, "hcp_research_themes_v2 (no TA_CONFIGS tag to query by)"
    sql, _scope = themes_selection_sql(ta.slug)
    if sql:
        n = scalar(
            conn,
            f"SELECT count(*) FROM ({sql}) sel "
            f"WHERE EXISTS (SELECT 1 FROM hcp_research_themes_v2 t "
            f"              WHERE t.hcp_id = sel.id AND t.therapeutic_area = %(tag)s)",
            {"ta_id": ta.uuid, "tag": ta.themes_tag},
        )
        return n, (f"hcp_research_themes_v2 @ {ta.themes_tag!r}, within the "
                   f"{_scope!r} selection")
    return scalar(
        conn,
        "SELECT count(DISTINCT hcp_id) FROM hcp_research_themes_v2 WHERE therapeutic_area = %s",
        (ta.themes_tag,),
    ), f"hcp_research_themes_v2 distinct hcp_id @ {ta.themes_tag!r} (WHOLE TA -- proxy)"


def ver_g2(conn, ta):
    # NOT EMPIRICALLY BACKED. theme_to_canonical_v1 is empty everywhere, so its convention has
    # never been observed. bucket_themes writes slug.upper(), so that is the predicate used here --
    # but do not trust this guard until G2 has run once somewhere and the value can be read back.
    return scalar(
        conn, "SELECT count(*) FROM theme_to_canonical_v1 WHERE therapeutic_area = %s",
        (ta.buckets_key,),
    ), f"theme_to_canonical_v1 @ {ta.buckets_key!r} (convention UNVERIFIED)"


def ver_g3(conn, ta):
    return scalar(
        conn,
        "SELECT count(DISTINCT hcp_id) FROM hcp_top_collaborators_v2 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    ), "hcp_top_collaborators_v2 distinct hcp_id"


def ver_g4(conn, ta):
    return scalar(
        conn,
        "SELECT count(DISTINCT hcp_id) FROM hcp_scientific_positions_v1 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    ), "hcp_scientific_positions_v1 distinct hcp_id"


def ver_g5(conn, ta):
    # ROUTES THROUGH hcp_scientific_positions_v1 ON THE UUID DELIBERATELY -- do not "simplify".
    # hcp_ai_overviews.therapeutic_area is the internally-mixed column ('NSCLC' for one TA,
    # 'atopic-dermatitis' for another), so any query filtering it directly is a landmine that
    # works for whichever TA was tested and returns zero for the other. Joining via a uuid column
    # is safe by construction.
    return scalar(
        conn,
        "SELECT count(*) FROM hcp_ai_overviews WHERE hcp_id IN "
        "(SELECT hcp_id FROM hcp_scientific_positions_v1 WHERE therapeutic_area_id = %s)",
        (ta.uuid,),
    ), "hcp_ai_overviews via positions.uuid (never via its own text column)"


def ver_g6(conn, ta):
    return scalar(
        conn, "SELECT count(*) FROM hcp_open_payments_by_ta_v2 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    ), "hcp_open_payments_by_ta_v2"


def ver_g7(conn, ta):
    return scalar(
        conn, "SELECT count(*) FROM hcp_community_scores_v2 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    ), "hcp_community_scores_v2"


def ver_g8(conn, ta):
    # PER-COHORT, not one boolean: hcp_narratives_v2 is keyed (hcp_id, slug, cohort), so recording
    # stage 8 as a single flag would let a completed rising arm mask a never-run community arm.
    with conn.cursor() as cur:
        cur.execute(
            "SELECT cohort, count(*) FROM hcp_narratives_v2 WHERE therapeutic_area_slug = %s "
            "GROUP BY cohort ORDER BY cohort",
            (ta.slug,),
        )
        rows = cur.fetchall()
    total = sum(r[1] for r in rows)
    detail = ", ".join(f"{r[0]}={r[1]:,}" for r in rows) or "none"
    return total, f"hcp_narratives_v2 @ slug={ta.slug!r} ({detail})"


# --- work-sets (the billed pre-flight counts) -------------------------------

def ws_g1(conn, ta):
    """THE ACTUAL TARGET COUNT: rows returned by the TA's own selection SQL.

    Runs TA_CONFIGS[slug]["selection"][default_scope] verbatim -- the same statement
    extract_research_themes runs -- so the work-set, the cost estimate and the postcheck all
    describe the population the script will really call the API for.

    Falls back to the old whole-TA proxy ONLY if the selection cannot be resolved, and
    ws_g1_is_proxy() tells the caller so it can be labelled. An unlabelled proxy is what
    caused the false BELOW THRESHOLD.
    """
    if not ta.themes_tag:
        return 0
    sql, _scope = themes_selection_sql(ta.slug)
    if sql:
        # THE FULL SELECTION, not the remainder. Every other stage's work-set is the total
        # target and the postcheck compares verify/work-set against POSTCONDITION_RATIO; a
        # work-set of "what is left" would make that ratio compare done against remaining,
        # which is meaningless. The BILLABLE count (what the script will actually call the
        # API for, since it skips already-themed HCPs) is work-set minus verify, and
        # print_cost reports that separately.
        return scalar(conn, f"SELECT count(*) FROM ({sql}) sel", {"ta_id": ta.uuid})
    return scalar(
        conn,
        "SELECT count(*) FROM hcp_therapeutic_areas_v2 hta WHERE hta.therapeutic_area_id = %s "
        "AND NOT EXISTS (SELECT 1 FROM hcp_research_themes_v2 t WHERE t.hcp_id = hta.hcp_id "
        "AND t.therapeutic_area = %s)",
        (ta.uuid, ta.themes_tag),
    )


def ws_g1_is_proxy(ta) -> Optional[str]:
    """Reason string when ws_g1 fell back to the whole-TA proxy, else None."""
    sql, reason = themes_selection_sql(ta.slug)
    return None if sql else reason


def ws_g2(conn, ta):
    if not ta.themes_tag:
        return 0
    return scalar(
        conn,
        "SELECT count(DISTINCT theme_name) FROM hcp_research_themes_v2 WHERE therapeutic_area = %s",
        (ta.themes_tag,),
    )


def ws_g3(conn, ta):
    return scalar(
        conn,
        "SELECT count(DISTINCT pa.hcp_id) FROM publication_authors_v2 pa "
        "JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = pa.publication_id "
        "WHERE pta.therapeutic_area_id = %s",
        (ta.uuid,),
    )


def ws_g4(conn, ta):
    return scalar(
        conn,
        "SELECT count(*) FROM hcp_rising_star_ranks_v3 WHERE therapeutic_area_id = %s "
        "AND us_rank IS NOT NULL AND us_rank <= 100",
        (ta.uuid,),
    )


def ws_g5(conn, ta):
    return scalar(
        conn,
        "SELECT count(DISTINCT hcp_id) FROM hcp_scientific_positions_v1 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    )


def ws_g6(conn, ta):
    return scalar(
        conn, "SELECT count(*) FROM ta_drug_keywords WHERE therapeutic_area_id = %s", (ta.uuid,)
    )


def ws_g7(conn, ta):
    return scalar(
        conn,
        "SELECT count(*) FROM hcp_cohort_classification_v2 "
        "WHERE therapeutic_area_id = %s AND cohort = 'community'",
        (ta.uuid,),
    )


def ws_g8(conn, ta):
    rising = scalar(
        conn, "SELECT count(*) FROM hcp_rising_star_ranks_v3 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    )
    est = scalar(
        conn,
        "SELECT least(200, count(*)) FROM hcp_established_ranks_v3 "
        "WHERE therapeutic_area_id = %s AND scope_type = 'global'",
        (ta.uuid,),
    )
    com = scalar(
        conn, "SELECT least(500, count(*)) FROM hcp_community_scores_v2 WHERE therapeutic_area_id = %s",
        (ta.uuid,),
    )
    return rising + est + com


# --- commands ---------------------------------------------------------------

def cmd_g1(ta, execute):
    # ALWAYS pass --ta explicitly. Omitting it silently runs NSCLC (default=DEFAULT_TA) on a
    # billed script.
    c = _py("scripts/classify/extract_research_themes.py") + ["--ta", ta.slug]
    return c if execute else c + ["--dry-run"]


def cmd_g2(ta, execute):
    c = _py("scripts/classify/bucket_themes.py") + ["--ta", ta.slug]
    return c if execute else c + ["--dry-run"]


def cmd_g3(ta, execute):
    c = _py("scripts/aggregate/compute_top_collaborators.py") + ["--ta", ta.slug]
    return c if execute else c + ["--dry-run"]


def cmd_g4(ta, execute):
    # --cohort rising_star EXPLICITLY. The default is 'both', and the established arm reads
    # hcp_established_ranks_v3; a default invocation on a TA without that board silently produces
    # rising positions and zero established ones.
    c = _py("scripts/narrative/extract_scientific_positions.py") + [
        "--ta", ta.slug, "--cohort", "rising_star", "--skip-existing",
    ]
    return c if execute else c + ["--dry-run"]


def cmd_g5(ta, execute):
    c = _py("scripts/narrative/generate_scientific_position_synthesis.py") + [
        "--ta", ta.slug, "--skip-existing",
    ]
    return c if execute else c + ["--dry-run"]


def cmd_g6(ta, execute):
    c = _py("scripts/aggregate/open_payments_aggregator.py") + [
        "--ta", ta.slug, "--target-version", "v2",
    ]
    return c + ["--execute"] if execute else c


def cmd_g7(ta, execute):
    c = _py("scripts/score/community_scoring.py") + ["--ta", ta.slug]
    return c + ["--execute"] if execute else c + ["--dry-run"]


def cmd_g8(ta, execute):
    # --yes IS REQUIRED, NOT OPTIONAL (2026-08-29). generate_narratives_v2:2710 gates its
    # writes behind an interactive input("Proceed with generation?"). Its own comment says the
    # flag is "required when this runs as reingest stage 13 -- the orchestrator gives children
    # stdin=DEVNULL, so input() would block/EOF". generate_cycle was written without it, so
    # every G8 run died at that prompt: EOF -> exception -> main() returns 1 -> stage recorded
    # as failed with no narratives written. CRC had ZERO narratives for exactly this reason,
    # and the printed "140 rising / 200 established / 18 community" that looked like a result
    # was the cost ESTIMATE, printed before the prompt.
    #
    # Suppressing the child's confirmation is correct here because THIS orchestrator already
    # owns the spend gate, more strictly than the child does: --allow-billed defaults off, a
    # non-TTY billed run additionally requires --yes, a 1-token pre-flight probe checks for a
    # spend wall before the first billed stage, and the measured cost floor is printed for
    # every billed stage. A second prompt inside the child adds no protection and, under the
    # tee in run_stage, cannot be answered reliably.
    c = _py("scripts/narrative/generate_narratives_v2.py") + [
        "--ta", ta.slug, "--target-version", "v2", "--established-top", "200", "--yes",
    ]
    return c if execute else c + ["--dry-run"]


STAGES: List[Stage] = [
    Stage("G3", "collaborators", "aggregate/compute_top_collaborators.py", False,
          pre_g3, ver_g3, ws_g3, cmd_g3,
          notes="unbilled, no generation-layer dependencies -- proves plan/verify/guard for free"),
    Stage("G1", "research themes", "classify/extract_research_themes.py", True,
          pre_g1, ver_g1, ws_g1, cmd_g1,
          prompt_source=("scripts/classify/extract_research_themes.py", ("MODEL",),
                         ("SYSTEM_PROMPT_TEMPLATE",))),
    Stage("G2", "theme buckets", "classify/bucket_themes.py", True,
          pre_g2, ver_g2, ws_g2, cmd_g2,
          prompt_source=("scripts/classify/bucket_themes.py", ("MODEL",), ())),
    Stage("G4", "scientific positions", "narrative/extract_scientific_positions.py", True,
          pre_g4, ver_g4, ws_g4, cmd_g4,
          prompt_source=("scripts/narrative/extract_scientific_positions.py", ("MODEL_NAME",),
                         ("PROMPT_TEMPLATE",))),
    Stage("G5", "position synthesis", "narrative/generate_scientific_position_synthesis.py", True,
          pre_g5, ver_g5, ws_g5, cmd_g5,
          prompt_source=("scripts/narrative/generate_scientific_position_synthesis.py",
                         ("MODEL_NAME",), ("PROMPT_TEMPLATE_DEEP",))),
    Stage("G6", "open payments rollup", "aggregate/open_payments_aggregator.py", False,
          pre_g6, ver_g6, ws_g6, cmd_g6),
    Stage("G7", "community scores", "score/community_scoring.py", False,
          pre_g7, ver_g7, ws_g7, cmd_g7),
    Stage("G8", "narratives", "narrative/generate_narratives_v2.py", True,
          pre_g8, ver_g8, ws_g8, cmd_g8,
          prompt_source=("scripts/narrative/generate_narratives_v2.py", ("ANTHROPIC_MODEL",), ())),
]

STAGE_BY_ID = {s.id: s for s in STAGES}
STAGE_ORDER = [s.id for s in STAGES]


# ─────────────────────────────────────────────────────────────────────────────
# Cost estimation
# ─────────────────────────────────────────────────────────────────────────────

def count_tokens_floor(stage: Stage) -> Tuple[Optional[int], str]:
    """Input-token floor for one call of this stage, via client.messages.count_tokens.

    NOT the built-in estimator. generate_narratives_v2's estimator assumes a 600-token input
    constant which is roughly 3-5x low, and no usage is stamped at write time, so historical cost
    is estimable rather than answerable. count_tokens is exact for what it is given.

    WHAT IT IS GIVEN is the stage's STATIC prompt template only -- the per-call payload
    (publication text, theme lists, an HCP's context) is not included, because rendering a real
    prompt would mean importing and running each script's context assembler. So this is a FLOOR,
    labelled as one everywhere it is printed. It is still the right number to reason with: it is
    measured rather than assumed, and it bounds the input side from below.

    To make the output side real: stamp response.usage at write time in the stage scripts. Until
    then output is an explicit assumption, not an estimate.
    """
    if not stage.prompt_source:
        return None, "unbilled"
    rel, _model_names, tmpl_names = stage.prompt_source
    if not tmpl_names:
        return None, "no static template constant exposed by this script"
    path = REPO_ROOT / rel
    if not path.exists():
        return None, f"missing {rel}"
    text = io.open(path, encoding="utf-8").read()
    template = None
    for name in tmpl_names:
        m = re.search(rf'^{re.escape(name)}\s*=\s*\(?\s*"""(.*?)"""', text, re.S | re.MULTILINE)
        if m:
            template = m.group(1)
            break
        # IMPLICIT-CONCATENATION FORM -- join EVERY fragment, not just the first. Capturing one
        # fragment produced a 23-token "floor" for a template that is plainly longer, which is
        # worse than reporting nothing: a wrong small number reads as a real measurement.
        m = re.search(rf'^{re.escape(name)}\s*=\s*\((.*?)\n\)', text, re.S | re.MULTILINE)
        if m:
            parts = re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))
            if parts:
                template = "".join(parts)
                break
    if not template:
        return None, f"could not extract {tmpl_names[0]} from {rel}"
    if len(template) < 200:
        # Shorter than this is almost certainly a partial capture, not a genuinely short prompt.
        # Refuse rather than print a floor that is obviously too low.
        return None, (f"{tmpl_names[0]} captured as only {len(template)} chars from {rel} -- "
                      f"treating as a failed extraction, not a floor")
    try:
        import anthropic
    except ImportError:
        return None, "anthropic SDK not installed"
    try:
        client = anthropic.Anthropic()
        model = read_str_constant(rel, _model_names) or BILLED_MODEL_FALLBACK
        resp = client.messages.count_tokens(
            model=model, messages=[{"role": "user", "content": template}]
        )
        return resp.input_tokens, f"count_tokens on {tmpl_names[0]} ({model})"
    except Exception as exc:  # noqa: BLE001 -- estimation must never block a dry-run
        return None, f"count_tokens unavailable ({type(exc).__name__})"


def print_cost(stage: Stage, workset: int, ta: Optional[ResolvedTA] = None,
               already: int = 0) -> None:
    if not stage.billed:
        return
    floor, how = count_tokens_floor(stage)
    billable = max(workset - already, 0)
    print(f"    cost      work-set {workset:,} target"
          + (f", {billable:,} still to do (the script skips already-processed HCPs)"
             if already else ""))
    if stage.id == "G1":
        reason = ws_g1_is_proxy(ta) if ta else "no TA resolved"
        if reason:
            print(f"              UPPER BOUND -- could not resolve the selection SQL "
                  f"({reason}); this is the whole-TA")
            print(f"              population, a ceiling and not a forecast.")
        else:
            print(f"              Scoped by TA_CONFIGS['selection'][default_scope] -- the "
                  f"population the script really targets.")
    if floor is None:
        print(f"              INPUT FLOOR UNMEASURED -- {how}")
        print(f"              Refusing to substitute the built-in estimator (its 600-token "
              f"input constant is 3-5x low).")
        return
    in_tok = floor * billable
    in_usd = in_tok / 1_000_000 * PRICE_PER_MTOK_INPUT
    print(f"              input FLOOR {floor:,} tok/call x {billable:,} = {in_tok:,} tok "
          f"~= ${in_usd:,.2f}   [{how}]")
    print(f"              FLOOR ONLY: excludes the per-call payload (publication text, HCP "
          f"context). Output side is an assumption, not an estimate --")
    print(f"              stamp response.usage at write time and the next TA's number is real. "
          f"Output priced at ${PRICE_PER_MTOK_OUTPUT:.2f}/MTok.")


# ─────────────────────────────────────────────────────────────────────────────
# State — verified, never asserted
# ─────────────────────────────────────────────────────────────────────────────

def state_path(slug: str) -> Path:
    return STATE_DIR / slug / "generate_state.json"


def stage_log_path(slug: str, stage_id: str) -> Path:
    """One log file per stage RUN, timestamped -- never overwritten.

    Timestamped rather than fixed-name because a stage is commonly run several times (a
    failure, a fix, a top-up), and the interesting one is often not the last. Keeping every
    run costs kilobytes and preserves the before/after that makes a fix verifiable.
    """
    d = STATE_DIR / slug / LOG_DIR_NAME
    d.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return d / f"{stage_id}-{stamp}.log"


def load_state(slug: str) -> Dict:
    p = state_path(slug)
    if not p.is_file():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_state(slug: str, state: Dict) -> None:
    p = state_path(slug)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────

def run_stage(stage: Stage, ta: ResolvedTA, conn, execute: bool, state: Dict) -> bool:
    print(f"\n{'=' * 78}\n{stage.id}  {stage.title}"
          f"{'   [BILLED]' if stage.billed else ''}\n{'=' * 78}")
    if stage.notes:
        print(f"  note      {stage.notes}")

    ok, msg = stage.precondition(conn, ta)
    print(f"  precheck  {'OK' if ok else 'BLOCKED'}  {msg}")
    if not ok:
        state[stage.id] = {"status": "blocked", "reason": msg, "at": _now()}
        return False

    before, vlabel = stage.verify(conn, ta)
    workset = stage.workset(conn, ta)
    print(f"  verify    {before:,} rows in {vlabel}")
    print(f"  work-set  {workset:,}")
    print_cost(stage, workset, ta, already=before)

    if before > 0 and workset > 0 and before >= workset * POSTCONDITION_RATIO:
        print(f"  SKIP      already complete "
              f"({before:,} >= {POSTCONDITION_RATIO:.0%} of {workset:,}), verified against the "
              f"target table, not a state file")
        state[stage.id] = {"status": "complete", "actual": before, "expected": workset,
                           "at": _now(), "verified": True}
        return True
    if before > 0:
        print(f"  PARTIAL   {before:,} of {workset:,} -- top-up, not skip")

    cmd = stage.build_cmd(ta, execute)
    print(f"  command   {' '.join(cmd[1:])}")
    if not execute:
        print("  DRY-RUN   not invoked")
        state[stage.id] = {"status": "planned", "actual": before, "expected": workset,
                           "at": _now()}
        return True

    # TEE-AND-SCAN, not subprocess.call. The stage is a separate process, so its SDK
    # exceptions are unreachable as objects -- a spend wall arrives as a traceback on stdout.
    # Streaming the child's lines through keeps the operator's live view (the child runs -u)
    # while letting each line be classified. On a hit we stop the child immediately rather
    # than letting it grind through the rest of its work-set against a closed account.
    hit: Optional[SpendLimitReached] = None
    log_path = stage_log_path(ta.slug, stage.id)
    # RING BUFFER, not a list. A stage like G3 or G7 prints progress per batch and can emit
    # hundreds of thousands of lines; accumulating them to slice a tail would hold the whole
    # run in memory for no benefit. deque(maxlen=) is O(1) and bounded by construction.
    tail: deque = deque(maxlen=TAIL_LINES)
    # NOTABLE lines are ring-buffered separately so a traceback that scrolled past 150 lines
    # of trailing progress is still in the state file. Cheap, and it is exactly the line an
    # operator looks for first.
    notable: deque = deque(maxlen=40)
    _NOTABLE = ("Traceback", "[ERROR]", "ERROR", "WARN", "Exception", "SAFETY VIOLATION")
    line_count = 0
    started = datetime.now(timezone.utc)

    # STREAMS STAY MERGED (stderr=STDOUT), deliberately -- a deviation worth naming.
    # Splitting them would give a separate stderr tail, but it would destroy the interleaving,
    # and the interleaving is the diagnostic. "progress line, progress line, [ERROR] DB write
    # failed for HCP x" reads as cause and effect; two separate tails do not. These scripts
    # also print their errors with an identifiable prefix (`[ERROR]`, `Traceback`), so stderr
    # lines stay findable by content -- which is what the `notable` buffer keys on.
    with io.open(log_path, "w", encoding="utf-8", newline="") as logf:
        logf.write(f"# stage   {stage.id} {stage.title}\n")
        logf.write(f"# ta      {ta.slug}\n")
        logf.write(f"# started {started.isoformat()}\n")
        logf.write(f"# command {' '.join(cmd)}\n#\n")
        proc = subprocess.Popen(
            cmd, cwd=str(REPO_ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, errors="replace",
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            sys.stdout.write(line)          # 1. terminal, unchanged
            logf.write(line)                # 2. full log, streamed -- never buffered whole
            tail.append(line.rstrip("\n"))  # 3. bounded tail
            line_count += 1
            if any(m in line for m in _NOTABLE):
                notable.append(line.rstrip("\n"))
            if hit is None:
                hit = spend_limit_from_output(line, stage.id)
                if hit:
                    print(f"\n  SPEND     wall detected in {stage.id} output -- terminating the "
                          f"child; the rest of its work-set would fail identically.")
                    proc.terminate()
        rc = proc.wait()
        logf.write(f"#\n# exit    {rc}\n# lines   {line_count}\n")

    # COMMAND LINE AS INVOKED, so a stage is re-runnable by hand from the state file alone --
    # no reconstruction from build_cmd(), no guessing which flags this run used.
    provenance = {
        "command": " ".join(cmd),
        "log": str(log_path.relative_to(REPO_ROOT)),
        "exit": rc,
        "output_lines": line_count,
        "duration_s": round((datetime.now(timezone.utc) - started).total_seconds(), 1),
        "tail": list(tail),
    }
    if notable:
        provenance["notable"] = list(notable)
    print(f"  log       {log_path.relative_to(REPO_ROOT)}  ({line_count:,} lines)")

    if hit:
        state[stage.id] = {"status": "spend-limit", "kind": hit.kind,
                           "resumes_at": hit.resumes_at, "at": _now(), **provenance}
        raise hit
    if rc != 0:
        print(f"  FAILED    exit {rc}")
        if notable:
            print("  last notable line: " + notable[-1][:160])
        state[stage.id] = {"status": "failed", "at": _now(), **provenance}
        return False

    after, _ = stage.verify(conn, ta)
    threshold = int(workset * POSTCONDITION_RATIO)
    passed = after > before and after >= threshold if workset else after > before
    print(f"  postcheck {after:,} rows (was {before:,}, need >= {threshold:,}) "
          f"-> {'OK' if passed else 'BELOW THRESHOLD'}")
    state[stage.id] = {"status": "complete" if passed else "short", "actual": after,
                       "expected": workset, "at": _now(), "verified": True, **provenance}
    return passed


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def print_manual_work(conn, ta: ResolvedTA) -> None:
    """THIS SCRIPT MUST NOT IMPLY COMPLETENESS. Printed on every successful finish."""
    print(f"\n{'=' * 78}\nWHAT {ta.label()} STILL NEEDS BY HAND\n{'=' * 78}")
    print("\nConfig content -- no script writes these:")
    for table in ("ta_drug_keywords", "ta_clinical_taxonomies", "ta_hcpcs_codes",
                  "ta_cohort_counts_cache"):
        try:
            n = scalar(conn, f"SELECT count(*) FROM {table} WHERE therapeutic_area_id = %s",
                       (ta.uuid,))
        except Exception:  # noqa: BLE001
            conn.rollback()
            n = -1
        flag = "  <-- EMPTY" if n == 0 else ""
        print(f"  {table:<28} {n if n >= 0 else '?':>6} rows{flag}")
    cfg = REPO_ROOT / "config" / "therapeutic_areas" / f"{ta.slug}.json"
    if cfg.exists():
        try:
            tax = (json.loads(cfg.read_text(encoding="utf-8")).get("nppes") or {}).get("taxonomies")
            if not tax:
                print(f"  {'nppes.taxonomies':<28} {'[]':>6}   <-- NPPES matching will not work "
                      f"for {ta.slug} at all")
        except (json.JSONDecodeError, OSError):
            pass

    print("\nCode work that must land before these surfaces exist:")
    print("  medicare_aggregator.py       no --ta; blocks hcp_medicare_by_ta_v2")
    print("  community_board_nsclc_v1     NSCLC-hardcoded view; extract_web_signals.py cannot be")
    print("                               TA-scoped until it is generalised")
    print("  hcp_nsclc_evidence_tier_v1   NSCLC-hardcoded view")
    print("  ingest_asco_abstracts.py     no --ta (congress presenters)")
    print("  ingest_nih_grants.py         no --ta")
    print("  social/dol_matching.py       no --ta")
    print("  bucket_themes.py             --ta is click.Choice([nsclc, hepatology, immunology,")
    print("                               raredisease]) AND derives ta.upper() independently of")
    print("                               G1's TA_CONFIGS tag. Both must change for any new TA.")
    print("\nOut of scope by nature: belief claims have no populating script -- hcp_belief_claims")
    print("does not exist; the system is msl_belief_claim_reactions, filled by MSLs in-app.")
    print("\nThis orchestrator covers the generation layer only. It does not imply the TA is done.")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--ta", required=True, help="Therapeutic area slug (no default, deliberately)")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true",
                      help="Plan, work-set counts and token estimate; spends nothing. DEFAULT.")
    mode.add_argument("--execute", action="store_true", help="Actually invoke the stages.")
    p.add_argument("--stop-after", choices=STAGE_ORDER, default=None)
    p.add_argument("--resume-from", choices=STAGE_ORDER, default=None,
                   help="Re-VERIFIES every prior stage against the DB rather than trusting state.")
    p.add_argument("--yes", action="store_true",
                   help="Required for any billed stage in a non-TTY (mirrors build mode's Gate C).")
    p.add_argument("--allow-billed", action="store_true",
                   help="OFF BY DEFAULT. Unbilled stages (G3, G6, G7) run freely; "
                        "G1/G2/G4/G5/G8 refuse without it.")
    p.add_argument("--allow-thin-narratives", action="store_true",
                   help="Let G8 run without themes/positions context. You are choosing to pay "
                        "full price for materially thinner text.")
    args = p.parse_args()

    execute = bool(args.execute)
    conn = get_conn()
    ta = resolve_ta(conn, args.ta)

    print(f"generate_cycle  {ta.label()}")
    print(f"  uuid          {ta.uuid}")
    print(f"  slug          {ta.slug}          (hcp_narratives_v2, snapshots)")
    print(f"  name          {ta.name}")
    print(f"  themes tag    {ta.themes_tag!r}  (hcp_research_themes_v2 -- G1's own literal)")
    print(f"  buckets key   {ta.buckets_key!r}  (theme_canonical_v1 -- bucket_themes' ta.upper())")
    print(f"  mode          {'EXECUTE' if execute else 'DRY-RUN'}"
          f"   billed stages {'ALLOWED' if args.allow_billed else 'REFUSED (--allow-billed is off)'}")
    print()

    assert_key_conventions(conn)

    if execute and args.allow_billed and not args.yes and not sys.stdin.isatty():
        print("Refusing: billed stages in a non-TTY require --yes.")
        return 1

    start = STAGE_ORDER.index(args.resume_from) if args.resume_from else 0
    stop = STAGE_ORDER.index(args.stop_after) if args.stop_after else len(STAGE_ORDER) - 1
    if stop < start:
        print(f"--stop-after {args.stop_after} precedes --resume-from {args.resume_from}.")
        return 1

    state = load_state(ta.slug)

    if args.resume_from:
        print(f"RESUME from {args.resume_from} -- re-verifying every prior stage against the DB "
              f"(state file is evidence, never authority):")
        for sid in STAGE_ORDER[:start]:
            s = STAGE_BY_ID[sid]
            actual, label = s.verify(conn, ta)
            expected = s.workset(conn, ta)
            note = "ok" if actual > 0 and (not expected or actual >= expected * POSTCONDITION_RATIO) \
                else ("PARTIAL" if actual else "NOT DONE")
            print(f"  {sid}  {actual:,} / {expected:,}  {note}   [{label}]")
        print()

    ran, blocked, skipped = [], [], []
    aborted: Optional[SpendLimitReached] = None
    probed = False
    try:
        for sid in STAGE_ORDER[start : stop + 1]:
            s = STAGE_BY_ID[sid]
            if s.billed and not args.allow_billed:
                print(f"\n{'=' * 78}\n{sid}  {s.title}   [BILLED]\n{'=' * 78}")
                print("  REFUSED   --allow-billed is off (the safe path is the default path). "
                      "Unbilled stages still run.")
                skipped.append(sid)
                state[sid] = {"status": "refused-unbilled-only", "at": _now()}
                continue
            # PRE-FLIGHT, ONCE, before the first billed stage that will actually run. A
            # 1-token probe is cheaper than discovering the wall forty minutes into G8, and
            # it is the only place a spend limit can be caught BEFORE any real spend.
            if s.billed and execute and not probed:
                probed = True
                model = (read_str_constant(s.prompt_source[0], s.prompt_source[1])
                         if s.prompt_source else None) or BILLED_MODEL_FALLBACK
                print(f"\n  spend     pre-flight probe before the first billed stage ({sid})…")
                preflight_spend_check(model)
            if sid == "G8" and args.allow_thin_narratives:
                print("\n[G8] --allow-thin-narratives: context precondition will not block.")
            okay = run_stage(s, ta, conn, execute, state)
            (ran if okay else blocked).append(sid)
    except SpendLimitReached as exc:
        # ABORT THE RUN, not the stage. The cap is organization-wide: every remaining billed
        # stage would fail the same way, producing identical failures and a state file that
        # claims they were attempted on their merits.
        aborted = exc
        for sid in STAGE_ORDER[start : stop + 1]:
            s = STAGE_BY_ID[sid]
            if s.billed and sid not in ran and sid not in blocked and sid not in skipped:
                state.setdefault(sid, {"status": "not-attempted-spend-limit", "at": _now()})

    save_state(ta.slug, state)
    if aborted:
        report_spend_limit(aborted)
        print(f"\n  state      {state_path(ta.slug)}")
        print_manual_work(conn, ta)
        conn.close()
        return 3

    print(f"\n{'=' * 78}\nSUMMARY  {ta.label()}  ({'EXECUTE' if execute else 'DRY-RUN'})\n{'=' * 78}")
    print(f"  proceeded  {', '.join(ran) or 'none'}")
    print(f"  blocked    {', '.join(blocked) or 'none'}")
    print(f"  refused    {', '.join(skipped) or 'none'} (billed, --allow-billed off)")
    print(f"  state      {state_path(ta.slug)}")

    print_manual_work(conn, ta)
    conn.close()
    return 0 if not blocked else 2


if __name__ == "__main__":
    sys.exit(main())
