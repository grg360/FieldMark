"""
validate_ta_neutrality.py

Phase 0 of docs/canonical/TA_NEUTRAL_DB_LAYER.md. Reads the LIVE catalog and reports every place the
database is welded to one therapeutic area.

WHY THE LIVE CATALOG AND NOT THE REPO. migrations/2026_08_04_community_ledger_tiered.sql
defines community_ledger with `where name = 'NSCLC'` -- a literal that matches zero rows
today, because therapeutic_areas.name became 'Lung Cancer' on 2026-08-15. The live function
has no such CTE. Something fixed it without a migration file. A repo linter would have
passed the deployed defect and flagged a file nobody runs. So: pg_get_functiondef,
pg_get_viewdef, pg_class, pg_proc. Read-only, one connection, no writes ever.

THE FOUR RULES
  1  No function body contains a TA slug literal.
  2  No database object NAME contains a TA token (relations, functions, types, and
     function ARGUMENT names -- p_ad_only only gets caught if arguments are scanned).
  3  Every TA-scoped function takes p_ta_id. "TA-scoped" = the body references
     therapeutic_area outside a comment.
  4  No function reaches a TA THROUGH a TA-named object. This rule exists because
     get_community_filtered already takes p_ta_id, is still NSCLC-locked (it selects
     FROM community_board_nsclc_v1), and passes rules 1 and 3 cleanly. Without rule 4 the
     validator blesses the exact defect that motivated it.

OBSERVE-ONLY BY DEFAULT. Exit 0 regardless of findings unless --strict. ta_cycle stage 0
calls it without --strict while the Phase 1-3 debt is outstanding; flip that call to
--strict when Phase 3 clears (see ta_cycle.py, run_preflight).

THE ALLOWLIST IS THE POINT. Every violation live today is seeded into
ta_neutrality_allowlist.tsv, so the reported NEW count starts at zero and the KNOWN count
can only go DOWN. Deleting a row is how you record that debt is paid; the script tells you
when a row has become stale (allowlisted but no longer violating) so the file cannot rot
into a list of things that used to be true.

Usage:
  python scripts/utilities/validate_ta_neutrality.py                 # summary
  python scripts/utilities/validate_ta_neutrality.py --list          # every finding
  python scripts/utilities/validate_ta_neutrality.py --list --known  # include allowlisted
  python scripts/utilities/validate_ta_neutrality.py --strict        # exit 1 on NEW findings
  python scripts/utilities/validate_ta_neutrality.py --emit-allowlist > seed.tsv
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

import psycopg
from dotenv import load_dotenv

load_dotenv()

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ALLOWLIST_PATH = Path(__file__).resolve().parent / "ta_neutrality_allowlist.tsv"

# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------

# HAND-MAINTAINED, and the only hand-maintained thing here. Every other token is derived
# from therapeutic_areas at runtime, so TA #4 is covered the moment its row exists -- but a
# COMMON ABBREVIATION cannot be derived from a slug. 'crc' is not a substring of
# 'colorectal-cancer' in any mechanical sense, and 'ad' is not derivable from
# 'atopic-dermatitis' without an acronym rule that would also emit 'lc' for Lung Cancer and
# 'rd' for Rare Disease -- two-letter tokens that match half the schema.
#
# ADD A ROW HERE when a TA acquires a shorthand people actually name objects with. The cost
# of a missing row is a TA-named object nobody flags; the cost of a wrong row is a false
# positive with an allowlist entry.
#
# Identifier matching only -- deliberately NOT used for rule 1. A slug literal in a function
# body is always the slug or the name (all three live casings -- 'NSCLC', 'COLORECTAL-CANCER',
# 'Atopic Dermatitis' -- normalise onto a registered slug), so aliases would add false
# positives to literal matching and catch nothing real.
EXTRA_ALIASES: Dict[str, Tuple[str, ...]] = {
    "colorectal-cancer": ("crc",),
    "atopic-dermatitis": ("ad",),
    # Hepatology indications that named objects before they were TAs in their own right.
    # Kept because the archive tables they name are real and should be exempted by name
    # rather than invisible.
    "hepatology": ("nash", "mash"),
}


@dataclass(frozen=True)
class TaTokens:
    """Two token sets, deliberately different sizes -- see EXTRA_ALIASES."""
    literal: frozenset          # normalised slugs + names; matched against string literals
    identifier: Tuple[Tuple[str, "re.Pattern[str]"], ...]  # (label, compiled) for names


def normalise_literal(value: str) -> str:
    """'NSCLC' -> 'nsclc'. 'Colorectal Cancer' -> 'colorectal-cancer'. 'COLORECTAL-CANCER'
    -> 'colorectal-cancer'. The three live casings collapse onto the registered slug, which
    is why rule 1 needs no alias list."""
    return re.sub(r"[\s_]+", "-", value.strip().lower())


def identifier_pattern(token: str) -> "re.Pattern[str]":
    """Segment-boundary match. 'ad' matches ad_yearly and hcps_v2_ad_july_delete_list, and
    does NOT match broadcast. Multi-word tokens tolerate any separator, so 'rare-disease'
    matches rare_disease and raredisease alike."""
    body = r"[-_]*".join(re.escape(part) for part in re.split(r"[-\s_]+", token) if part)
    return re.compile(r"(?<![a-z0-9])" + body + r"(?![a-z0-9])", re.IGNORECASE)


def build_tokens(ta_rows: Sequence[Tuple[str, str]]) -> TaTokens:
    literal: Set[str] = set()
    identifier: Dict[str, "re.Pattern[str]"] = {}
    for name, slug in ta_rows:
        for raw in (slug, name):
            if not raw:
                continue
            norm = normalise_literal(raw)
            literal.add(norm)
            identifier[norm] = identifier_pattern(norm)
        for alias in EXTRA_ALIASES.get(slug, ()):
            identifier[alias] = identifier_pattern(alias)
    return TaTokens(frozenset(literal), tuple(sorted(identifier.items())))


# ---------------------------------------------------------------------------
# SQL scanning
# ---------------------------------------------------------------------------

_DOLLAR_TAG = re.compile(r"\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$")


def scan_sql(text: str) -> Tuple[List[str], List[Tuple[str, int]]]:
    """Split SQL into (code_lines, literals).

    code_lines has one entry per input line with comments and string bodies blanked, so line
    numbers survive and a token found in code is genuinely in code. literals is
    [(value, lineno)].

    Dollar-quote delimiters are skipped rather than treated as string starts: the function
    BODY is dollar-quoted, and the body is exactly what we came to read. A dollar-quoted
    string CONSTANT inside a body is therefore scanned as code -- a rare false positive with
    an allowlist entry, versus missing every body if handled the other way.
    """
    code_lines: List[str] = []
    literals: List[Tuple[str, int]] = []
    in_block = False
    in_string = False
    buf: List[str] = []
    buf_line = 0

    for lineno, line in enumerate(text.split("\n"), start=1):
        out: List[str] = []
        i, n = 0, len(line)
        while i < n:
            if in_block:
                end = line.find("*/", i)
                if end == -1:
                    i = n
                else:
                    in_block = False
                    i = end + 2
                continue
            if in_string:
                # '' is an escaped quote, not a terminator.
                if line[i] == "'":
                    if i + 1 < n and line[i + 1] == "'":
                        buf.append("'")
                        i += 2
                        continue
                    in_string = False
                    literals.append(("".join(buf), buf_line))
                    buf = []
                    i += 1
                    continue
                buf.append(line[i])
                i += 1
                continue
            if line.startswith("--", i):
                break                      # comment to end of line
            if line.startswith("/*", i):
                in_block = True
                i += 2
                continue
            if line[i] == "'":
                in_string = True
                buf = []
                buf_line = lineno
                i += 1
                continue
            m = _DOLLAR_TAG.match(line, i)
            if m:
                i = m.end()
                continue
            out.append(line[i])
            i += 1
        code_lines.append("".join(out))
        if in_string:
            buf.append("\n")               # literal spans lines; keep scanning
    return code_lines, literals


# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------

@dataclass
class Finding:
    rule: int
    key: str                # "function:established_ledger" -- the allowlist match key
    detail: str
    reason: str = ""        # filled from the allowlist when known
    known: bool = False

    def sort_key(self) -> Tuple[int, str, str]:
        return (self.rule, self.key, self.detail)


RULE_TITLES = {
    1: "TA slug literal in a function body",
    2: "TA token in a database object name",
    3: "TA-scoped function without p_ta_id",
    4: "function reaches a TA through a TA-named object",
}

# Relation kinds worth naming in a key, so an allowlist row says what it exempts.
RELKIND = {"r": "table", "v": "view", "m": "matview", "i": "index",
           "S": "sequence", "p": "table", "f": "foreign", "t": "toast"}

# therapeutic_areas IS the registry, and live_therapeutic_areas is its gate. Flagging them
# would be flagging the definition of TA-ness as a TA violation. Not allowlisted -- excluded,
# because an allowlist row implies future removal and these are never going away.
REGISTRY_OBJECTS = {"therapeutic_areas", "live_therapeutic_areas",
                    "therapeutic_area_ingestion_config", "ta_drug_keywords",
                    "live_ta_parent_slugs"}


# ---------------------------------------------------------------------------
# Catalog reads
# ---------------------------------------------------------------------------

FUNCTIONS_SQL = """
select p.proname,
       coalesce(pg_get_function_identity_arguments(p.oid), '') as args,
       pg_get_functiondef(p.oid) as def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by p.proname, args
