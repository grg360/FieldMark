#!/usr/bin/env python3
"""ta_completeness.py -- measure a therapeutic area against the completeness manifest.

READ-ONLY. It opens a read-only database session, runs the manifest's queries, and emits a
plan. It NEVER executes a producer, NEVER writes to the database, and NEVER runs a billed job.
The plan is a document; running it is a separate, human decision.

  python scripts/ta_completeness.py --ta <slug> [--plan-out PATH] [--format text|json]
  python scripts/ta_completeness.py --validate-manifest        # schema gate only, no DB

THE HARD CONSTRAINT
  This file contains no TA slug, no table name, no producer path and no threshold. Every such
  fact is read from the manifest. If the checker would need to know something about a
  particular therapeutic area or artifact to be correct, that fact belongs in the manifest.
  This tool exists because that rule was broken everywhere else; it must not break it itself.
  The only names below are STRUCTURAL -- the manifest's own field names.

STATES
  SATISFIED     applicable, measured, present, and passing every sufficiency axis it has
  INSUFFICIENT  present -- the producer ran -- but an axis is below its threshold. TWO AXES,
                measured independently:
                  throughput  did the stage finish the queue it was given? Denominator is
                              generate_cycle's own work-set, CAPS INCLUDED.
                  coverage    does the population a user would expect the artifact to span
                              actually have it? Denominator is the board, UNCAPPED.
                A stage can finish its queue and still cover a tenth of the board; those are
                different facts and the plan prints both.
  GAP           applicable, measured, zero, and its classification is gap-eligible
  N/A           not applicable to this TA, or its classification is not gap-eligible
  UNKNOWN       could not be measured. MANDATORY for an entry flagged coverage_query_unsafe,
                a query that errors, a target that does not exist, or a sufficiency ratio
                whose denominator is zero. UNKNOWN NEVER degrades to zero and never presents
                as any other state. A TA with any UNKNOWN entry cannot be reported complete.

THE SCHEMA GATE
  --validate-manifest asserts STRUCTURE, never content: required fields, field types, upstream
  resolution, and that no mapping key parsed to a non-string. That last check exists because
  YAML 1.1 resolves a bare `on:` key to the boolean True, which silently turned all 59
  depends_on edges into {True: <name>} -- a dependency graph that looked correct and ordered
  nothing. The gate runs before every measurement pass; it cannot be skipped.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = REPO_ROOT / "docs" / "ta_completeness_manifest.draft.yaml"

SATISFIED, INSUFFICIENT, GAP, NA, UNKNOWN = (
    "SATISFIED", "INSUFFICIENT", "GAP", "N/A", "UNKNOWN")
STATE_ORDER = (UNKNOWN, GAP, INSUFFICIENT, NA, SATISFIED)

_READ_ONLY_HEAD = re.compile(r"^\s*(select|with)\b", re.I)
_BIND = re.compile(r":([a-z_][a-z0-9_]*)", re.I)

REQUIRED_SECTIONS = ("meta", "registry", "binds", "ta_facts", "classification_semantics",
                     "plan_group_order", "artifacts")
VALID_KINDS = ("input", "output", "schema_gap")
VALID_GATES = ("hard_fail", "degrade", "weight_gated")
AXES = ("throughput", "coverage")
QUERY_FIELDS = ("coverage_query",) + tuple(
    f"{a}_{p}" for a in AXES for p in ("covered", "eligible"))


class ManifestError(RuntimeError):
    """The manifest is structurally wrong. Never guessed around."""


# ---------------------------------------------------------------------------------------
# the schema gate
# ---------------------------------------------------------------------------------------

def _walk_keys(node, path, errors):
    """Every mapping key, at every depth, must be a string. Catches YAML 1.1 bare `on:`."""
    if isinstance(node, dict):
        for k, v in node.items():
            if not isinstance(k, str):
                errors.append(
                    f"{path}: mapping key {k!r} parsed as {type(k).__name__}, not str. "
                    f"YAML 1.1 resolves bare on/off/yes/no/true/false keys to booleans -- "
                    f"quote the key or rename it.")
            _walk_keys(v, f"{path}.{k}", errors)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            _walk_keys(v, f"{path}[{i}]", errors)


def _typed(obj, field, types, path, errors, required=True, allow_none=False):
    if field not in obj:
        if required:
            errors.append(f"{path}: missing required field {field!r}")
        return None
    val = obj[field]
    if val is None and allow_none:
        return None
    if not isinstance(val, types):
        names = "|".join(t.__name__ for t in (types if isinstance(types, tuple) else (types,)))
        errors.append(f"{path}.{field}: expected {names}, got {type(val).__name__}")
        return None
    return val


def validate_manifest(m) -> list:
    """-> list of structural errors. Empty list means the manifest parses to the right shape."""
    errors = []
    if not isinstance(m, dict):
        return [f"<root>: manifest must be a mapping, got {type(m).__name__}"]

    # Key-shape errors are COLLECTED, not fatal: a single bad key must not suppress the rest
    # of the report. Only a missing top-level section stops the pass, because every later
    # check reads one.
    _walk_keys(m, "<root>", errors)

    section_errors = [f"<root>: missing required section {s!r}"
                      for s in REQUIRED_SECTIONS if s not in m]
    errors.extend(section_errors)
    if section_errors:
        return errors

    _typed(m, "artifacts", list, "<root>", errors)
    _typed(m, "plan_group_order", list, "<root>", errors)
    shape_errors = []
    for name in ("registry", "binds", "ta_facts", "classification_semantics", "meta"):
        _typed(m, name, dict, "<root>", shape_errors)
    errors.extend(shape_errors)
    if shape_errors:
        return errors

    for f in ("table", "slug_column", "id_column"):
        _typed(m["registry"], f, str, "registry", errors)

    for bind, spec in m["binds"].items():
        p = f"binds.{bind}"
        if not isinstance(spec, dict):
            errors.append(f"{p}: expected mapping, got {type(spec).__name__}")
            continue
        src = _typed(spec, "from", str, p, errors)
        if src == "registry":
            _typed(spec, "column", str, p, errors)
        elif src == "ta_facts":
            _typed(spec, "key", str, p, errors)
        elif src is not None:
            errors.append(f"{p}.from: unknown source {src!r}")
        if "nullable" in spec:
            _typed(spec, "nullable", bool, p, errors)

    groups = m["plan_group_order"]
    for cls, sem in m["classification_semantics"].items():
        p = f"classification_semantics.{cls}"
        if not isinstance(sem, dict):
            errors.append(f"{p}: expected mapping, got {type(sem).__name__}")
            continue
        _typed(sem, "gap_eligible", bool, p, errors)
        pg = _typed(sem, "plan_group", str, p, errors, allow_none=True)
        if pg is not None and pg not in groups:
            errors.append(f"{p}.plan_group: {pg!r} is not in plan_group_order")

    for slug, facts in m["ta_facts"].items():
        if not isinstance(facts, dict):
            errors.append(f"ta_facts.{slug}: expected mapping, got {type(facts).__name__}")

    entry_names, external = set(), set(m.get("external_dependencies") or [])
    for i, e in enumerate(m["artifacts"]):
        if not isinstance(e, dict):
            errors.append(f"artifacts[{i}]: expected mapping, got {type(e).__name__}")
            continue
        nm = _typed(e, "name", str, f"artifacts[{i}]", errors)
        if nm:
            if nm in entry_names:
                errors.append(f"artifacts[{i}].name: duplicate entry name {nm!r}")
            entry_names.add(nm)

    known_binds, known_cls = set(m["binds"]), set(m["classification_semantics"])
    for e in m["artifacts"]:
        if not isinstance(e, dict) or not isinstance(e.get("name"), str):
            continue
        p = f"artifacts[{e['name']}]"

        kind = _typed(e, "kind", str, p, errors)
        if kind is not None and kind not in VALID_KINDS:
            errors.append(f"{p}.kind: {kind!r} not one of {VALID_KINDS}")

        cls = _typed(e, "classification", str, p, errors)
        if cls is not None and cls not in known_cls:
            errors.append(f"{p}.classification: {cls!r} has no classification_semantics entry")

        app = _typed(e, "applicability", dict, p, errors)
        if app is not None:
            if "unconditional" in app:
                _typed(app, "unconditional", bool, f"{p}.applicability", errors)
            elif "applies_when" in app:
                aw = _typed(app, "applies_when", dict, f"{p}.applicability", errors)
                if aw is not None:
                    fact = _typed(aw, "fact", str, f"{p}.applicability.applies_when", errors)
                    if "equals" not in aw:
                        errors.append(f"{p}.applicability.applies_when: missing 'equals'")
                    if fact:
                        for slug, facts in m["ta_facts"].items():
                            if isinstance(facts, dict) and fact not in facts:
                                errors.append(
                                    f"{p}.applicability.applies_when.fact: {fact!r} is absent "
                                    f"from ta_facts.{slug}")
            else:
                errors.append(
                    f"{p}.applicability: needs either 'unconditional' or 'applies_when'. An "
                    f"entry that cannot say when it applies cannot be measured.")

        if "coverage_query_unsafe" in e:
            _typed(e, "coverage_query_unsafe", bool, p, errors)

        for qf in QUERY_FIELDS:
            if qf in e and e[qf] is not None:
                q = _typed(e, qf, str, p, errors)
                if q:
                    if not _READ_ONLY_HEAD.match(q):
                        errors.append(f"{p}.{qf}: must begin with SELECT or WITH")
                    for b in sorted(set(_BIND.findall(q))):
                        if b not in known_binds:
                            errors.append(f"{p}.{qf}: bind :{b} is not declared in binds")

        if "sufficiency" in e:
            s = _typed(e, "sufficiency", dict, p, errors)
            if s is not None:
                sp = f"{p}.sufficiency"
                present = [a for a in AXES
                           if f"{a}_covered" in s or f"{a}_eligible" in s
                           or f"{a}_threshold" in s]
                if not present:
                    errors.append(f"{sp}: declares no axis; expected one of {AXES}")
                for axis in present:
                    for half in ("covered", "eligible"):
                        q = _typed(s, f"{axis}_{half}", str, sp, errors)
                        if not isinstance(q, str):
                            continue
                        if not _READ_ONLY_HEAD.match(q):
                            errors.append(f"{sp}.{axis}_{half}: must begin with SELECT or WITH")
                        for b in sorted(set(_BIND.findall(q))):
                            if b not in known_binds:
                                errors.append(
                                    f"{sp}.{axis}_{half}: bind :{b} is not declared in binds")
                    th = _typed(s, f"{axis}_threshold", (int, float), sp, errors)
                    if th is not None and not (0 < float(th) <= 1):
                        errors.append(
                            f"{sp}.{axis}_threshold: {th!r} must be in (0, 1]")
                    aw = s.get(f"{axis}_applies_when")
                    if aw is not None:
                        if not isinstance(aw, dict):
                            errors.append(f"{sp}.{axis}_applies_when: expected mapping")
                        else:
                            fct = _typed(aw, "fact", str,
                                         f"{sp}.{axis}_applies_when", errors)
                            if "equals" not in aw:
                                errors.append(
                                    f"{sp}.{axis}_applies_when: missing 'equals'")
                            if fct:
                                for slug2, fs in m["ta_facts"].items():
                                    if isinstance(fs, dict) and fct not in fs:
                                        errors.append(
                                            f"{sp}.{axis}_applies_when.fact: {fct!r} is "
                                            f"absent from ta_facts.{slug2}")
                    if not s.get(f"{axis}_ratified", False) and \
                            not str(s.get(f"{axis}_threshold_reasoning", "")).strip():
                        errors.append(
                            f"{sp}.{axis}_threshold_reasoning: an unratified threshold must "
                            f"record why it was chosen")

        dep = e.get("depends_on")
        if dep is None:
            continue
        if not isinstance(dep, list):
            errors.append(f"{p}.depends_on: expected list, got {type(dep).__name__}")
            continue
        for j, d in enumerate(dep):
            dp = f"{p}.depends_on[{j}]"
            if not isinstance(d, dict):
                errors.append(f"{dp}: expected mapping, got {type(d).__name__}")
                continue
            up = _typed(d, "upstream", str, dp, errors)
            gate = _typed(d, "gate", str, dp, errors)
            ev = _typed(d, "evidence", str, dp, errors)
            if gate is not None and gate not in VALID_GATES:
                errors.append(f"{dp}.gate: {gate!r} not one of {VALID_GATES}")
            if ev is not None and not ev.strip():
                errors.append(f"{dp}.evidence: empty. An edge without evidence must be dropped.")
            if up is not None and up not in entry_names and up not in external:
                errors.append(
                    f"{dp}.upstream: {up!r} is neither a manifest entry nor listed in "
                    f"external_dependencies")
    return errors


def n_axes(m):
    return sum(1 for e in m["artifacts"] for a in AXES
               if (e.get("sufficiency") or {}).get(a + "_covered"))


def load_manifest(path: Path):
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


# ---------------------------------------------------------------------------------------
# resolution
# ---------------------------------------------------------------------------------------

def resolve_binds(manifest, ta_slug, registry_row):
    facts = manifest["ta_facts"].get(ta_slug)
    if facts is None:
        raise ManifestError(
            f"no ta_facts entry for {ta_slug!r}. Applicability cannot be evaluated without it, "
            f"and guessing is how this class of bug started. Add the TA to ta_facts.")
    values = {}
    for bind_name, spec in manifest["binds"].items():
        if spec.get("from") == "registry":
            values[bind_name] = registry_row.get(spec["column"])
        else:
            values[bind_name] = facts.get(spec["key"])
    return values


def evaluate_applicability(entry, manifest, ta_slug):
    app = entry.get("applicability") or {}
    if app.get("unconditional"):
        return True, "unconditional"
    pred = app["applies_when"]
    actual = manifest["ta_facts"][ta_slug][pred["fact"]]
    expected = pred["equals"]
    if actual == expected:
        return True, f"{pred['fact']} == {expected!r}"
    return False, f"{pred['fact']} is {actual!r}, not {expected!r}"


# ---------------------------------------------------------------------------------------
# measurement
# ---------------------------------------------------------------------------------------

class Reader:
    """A read-only cursor. Refuses anything that is not a single SELECT/WITH."""

    def __init__(self, dsn):
        import psycopg2
        import psycopg2.extras
        self._conn = psycopg2.connect(dsn)
        self._conn.set_session(readonly=True, autocommit=True)
        self._dict = psycopg2.extras.RealDictCursor

    def one(self, sql, params=None):
        if not _READ_ONLY_HEAD.match(sql):
            raise ValueError("refusing a query that is not a SELECT/WITH")
        if ";" in sql.rstrip().rstrip(";"):
            raise ValueError("refusing a query containing multiple statements")
        with self._conn.cursor(cursor_factory=self._dict) as cur:
            cur.execute(sql, params or {})
            row = cur.fetchone()
        return dict(row) if row else None

    def close(self):
        self._conn.close()


def run_count(sql, reader, binds, nullable=()):
    """-> (count|None, error|None). None is UNKNOWN; it is never coerced to 0.

    A bind declared `nullable: true` in the manifest may legitimately be NULL -- that is how a
    query says "no contracted cut for this TA, so count the whole population". An UNDECLARED
    null bind is still UNKNOWN: silently substituting NULL would change what is counted.
    """
    missing = [b for b in set(_BIND.findall(sql))
               if binds.get(b) is None and b not in nullable]
    if missing:
        return None, f"bind(s) unresolved for this TA: {', '.join(sorted(missing))}"
    try:
        row = reader.one(_BIND.sub(lambda mo: f"%({mo.group(1)})s", sql), binds)
    except Exception as exc:  # noqa: BLE001 -- any failure is UNKNOWN, never 0
        return None, f"{type(exc).__name__}: {str(exc).strip().splitlines()[0]}"
    if not row:
        return None, "query returned no row"
    value = next(iter(row.values()))
    return (None, "query returned NULL") if value is None else (int(value), None)


def measure(entry, reader, binds, nullable=()):
    sql = entry.get("coverage_query")
    if sql is None:
        return None, entry.get("coverage_query_reason") or "no coverage_query"
    if entry.get("coverage_query_unsafe"):
        return None, "coverage_query_unsafe: the manifest declares this bind cannot resolve"
    return run_count(sql, reader, binds, nullable)


def nullable_binds(manifest):
    return {b for b, spec in manifest["binds"].items() if spec.get("nullable")}


def measure_sufficiency(entry, manifest, ta_slug, reader, binds):
    """-> ({axis: {...}}|None, error|None). A zero denominator is UNKNOWN, never a pass.

    An axis may carry its own `<axis>_applies_when` predicate, evaluated against ta_facts
    exactly like entry applicability. When it does not hold the axis is still MEASURED and
    REPORTED, but carries no threshold, so it can never produce INSUFFICIENT. The axis is not
    deleted: a ratio with no agreed target is still a fact worth printing.
    """
    s = entry.get("sufficiency")
    if not s:
        return None, None
    nullable = nullable_binds(manifest)
    facts = manifest["ta_facts"][ta_slug]
    out = {}
    for axis in AXES:
        cq, eq = s.get(f"{axis}_covered"), s.get(f"{axis}_eligible")
        if not (cq and eq):
            continue
        gate, gated_reason = s.get(f"{axis}_applies_when"), None
        if gate:
            actual, expected = facts.get(gate["fact"]), gate["equals"]
            if actual != expected:
                gated_reason = f"{gate['fact']} is {actual!r}, not {expected!r}"
        covered, err = run_count(cq, reader, binds, nullable)
        if err:
            return None, f"{axis}_covered: {err}"
        eligible, err = run_count(eq, reader, binds, nullable)
        if err:
            return None, f"{axis}_eligible: {err}"
        if eligible == 0:
            return None, (f"{axis}_eligible population is 0 -- the ratio is undefined, so this "
                          f"cannot be called covered")
        th = None if gated_reason else s.get(f"{axis}_threshold")
        out[axis] = {
            "covered": covered, "eligible": eligible, "ratio": covered / eligible,
            "threshold": None if th is None else float(th),
            "ratified": bool(s.get(f"{axis}_ratified", False)),
            "basis": s.get(f"{axis}_basis"),
            "gated_off": gated_reason,
        }
    return (out or None), None


def format_axis(axis, v):
    if v["threshold"] is None:
        why = f"not applicable: {v['gated_off']}" if v.get("gated_off") else "no threshold"
        return f"{axis} {v['covered']:,}/{v['eligible']:,} = {v['ratio']:.3f} ({why})"
    verdict = "FAILED" if v["ratio"] < v["threshold"] else "ok"
    op = "<" if v["ratio"] < v["threshold"] else ">="
    return (f"{axis} {v['covered']:,}/{v['eligible']:,} = {v['ratio']:.3f} "
            f"{op} {v['threshold']:.2f} {verdict}")


def assess(entry, manifest, ta_slug, reader, binds, ref_binds):
    sem = manifest["classification_semantics"][entry["classification"]]
    res = {
        "name": entry["name"], "kind": entry.get("kind"),
        "target": entry.get("target_table") or entry.get("target_object"),
        "classification": entry["classification"], "plan_group": sem.get("plan_group"),
        "producer": entry.get("producer"), "runs_in": entry.get("runs_in"),
        "depends_on": [d["upstream"] for d in (entry.get("depends_on") or [])],
        "count": None, "reference_count": None, "sufficiency": None, "failed_axes": [],
        "reason": None, "notes": [],
    }
    for exc in entry.get("exceptions") or []:
        if exc.get("ta") == ta_slug:
            res["notes"].append(f"MANIFEST EXCEPTION [{exc.get('expect')}]: {exc.get('reason')}")
    if entry.get("sufficiency_absent_reason"):
        res["notes"].append(f"no sufficiency test: {entry['sufficiency_absent_reason']}")

    applies, why = evaluate_applicability(entry, manifest, ta_slug)
    if not applies:
        res.update(state=NA, reason=f"not applicable: {why}")
    elif entry.get("kind") == "schema_gap":
        exists = ta_slug in (entry.get("exists_for")
                             or (entry.get("status_2026_08_31") or {}).get("exists_for") or [])
        res.update(state=SATISFIED if exists else GAP,
                   reason="object exists for this TA" if exists
                   else "no such object for this TA; a new object is required, not new rows")
    else:
        # MEASURABILITY IS DECIDED BEFORE ELIGIBILITY. An entry that cannot be measured is
        # UNKNOWN even when its classification would otherwise excuse a zero.
        count, err = measure(entry, reader, binds, nullable_binds(manifest))
        res["count"] = count
        if count is None:
            res.update(state=UNKNOWN, reason=err)
        elif not sem.get("gap_eligible", True):
            res.update(state=NA,
                       reason=f"not gap-eligible: {sem.get('na_reason', entry['classification'])}"
                              f" ({count:,} rows)")
        elif count == 0:
            res.update(state=GAP, reason="0 rows")
        else:
            suf, serr = measure_sufficiency(entry, manifest, ta_slug, reader, binds)
            res["sufficiency"] = suf
            if serr:
                res.update(state=UNKNOWN, reason=serr)
            elif suf:
                # INSUFFICIENT fires on EITHER axis. Both ratios are always reported, so
                # "finished its queue, covers a tenth of the board" reads as that sentence.
                failed = [a for a, v in suf.items()
                          if v["threshold"] is not None and v["ratio"] < v["threshold"]]
                res["failed_axes"] = failed
                detail = "; ".join(format_axis(a, suf[a]) for a in AXES if a in suf)
                res.update(state=INSUFFICIENT if failed else SATISFIED, reason=detail)
            else:
                res.update(state=SATISFIED, reason=f"{count:,} rows")

    if ref_binds is not None and res["state"] in (SATISFIED, INSUFFICIENT, GAP) \
            and entry.get("coverage_query"):
        ref_count, _ = measure(entry, reader, ref_binds, nullable_binds(manifest))
        res["reference_count"] = ref_count
        if res["state"] == GAP and ref_count == 0:
            res["notes"].append("absent for the reference TA too -- not specific to this TA")
    return res


# ---------------------------------------------------------------------------------------
# plan
# ---------------------------------------------------------------------------------------

def toposort(names, edges):
    incoming = {n: {d for d in edges.get(n, ()) if d in names} for n in names}
    ordered, ready = [], sorted(n for n in names if not incoming[n])
    while ready:
        n = ready.pop(0)
        ordered.append(n)
        newly = [m for m in names
                 if n in incoming[m] and (incoming[m].discard(n) or not incoming[m])]
        ready = sorted(ready + newly)
    stuck = [n for n in names if n not in ordered]
    return ordered, sorted((n, d) for n in stuck for d in incoming[n] if d in stuck)


def build_plan(results, manifest):
    entry_names = {r["name"] for r in results}
    external = set(manifest.get("external_dependencies") or [])
    dangling = sorted({d for r in results for d in r["depends_on"]
                       if d not in entry_names and d not in external})

    actionable = [r for r in results if r["state"] in (GAP, INSUFFICIENT)]
    names = {r["name"] for r in actionable}
    edges = {r["name"]: [d for d in r["depends_on"] if d in names] for r in actionable}
    ordered, cycles = toposort(names, edges)
    if cycles:
        return {"refused": True, "cycles": cycles}, dangling

    rank = {n: i for i, n in enumerate(ordered)}
    groups = defaultdict(list)
    for r in sorted(actionable, key=lambda r: rank[r["name"]]):
        unmet = sorted(d for d in r["depends_on"]
                       if d in names or (d not in entry_names and d not in external))
        group = (INSUFFICIENT if r["state"] == INSUFFICIENT
                 else (r["plan_group"] or "NEEDS_DECISION"))
        groups[group].append({**r, "unmet_dependencies": unmet})
    order = list(manifest["plan_group_order"])
    if INSUFFICIENT not in order:
        order.append(INSUFFICIENT)
    return {"refused": False, "groups": {g: groups[g] for g in order if groups[g]}}, dangling


# ---------------------------------------------------------------------------------------
# rendering
# ---------------------------------------------------------------------------------------

def producer_command(p, object_kind=None):
    if not p:
        return (f"(a {object_kind} -- no producer of its own; it follows its dependencies)"
                if object_kind else "(no producer -- must be supplied by hand)")
    if p.get("script"):
        return " ".join(["python", p["script"]] + [str(f) for f in (p.get("flags") or [])])
    for k, tmpl in (("library", "library: {}"), ("sql", "hand-run SQL: {}")):
        if p.get(k):
            return tmpl.format(p[k])
    if p.get("function"):
        return f"db function: {p['function']} (invoked by {p.get('invoked_by')})"
    return "(producer recorded without a runnable form)"


def render_text(report):
    ta, meta = report["ta"], report["manifest_meta"]
    counts, results, out = report["counts"], report["results"], []
    ref, w = meta.get("reference_ta"), 90

    out += ["=" * w, f"TA COMPLETENESS -- {ta}",
            f"manifest {report['manifest']} (rev {meta.get('revision')})  |  reference TA: {ref}",
            f"measured {report['measured_at']}  |  READ-ONLY: no producer run, no write, "
            f"no billed job",
            f"schema gate: PASSED ({report['entries_validated']} entries)", "=" * w, ""]
    out += ["  " + "    ".join(f"{s} {counts[s]:>3}" for s in STATE_ORDER)
            + f"     (entries: {len(results)})", ""]

    if counts[UNKNOWN]:
        n = counts[UNKNOWN]
        out += [f"  {ta} CANNOT BE REPORTED COMPLETE: {n} entr{'y' if n == 1 else 'ies'} "
                f"could not be measured.",
                "  An UNKNOWN is not a zero and not a pass. Resolve them before reading the rest.",
                ""]
    elif not counts[GAP] and not counts[INSUFFICIENT]:
        out += ["  No gaps, nothing under-covered, nothing unmeasured.", ""]

    for state in STATE_ORDER:
        rows = [r for r in results if r["state"] == state]
        if not rows:
            continue
        out += ["-" * w, f"{state}  ({len(rows)})", "-" * w]
        for r in sorted(rows, key=lambda r: r["name"]):
            rc = "" if r["reference_count"] is None else f"   [{ref}: {r['reference_count']:,}]"
            out.append(f"  {r['name']:<28} {r['classification']:<22} {r['reason']}{rc}")
            for n in r["notes"]:
                out.append(f"      -> {n}")
        out.append("")

    plan = report["plan"]
    out += ["=" * w, f"PLAN -- {ta}", "=" * w, ""]
    if report["dangling_dependencies"]:
        out += ["  DEPENDS_ON TARGETS THAT ARE NEITHER ENTRIES NOR DECLARED EXTERNAL:",
                *[f"    - {d}" for d in report["dangling_dependencies"]],
                "  These are manifest defects; the ordering below cannot account for them.", ""]
    if plan.get("refused"):
        out += ["  REFUSED -- depends_on contains a cycle. No ordering exists.",
                *[f"    {a} -> {b}" for a, b in plan["cycles"]], ""]
        return "\n".join(out)
    if not plan["groups"]:
        out += ["  Nothing to plan.", ""]

    for group, steps in plan["groups"].items():
        out += [f"### {group}  ({len(steps)} step{'s' if len(steps) != 1 else ''})", ""]
        if group == "BILLED":
            out += ["  Commands are PRINTED, NEVER RUN. Each costs money per invocation.", ""]
        if group == "SCHEMA_GAP":
            out += ["  Cannot be planned: a new TA needs a NEW OBJECT, not new rows.", ""]
        if group == INSUFFICIENT:
            out += ["  The artifact EXISTS and the producer RAN. The eligible population is not",
                    "  covered. Re-running is a top-up, not a build.", ""]
        for i, s in enumerate(steps, 1):
            out.append(f"  {i}. {s['name']}   [{s['classification']}]")
            out.append(f"       target      {s['target']}")
            if group == "SCHEMA_GAP":
                out.append(f"       create      {s.get('to_create_for_a_new_ta', '(unspecified)')}")
                for row in s.get("allowlist_rows") or []:
                    out.append(f"       allowlist   {row}")
            elif group == "FOUNDER_GATED":
                out.append(f"       supply      {s.get('supplied_by', 'a human')}")
                for c in s.get("consumers") or []:
                    out.append(f"       consumer    [{c.get('on_missing')}] {c.get('consumer')}")
                    out.append(f"                   evidence: {c.get('evidence')}")
                if not (s.get("consumers") or []):
                    out.append("       consumer    NONE FOUND -- establish what would read it "
                               "before curating content for it")
            else:
                out.append(f"       run         "
                           f"{producer_command(s['producer'], s.get('object_kind'))}")
                out.append(f"       runs_in     {s.get('runs_in')}")
            suf = s.get("sufficiency") or {}
            for axis in AXES:
                v = suf.get(axis)
                if not v:
                    continue
                mark = "FAILED ->" if axis in (s.get("failed_axes") or []) else "         "
                flag = "" if v["ratified"] else "  (threshold PROPOSED, not ratified)"
                th = "none" if v["threshold"] is None else f"{v['threshold']:.2f}"
                out.append(f"    {mark} {axis:<10} {v['covered']:,}/{v['eligible']:,} "
                           f"= {v['ratio']:.3f}   threshold {th}{flag}")
                if v.get("basis"):
                    out.append(f"                  denominator: {v['basis']}")
            if group != "SCHEMA_GAP":
                cur = 0 if s["count"] is None else s["count"]
                rc = "?" if s["reference_count"] is None else f"{s['reference_count']:,}"
                out.append(f"       counts      {ta}: {cur:,}   |   {ref}: {rc}")
            out.append(f"       unmet deps  {', '.join(s['unmet_dependencies']) or 'none'}")
            for n in s["notes"]:
                out.append(f"       note        {n}")
            out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ta", help="therapeutic area slug (no default, deliberately)")
    ap.add_argument("--plan-out", metavar="PATH", help="write the plan file")
    ap.add_argument("--format", choices=("text", "json"), default="text")
    ap.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    ap.add_argument("--validate-manifest", action="store_true",
                    help="run the schema gate and exit; touches no database")
    args = ap.parse_args()

    try:
        manifest = load_manifest(Path(args.manifest))
    except Exception as exc:  # noqa: BLE001
        print(f"MANIFEST UNREADABLE: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2

    # THE GATE RUNS BEFORE EVERY MEASUREMENT PASS. It cannot be skipped.
    errors = validate_manifest(manifest)
    n_entries = (len(manifest["artifacts"])
                 if isinstance(manifest, dict) and isinstance(manifest.get("artifacts"), list)
                 else 0)
    if errors:
        print(f"MANIFEST SCHEMA GATE FAILED -- {len(errors)} error"
              f"{'s' if len(errors) != 1 else ''}:", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        print("\nNo measurement was attempted. Fix the manifest first.", file=sys.stderr)
        return 2
    if args.validate_manifest:
        print(f"MANIFEST SCHEMA GATE PASSED -- {n_entries} entries, "
              f"{sum(len(e.get('depends_on') or []) for e in manifest['artifacts'])} edges, "
              f"{n_axes(manifest)} sufficiency axes")
        return 0

    if not args.ta:
        print("--ta is required (no default, deliberately)", file=sys.stderr)
        return 2

    try:
        from dotenv import load_dotenv
        load_dotenv(REPO_ROOT / ".env")
    except ImportError:
        pass
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL is not set.", file=sys.stderr)
        return 2

    reg = manifest["registry"]
    reader = Reader(dsn)
    try:
        sql = (f"select {reg['id_column']} as {reg['id_column']}, "
               f"{reg['slug_column']} as {reg['slug_column']} "
               f"from {reg['table']} where {reg['slug_column']} = %(slug)s")
        row = reader.one(sql, {"slug": args.ta})
        if not row:
            print(f"no registry row for {args.ta!r} in {reg['table']}", file=sys.stderr)
            return 2
        ref_slug = manifest["meta"].get("reference_ta")
        ref_row = reader.one(sql, {"slug": ref_slug}) if ref_slug else None
        binds = resolve_binds(manifest, args.ta, row)
        ref_binds = (resolve_binds(manifest, ref_slug, ref_row)
                     if ref_row and ref_slug != args.ta else None)
        results = [assess(e, manifest, args.ta, reader, binds, ref_binds)
                   for e in manifest["artifacts"]]
    except ManifestError as exc:
        print(f"MANIFEST ERROR: {exc}", file=sys.stderr)
        return 2
    finally:
        reader.close()

    by_name = {e["name"]: e for e in manifest["artifacts"]}
    for r in results:
        src = by_name[r["name"]]
        for k in ("supplied_by", "consumers", "to_create_for_a_new_ta", "allowlist_rows",
                  "object_kind"):
            if k in src:
                r[k] = src[k]

    plan, dangling = build_plan(results, manifest)
    counts = {s: sum(1 for r in results if r["state"] == s) for s in STATE_ORDER}
    report = {
        "ta": args.ta,
        "manifest": os.path.relpath(args.manifest, REPO_ROOT).replace("\\", "/"),
        "manifest_meta": manifest["meta"], "entries_validated": n_entries,
        "measured_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "read_only": True,
        "complete": counts[GAP] == 0 and counts[UNKNOWN] == 0 and counts[INSUFFICIENT] == 0,
        "completeness_reportable": counts[UNKNOWN] == 0,
        "counts": counts, "results": results, "plan": plan,
        "dangling_dependencies": dangling,
    }
    rendered = (json.dumps(report, indent=2, default=str) if args.format == "json"
                else render_text(report))
    if args.plan_out:
        Path(args.plan_out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.plan_out).write_text(rendered, encoding="utf-8")
    print(rendered)
    return 1 if (counts[GAP] or counts[UNKNOWN] or counts[INSUFFICIENT]) else 0


if __name__ == "__main__":
    sys.exit(main())
