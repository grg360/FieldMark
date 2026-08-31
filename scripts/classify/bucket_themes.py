"""
bucket_themes.py — Three-pass pipeline to bucket raw research themes into canonical taxonomy.

Pass 1: Generate 20–25 canonical buckets from top-N raw themes (Claude API).
Pass 1b: Refine taxonomy (merge perioperative buckets, expand rare-driver description).
Pass 2: Assign every raw theme to a locked canonical bucket.
Pass 3: Manual review via no_fit_{TA}.json for themes flagged NO_FIT.

Required environment variables:
- ANTHROPIC_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_KEY (or SUPABASE_KEY)
- DATABASE_URL (for GROUP BY queries via psycopg)

Usage:
    python backend/scripts/bucket_themes.py --ta nsclc --pass 1 --dry-run
    python backend/scripts/bucket_themes.py --ta nsclc --pass 1
    python backend/scripts/bucket_themes.py --ta nsclc --pass 2 --dry-run
    python backend/scripts/bucket_themes.py --ta nsclc --pass 2 --resume
    python backend/scripts/bucket_themes.py --ta nsclc --pass all
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

import click
import psycopg
from anthropic import Anthropic

# Same directory, and Python puts the running script's directory on sys.path[0].
# extract_research_themes has no module-level side effects -- its load_dotenv() and its
# Anthropic client construction both live inside main() -- so importing it is free.
# See the --ta option below for why this import exists at all.
from extract_research_themes import TA_CONFIGS as _THEME_TA_CONFIGS
from dotenv import load_dotenv
from psycopg.rows import dict_row
from supabase import Client, create_client

load_dotenv()

MODEL = "claude-sonnet-4-6"

# PASS-2 OUTPUT CEILING (raised 8192 -> 16384, 2026-08-27).
#
# Pass 2 echoes every input theme back in its response, so output scales with batch size
# AND with theme-name length. Measured on the CRC run that exposed this: a full 200-item
# response is ~10,800 tokens (count_tokens on a reconstructed response built from real
# theme names and real bucket names, 53.9 tokens/item). Against the old 8,192 ceiling that
# is ~130% of budget -- truncation was not bad luck, it was arithmetically certain for
# every full batch. Five of six CRC batches died at char 26,517-27,226, a 709-char window
# across five independent calls.
#
# 16384 with the default batch of 100 is ~5,400 tokens used, ~3x headroom. THE HEADROOM IS
# NOT THE FIX -- the stop_reason check in run_pass_2 is. This ceiling only buys room; the
# check is what makes an overflow announce itself instead of arriving as "malformed JSON".
PASS_2_MAX_TOKENS = 16384

TOP_THEMES_SQL = """
SELECT theme_name, COUNT(DISTINCT hcp_id) AS n_hcps
FROM public.hcp_research_themes_v2
WHERE therapeutic_area = %s
GROUP BY theme_name
ORDER BY n_hcps DESC
LIMIT %s
"""

ALL_THEMES_SQL = """
SELECT DISTINCT theme_name
FROM public.hcp_research_themes_v2
WHERE therapeutic_area = %s
ORDER BY theme_name
"""

ALL_THEMES_EXCLUDE_ASSIGNED_SQL = """
SELECT DISTINCT t.theme_name
FROM public.hcp_research_themes_v2 t
LEFT JOIN public.theme_to_canonical_v1 m
  ON m.raw_theme_name = t.theme_name
 AND m.therapeutic_area = t.therapeutic_area
WHERE t.therapeutic_area = %s
  AND m.raw_theme_name IS NULL
ORDER BY t.theme_name
"""


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def get_supabase_key() -> str:
    return os.getenv("SUPABASE_SERVICE_KEY", "").strip() or get_required_env("SUPABASE_KEY")


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_supabase_key())


def get_db_connection() -> psycopg.Connection:
    return psycopg.connect(get_required_env("DATABASE_URL"), row_factory=dict_row)


def fetch_top_themes(ta_upper: str, limit: int) -> list[dict[str, Any]]:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(TOP_THEMES_SQL, (ta_upper, limit))
            rows = cur.fetchall()
    return [
        {"theme_name": row["theme_name"], "n_hcps": int(row["n_hcps"])}
        for row in rows
    ]


def fetch_all_themes(ta_upper: str, exclude_assigned: bool = False) -> list[str]:
    sql = ALL_THEMES_EXCLUDE_ASSIGNED_SQL if exclude_assigned else ALL_THEMES_SQL
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (ta_upper,))
            rows = cur.fetchall()
    return [row["theme_name"] for row in rows]


def build_pass_1_prompt(ta_upper: str, top_themes: list[dict[str, Any]]) -> str:
    theme_list = "\n".join(
        f"- {t['theme_name']} ({t['n_hcps']} HCPs)" for t in top_themes
    )
    return f"""You are designing a canonical research-theme taxonomy for {ta_upper}.