"""

RELATIONS_SQL = """
select c.relname, c.relkind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','v','m','i','S','p','f')
order by c.relname
"""

TYPES_SQL = """
select t.typname
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typtype in ('c','e','d')
  and not exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind <> 'c')
order by t.typname
"""

TA_SQL = "select name, slug from therapeutic_areas order by slug"


def fetch_catalog(conn) -> Tuple[List[Tuple[str, str]], List[Tuple[str, str, str]],
                                 List[Tuple[str, str]], List[str]]:
    with conn.cursor() as cur:
        cur.execute(TA_SQL)
        tas = [(r[0], r[1]) for r in cur.fetchall()]
        cur.execute(FUNCTIONS_SQL)
        fns = [(r[0], r[1], r[2]) for r in cur.fetchall()]
        cur.execute(RELATIONS_SQL)
        rels = [(r[0], r[1]) for r in cur.fetchall()]
        cur.execute(TYPES_SQL)
        types = [r[0] for r in cur.fetchall()]
    return tas, fns, rels, types


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------

def match_identifier(name: str, tokens: TaTokens) -> Optional[str]:
    for label, pattern in tokens.identifier:
        if pattern.search(name):
            return label
    return None


def arg_names(args: str) -> List[str]:
    """Argument names out of 'p_ta_id uuid, p_states text[]'. Best-effort: the leading word
    of each comma-separated chunk, which is the name for every function in this schema."""
    out: List[str] = []
    for chunk in args.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        first = chunk.split()[0]
        if re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", first):
            out.append(first)
    return out


def run_rules(tas, fns, rels, types, tokens: TaTokens) -> List[Finding]:
    findings: List[Finding] = []

    # ---- rule 2 first: its output is rule 4's input --------------------------------
    ta_named_objects: Set[str] = set()

    for name, kind in rels:
        if name in REGISTRY_OBJECTS:
            continue
        hit = match_identifier(name, tokens)
        if hit:
            ta_named_objects.add(name)
            findings.append(Finding(2, f"{RELKIND.get(kind, kind)}:{name}", f"token '{hit}'"))

    for name in types:
        hit = match_identifier(name, tokens)
        if hit:
            findings.append(Finding(2, f"type:{name}", f"token '{hit}'"))

    seen_fn_names: Set[str] = set()
    for name, args, _def in fns:
        if name in REGISTRY_OBJECTS or name in seen_fn_names:
            continue
        seen_fn_names.add(name)
        hit = match_identifier(name, tokens)
        if hit:
            ta_named_objects.add(name)
            findings.append(Finding(2, f"function:{name}", f"token '{hit}'"))

    for name, args, _def in fns:
        for arg in arg_names(args):
            hit = match_identifier(arg, tokens)
            if hit:
                findings.append(
                    Finding(2, f"argument:{name}.{arg}", f"token '{hit}'"))

    # ---- rules 1, 3, 4 ------------------------------------------------------------
    for name, args, definition in fns:
        if name in REGISTRY_OBJECTS:
            continue
        code_lines, literals = scan_sql(definition)
        code = "\n".join(code_lines)
        key = f"function:{name}"

        # 1 -- slug literal
        for value, lineno in literals:
            if normalise_literal(value) in tokens.literal:
                findings.append(Finding(1, key, f"L{lineno} '{value}'"))

        # 3 -- TA-scoped without p_ta_id
        if re.search(r"therapeutic_area", code, re.IGNORECASE):
            if "p_ta_id" not in arg_names(args):
                shown = args if args else "(no arguments)"
                findings.append(Finding(3, key, f"args: {shown[:70]}"))

        # 4 -- reaches a TA through a TA-named object
        for obj in sorted(ta_named_objects):
            if obj == name:
                continue                      # its own name in the CREATE header
            if re.search(r"(?<![a-z0-9_])" + re.escape(obj) + r"(?![a-z0-9_])", code, re.IGNORECASE):
                findings.append(Finding(4, key, f"reads {obj}"))

    return findings


# ---------------------------------------------------------------------------
# Allowlist
# ---------------------------------------------------------------------------

@dataclass
class Allow:
    key: str
    rule: str              # "1".."4" or "*"
    reason: str
    expires: str           # ISO date or "-"
    note: str
    hits: int = 0

    def covers(self, f: Finding) -> bool:
        return self.key == f.key and self.rule in ("*", str(f.rule))


# Markers of a dead object, matched ANYWHERE in the name so an index inherits its table's
# status (ad_pubs_delete_list_pkey is as dead as ad_pubs_delete_list). Deliberately does NOT
# include bare _pkey / ^ix_ / ^idx_: those would file the eight live part_d_oncology indexes
# as archive, which is the one misclassification that would matter -- a live object quietly
# exempted forever.
ARCHIVE_HINT = re.compile(
    r"(backup|_pre_crc|oracle_|delete_list|detour|contaminated|presweep"
    r"|ad_yearly|ad_stale|cpp_ad_drug|cleanup)")


def load_allowlist(path: Path) -> List[Allow]:
    if not path.is_file():
        return []
    out: List[Allow] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split("\t")
        if parts[0].strip() == "object":
            continue                           # header
        parts += [""] * (5 - len(parts))
        out.append(Allow(parts[0].strip(), parts[1].strip() or "*",
                         parts[2].strip(), parts[3].strip() or "-", parts[4].strip()))
    return out


def emit_allowlist(findings: Sequence[Finding]) -> str:
    """Seed rows for every finding, one per (key, rule). Reasons are a first guess -- the
    checked-in file hand-corrects them to per_ta_content / false_positive where §E of the
    design says the content, not the name, is the TA-specific thing."""
    lines = ["object\trule\treason\texpires\tnote"]
    seen: Set[Tuple[str, int]] = set()
    for f in sorted(findings, key=Finding.sort_key):
        if (f.key, f.rule) in seen:
            continue
        seen.add((f.key, f.rule))
        name = f.key.split(":", 1)[1]
        reason = "archive" if ARCHIVE_HINT.search(name) else "debt"
        lines.append(f"{f.key}\t{f.rule}\t{reason}\t-\t")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def report(findings: List[Finding], allow: List[Allow], counts: Dict[str, int],
           show_list: bool, show_known: bool) -> Tuple[int, int, List[Allow]]:
    for f in findings:
        for a in allow:
            if a.covers(f):
                f.known = True
                f.reason = a.reason
                a.hits += 1
                break

    new = [f for f in findings if not f.known]
    known = [f for f in findings if f.known]
    stale = [a for a in allow if a.hits == 0]

    print(f"[ta-neutrality] live catalog: {counts['functions']} functions, "
          f"{counts['relations']} relations, {counts['types']} types; "
          f"tokens from {counts['tas']} therapeutic areas")
    print(f"[ta-neutrality] NEW {len(new)}   KNOWN {len(known)}   "
          f"STALE allowlist rows {len(stale)}")

    by_reason: Dict[str, int] = {}
    for f in known:
        by_reason[f.reason or "(unlabelled)"] = by_reason.get(f.reason or "(unlabelled)", 0) + 1
    if by_reason:
        print("[ta-neutrality] known by reason: "
              + "  ".join(f"{k}={v}" for k, v in sorted(by_reason.items())))

    for rule in sorted(RULE_TITLES):
        n_new = sum(1 for f in new if f.rule == rule)
        n_known = sum(1 for f in known if f.rule == rule)
        print(f"[ta-neutrality]   rule {rule}  new {n_new:>3}  known {n_known:>3}   "
              f"{RULE_TITLES[rule]}")

    if new:
        print("\n[ta-neutrality] NEW VIOLATIONS -- not in the allowlist:")
        for f in sorted(new, key=Finding.sort_key):
            print(f"    rule {f.rule}  {f.key}  {f.detail}")

    if show_list and (show_known or not new):
        rows = sorted(known if show_known else new, key=Finding.sort_key)
        if rows:
            print("\n[ta-neutrality] KNOWN (allowlisted):" if show_known
                  else "\n[ta-neutrality] findings:")
            for f in rows:
                print(f"    rule {f.rule}  [{f.reason}]  {f.key}  {f.detail}")

    if stale:
        print("\n[ta-neutrality] STALE allowlist rows -- the violation is gone, delete the row:")
        for a in stale:
            print(f"    {a.key}  rule {a.rule}  [{a.reason}]")

    return len(new), len(known), stale


def main() -> int:
    ap = argparse.ArgumentParser(description="Report TA-welded database objects (read-only).")
    ap.add_argument("--strict", action="store_true",
                    help="Exit 1 if any NEW violation is found. Off by default: ta_cycle "
                         "stage 0 is observe-only until the Phase 1-3 debt clears.")
    ap.add_argument("--list", dest="show_list", action="store_true",
                    help="Print every finding, not just the counts.")
    ap.add_argument("--known", action="store_true",
                    help="With --list, include allowlisted findings.")
    ap.add_argument("--emit-allowlist", action="store_true",
                    help="Print a seed allowlist covering every current finding, then exit.")
    ap.add_argument("--allowlist", default=str(ALLOWLIST_PATH),
                    help=f"Allowlist path (default {ALLOWLIST_PATH.name}).")
    args = ap.parse_args()

    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL not set in .env", file=sys.stderr)
        return 2

    with psycopg.connect(url) as conn:
        conn.read_only = True
        tas, fns, rels, types = fetch_catalog(conn)

    tokens = build_tokens(tas)
    findings = run_rules(tas, fns, rels, types, tokens)

    if args.emit_allowlist:
        sys.stdout.write(emit_allowlist(findings))
        return 0

    counts = {"functions": len(fns), "relations": len(rels),
              "types": len(types), "tas": len(tas)}
    n_new, _n_known, _stale = report(
        findings, load_allowlist(Path(args.allowlist)), counts, args.show_list, args.known)

    if args.strict and n_new:
        print(f"\n[ta-neutrality] FAILED: {n_new} new violation(s).", file=sys.stderr)
        return 1
    if n_new:
        print(f"\n[ta-neutrality] observe-only: {n_new} new violation(s) reported, "
              f"not failing. Run with --strict to enforce.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