Below are the {len(top_themes)} most common research themes extracted from publications by HCPs working in {ta_upper}, with the number of HCPs associated with each theme:

{theme_list}

Your task: design 20-25 canonical research-theme buckets that semantically cover this space. Each bucket should:
- Be a meaningful slice of {ta_upper} research that an MSL would care about (e.g., "EGFR resistance mechanisms," "Immunotherapy combinations," "Antibody-drug conjugates," "Perioperative immunotherapy," "SBRT and radiation oncology")
- Be exclusive (no two buckets cover the same area)
- Cover at least 80% of the themes in the input list collectively (the long tail can be approximated)
- Be named in 2-6 words, in title case
- Have a one-sentence description

Return ONLY valid JSON in this exact format, no markdown, no commentary:

[
  {{"canonical_name": "...", "description": "..."}},
  {{"canonical_name": "...", "description": "..."}},
  ...
]

Must have 20-25 entries, no more, no less."""


def build_pass_2_prompt(
    ta_upper: str,
    canonicals: list[dict[str, Any]],
    batch_themes: list[str],
) -> str:
    canonical_list = "\n".join(
        f"{i + 1}. {c['canonical_name']} — {c['description']}"
        for i, c in enumerate(canonicals)
    )
    theme_list = "\n".join(f"- {t}" for t in batch_themes)
    return f"""You have a locked taxonomy of {len(canonicals)} canonical research-theme buckets for {ta_upper}:

{canonical_list}

Below are raw research themes. For each, assign it to EXACTLY ONE of the canonical buckets above by name. If a theme truly does not fit any bucket, assign it to "NO_FIT" (use sparingly — most themes should fit something).

Raw themes to assign:
{theme_list}

Return ONLY valid JSON in this format, no markdown:

[
  {{"raw_theme": "...", "canonical_name": "...", "confidence": "high|medium|low"}},
  ...
]

Use "high" confidence when the theme is a clear match, "medium" when reasonable, "low" when stretching. Include every theme. No commentary."""


def parse_json_response(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(text)


def parse_pass_1_response(text: str) -> list[dict[str, str]]:
    return parse_json_response(text)


def parse_pass_2_response(text: str) -> list[dict[str, str]]:
    return parse_json_response(text)


def validate_taxonomy(taxonomy: list[dict[str, str]]) -> None:
    assert 20 <= len(taxonomy) <= 25, f"Taxonomy must have 20-25 buckets, got {len(taxonomy)}"
    names = [b["canonical_name"] for b in taxonomy]
    assert len(names) == len(set(names)), "Duplicate canonical names"
    for bucket in taxonomy:
        assert "canonical_name" in bucket and "description" in bucket
        assert bucket["canonical_name"].strip(), "Empty canonical_name"


def validate_refined_taxonomy(taxonomy: list[dict[str, str]]) -> None:
    assert len(taxonomy) == 24, f"Refined taxonomy must have 24 buckets, got {len(taxonomy)}"
    names = [b["canonical_name"] for b in taxonomy]
    assert len(names) == len(set(names)), "Duplicate canonical names"
    for bucket in taxonomy:
        assert "canonical_name" in bucket and "description" in bucket
        assert bucket["canonical_name"].strip(), "Empty canonical_name"

    assert "Adjuvant Targeted Therapy" not in names
    assert "Perioperative Systemic Therapy Outcomes" not in names

    perioperative_non_immuno = [
        b
        for b in taxonomy
        if "perioperative" in b["canonical_name"].lower()
        and "immunotherapy" not in b["canonical_name"].lower()
    ]
    assert len(perioperative_non_immuno) == 1, (
        "Expected exactly one perioperative non-immunotherapy bucket"
    )

    rare_driver = next(
        (b for b in taxonomy if b["canonical_name"] == "Rare Oncogenic Drivers"),
        None,
    )
    assert rare_driver is not None, 'Missing bucket "Rare Oncogenic Drivers"'
    desc_upper = rare_driver["description"].upper()
    markers = ["HER2", "RET", "BRAF", "NTRK", "NRG1"]
    matched = sum(1 for marker in markers if marker in desc_upper)
    assert matched >= 3, (
        f"Rare Oncogenic Drivers description must mention at least 3 of "
        f"{markers}, got {matched}"
    )


def _print_taxonomy(taxonomy: list[dict[str, str]], label: str) -> None:
    print(f"{label} ({len(taxonomy)} buckets):")
    for i, bucket in enumerate(taxonomy, 1):
        desc = bucket["description"][:80]
        suffix = "..." if len(bucket["description"]) > 80 else ""
        print(f"  {i}. {bucket['canonical_name']} — {desc}{suffix}")


def refine_taxonomy(
    client: Anthropic,
    taxonomy: list[dict[str, str]],
    ta_upper: str,
) -> list[dict[str, str]]:
    refinement_instructions = f"""You generated this taxonomy of 25 canonical
research-theme buckets for {ta_upper}:

{json.dumps(taxonomy, indent=2)}

Apply these two refinements:

1. MERGE these two buckets into a single bucket:
   - "Adjuvant Targeted Therapy"
   - "Perioperative Systemic Therapy Outcomes"

   Replace them with one bucket called "Perioperative Targeted and
   Chemotherapy" covering: adjuvant EGFR TKI use, adjuvant ALK
   inhibitor use, neoadjuvant chemotherapy, adjuvant chemotherapy,
   and perioperative systemic therapy outcomes (excluding
   immunotherapy, which has its own bucket).

   Note: "Perioperative Immunotherapy" is a DIFFERENT bucket and
   must remain separate.

2. EXPAND the description of "Rare Oncogenic Drivers" to explicitly
   name the alterations it covers. Include at minimum: HER2 mutations,
   RET fusions, BRAF V600 mutations, NTRK fusions, NRG1 fusions, and
   other emerging biomarker-defined NSCLC subtypes. The bucket name
   stays the same but the description becomes more specific.

Keep all other 22 buckets EXACTLY as they are — same name, same
description. The final taxonomy must have exactly 24 buckets.

Return ONLY valid JSON in this exact format, no markdown, no commentary:

[
  {{"canonical_name": "...", "description": "..."}},
  ...
]
"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": refinement_instructions}],
    )

    refined = parse_pass_1_response(response.content[0].text)
    validate_refined_taxonomy(refined)
    return refined


def run_taxonomy_refinement(
    client: Anthropic,
    taxonomy: list[dict[str, str]],
    ta_upper: str,
) -> list[dict[str, str]]:
    """Pass 1b: refine in-memory taxonomy before DB commit."""
    print("Pass 1 refinement: merging buckets and expanding descriptions...")
    return refine_taxonomy(client, taxonomy, ta_upper)


def run_pass_1(
    client: Anthropic,
    sb: Client,
    ta_upper: str,
    sample_size: int,
    dry_run: bool,
) -> list[dict[str, str]]:
    top_themes = fetch_top_themes(ta_upper, sample_size)
    if not top_themes:
        raise RuntimeError(f"No themes found for therapeutic_area={ta_upper}")

    print(f"Pass 1: generating taxonomy from top {len(top_themes)} themes...")
    prompt = build_pass_1_prompt(ta_upper, top_themes)
    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    taxonomy = parse_pass_1_response(response.content[0].text)
    validate_taxonomy(taxonomy)

    _print_taxonomy(taxonomy, "Initial taxonomy")

    # taxonomy = run_taxonomy_refinement(client, taxonomy, ta_upper)  # Refinement disabled - taxonomy is good as-is
    _print_taxonomy(taxonomy, "Refined taxonomy")

    if dry_run:
        return taxonomy

    for i, bucket in enumerate(taxonomy):
        sb.table("theme_canonical_v1").insert(
            {
                "canonical_name": bucket["canonical_name"],
                "description": bucket["description"],
                "therapeutic_area": ta_upper,
                "display_order": i,
            }
        ).execute()

    print(f"Wrote {len(taxonomy)} canonical buckets for {ta_upper}.")
    return taxonomy


def load_canonicals(sb: Client, ta_upper: str) -> list[dict[str, Any]]:
    result = (
        sb.table("theme_canonical_v1")
        .select("*")
        .eq("therapeutic_area", ta_upper)
        .order("display_order")
        .execute()
    )
    return result.data or []


def run_pass_2(
    client: Anthropic,
    sb: Client,
    ta_upper: str,
    batch_size: int,
    dry_run: bool,
    resume: bool,
) -> tuple:
    """Returns (attempted, assigned) for the all-failed rule in main()."""
    canonicals = load_canonicals(sb, ta_upper)
    if not canonicals:
        raise RuntimeError("No canonical buckets found. Run pass 1 first.")

    all_themes = fetch_all_themes(ta_upper, exclude_assigned=resume)
    if not all_themes:
        print("No raw themes to assign.")
        return 0, 0   # nothing attempted -- a --resume no-op is not a failure

    print(
        f"Pass 2: assigning {len(all_themes)} raw themes to "
        f"{len(canonicals)} canonical buckets..."
    )

    assignments: list[dict[str, Any]] = []
    no_fit: list[str] = []
    failed_batches: list[dict[str, Any]] = []
    total_batches = (len(all_themes) + batch_size - 1) // batch_size

    for batch_idx in range(0, len(all_themes), batch_size):
        batch = all_themes[batch_idx : batch_idx + batch_size]
        batch_num = batch_idx // batch_size + 1
        prompt = build_pass_2_prompt(ta_upper, canonicals, batch)

        response = None
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=PASS_2_MAX_TOKENS,
                messages=[{"role": "user", "content": prompt}],
            )
            # CHECK THE STOP REASON BEFORE PARSING. A truncated response is an HTTP 200
            # carrying valid content that happens to be half a document, so it reaches
            # json.loads and dies there as "Unterminated string" -- a parser error for a
            # condition the API already reported. Catching it here names the cause, the
            # batch and the size; catching it at json.loads names a character offset.
            if response.stop_reason == "max_tokens":
                raise RuntimeError(
                    f"batch {batch_num}/{total_batches} TRUNCATED at max_tokens: "
                    f"{len(batch)} themes requested, response hit the "
                    f"{PASS_2_MAX_TOKENS:,}-token ceiling "
                    f"({getattr(response.usage, 'output_tokens', '?')} output tokens). "
                    f"Pass 2 echoes every theme back, so output scales with batch size -- "
                    f"lower --pass-2-batch-size (currently {batch_size}) or raise "
                    f"PASS_2_MAX_TOKENS. Nothing was parsed; this batch is unassigned."
                )
            batch_results = parse_pass_2_response(response.content[0].text)
        except Exception as exc:
            print(
                f"  ERROR batch {batch_num}/{total_batches}: {exc}",
                file=sys.stderr,
            )
            # LOG ENOUGH TO DIAGNOSE BY READING, NOT BY RECONSTRUCTING. The previous
            # version stored only batch_num/themes/error, so establishing that five CRC
            # failures were truncation rather than malformed content took rebuilding a
            # synthetic response and counting its tokens. stop_reason answers it outright;
            # response_text makes "is the last line cut mid-value" a one-line check.
            usage = getattr(response, "usage", None) if response is not None else None
            text = None
            if response is not None:
                try:
                    text = response.content[0].text
                except (AttributeError, IndexError):
                    text = None
            failed_batches.append(
                {
                    "batch_num": batch_num,
                    "batch_size": len(batch),
                    "themes": batch,
                    "error": str(exc),
                    "stop_reason": getattr(response, "stop_reason", None),
                    "output_tokens": getattr(usage, "output_tokens", None),
                    "input_tokens": getattr(usage, "input_tokens", None),
                    "max_tokens_requested": PASS_2_MAX_TOKENS,
                    "response_text": text,
                }
            )
            time.sleep(1)
            continue

        canonical_by_name = {c["canonical_name"]: c for c in canonicals}
        for result in batch_results:
            raw_theme = result.get("raw_theme", "").strip()
            canonical_name = result.get("canonical_name", "").strip()
            if not raw_theme:
                continue
            if canonical_name == "NO_FIT":
                no_fit.append(raw_theme)
                continue
            canonical = canonical_by_name.get(canonical_name)
            if canonical is None:
                print(
                    f"  WARN: unknown canonical '{canonical_name}' for "
                    f"theme '{raw_theme}', flagging as no-fit"
                )
                no_fit.append(raw_theme)
            else:
                assignments.append(
                    {
                        "raw_theme_name": raw_theme,
                        "therapeutic_area": ta_upper,
                        "canonical_id": canonical["id"],
                        "confidence": result.get("confidence", "medium"),
                    }
                )

        print(
            f"  Batch {batch_num}/{total_batches}: {len(batch_results)} processed, "
            f"{len(no_fit)} no-fit so far"
        )
        time.sleep(1)

    if failed_batches:
        failed_path = f"failed_batches_{ta_upper}.json"
        with open(failed_path, "w", encoding="utf-8") as f:
            json.dump(failed_batches, f, indent=2)
        print(f"Logged {len(failed_batches)} failed batch(es) to {failed_path}")

    if dry_run:
        print(
            f"Dry run complete. Would assign {len(assignments)}, "
            f"flag {len(no_fit)} as no-fit."
        )
        return 0, 0   # dry run writes nothing; nothing to judge

    for assignment in assignments:
        sb.table("theme_to_canonical_v1").upsert(
            assignment,
            on_conflict="raw_theme_name,therapeutic_area",
        ).execute()

    print(f"Assigned {len(assignments)} raw themes.")
    no_fit_path = f"no_fit_{ta_upper}.json"
    with open(no_fit_path, "w", encoding="utf-8") as f:
        json.dump(no_fit, f, indent=2)
    print(
        f"Flagged {len(no_fit)} as no-fit — see {no_fit_path} for manual review."
    )
    return len(all_themes), len(assignments)


@click.command()
@click.option(
    "--ta",
    required=True,
    # DERIVED FROM TA_CONFIGS, NOT HARDCODED (2026-08-27).
    #
    # This list used to read ["nsclc", "hepatology", "immunology", "raredisease"] -- a set
    # that has drifted from reality in both directions. It admits hepatology, immunology
    # and raredisease, none of which has a TA_CONFIGS entry in the script that WRITES the
    # themes, so they could never have anything to bucket. And it rejects
    # atopic-dermatitis, a shipped TA with 3,499 extracted theme rows: `--ta
    # atopic-dermatitis` never got past click, which is the FIRST reason those rows were
    # never bucketed (the ta.upper() vs tag mismatch below is the second).
    #
    # Deriving the list means a new TA is one edit -- the TA_CONFIGS entry -- rather than
    # two files that must be remembered together.
    #
    # NOTE this unblocks CRC but NOT AD. CRC's tag is spelled SLUG.UPPER(), so ta.upper()
    # finds it. AD's tag is 'Atopic Dermatitis' and ta.upper() is 'ATOPIC-DERMATITIS', so
    # AD now reaches a clear "No themes found for therapeutic_area=ATOPIC-DERMATITIS"
    # instead of an argparse rejection -- a better error, still an error. Fixing AD needs
    # the real fix: read TA_CONFIGS[ta]["tag"] here instead of computing ta.upper().
    type=click.Choice(sorted(_THEME_TA_CONFIGS.keys())),
)
@click.option("--pass", "pass_num", default="all", type=click.Choice(["1", "2", "all"]))
@click.option("--pass-1-sample-size", default=500, show_default=True)
# 200 -> 100 (2026-08-27). At 200, a full response is ~10,800 tokens and could never fit
# any ceiling this script had; NSCLC's successful run used 100. 100 items is ~5,400 tokens.
# Halving the batch roughly doubles the fixed per-batch cost of re-sending the canonical
# bucket list, which is small against the theme payload.
@click.option("--pass-2-batch-size", default=100, show_default=True)
@click.option("--dry-run", is_flag=True)
@click.option("--resume", is_flag=True)
def main(
    ta: str,
    pass_num: str,
    pass_1_sample_size: int,
    pass_2_batch_size: int,
    dry_run: bool,
    resume: bool,
) -> None:
    ta_upper = ta.upper()
    client = Anthropic(api_key=get_required_env("ANTHROPIC_API_KEY"))
    sb = init_supabase()

    if pass_num in ("1", "all"):
        run_pass_1(client, sb, ta_upper, pass_1_sample_size, dry_run)
    if pass_num in ("2", "all"):
        attempted, assigned = run_pass_2(
            client, sb, ta_upper, pass_2_batch_size, dry_run, resume
        )
        # ALL-FAILED RULE. attempted = raw themes pass 2 set out to bucket, succeeded = themes
        # assigned to a canonical. no_fit is NOT counted as failure -- a theme that fits no
        # bucket is a real answer this script is designed to record. Only "we had themes and
        # assigned none of them" is unambiguous, which is what a run where every batch errored
        # looks like. A --resume run with nothing left returns (0, 0) and stays quiet.
        if attempted and not assigned:
            click.echo(
                f"[FAIL] 0 of {attempted} raw themes assigned to a canonical bucket.",
                err=True,
            )
            raise SystemExit(1)


if __name__ == "__main__":
    main()
