"""Schema-gate regression tests for scripts/ta_completeness.py.

Runs with pytest, or standalone:  python tests/test_ta_completeness_manifest.py

No database. These assert the STRUCTURE of the manifest and the behaviour of the gate.
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import ta_completeness as tc  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def test_bare_on_key_is_rejected():
    """THE REGRESSION. A bare `on:` key parses to boolean True; the gate must catch it.

    This shipped once: all 59 depends_on edges in manifest r2 parsed as {True: <name>}, so
    the dependency graph read as empty while looking correct in the file.
    """
    m = tc.load_manifest(FIXTURES / "manifest_bare_on_key.yaml")
    errors = tc.validate_manifest(m)
    assert errors, "the gate accepted a manifest whose edge keys parsed to booleans"

    key_errors = [e for e in errors if "parsed as bool" in e]
    assert key_errors, f"no non-string-key error was raised; got: {errors}"
    assert any("depends_on" in e for e in key_errors), \
        f"the error did not point at the depends_on edge: {key_errors}"

    # And the consequence is reported too: the edge has no readable upstream.
    assert any("missing required field 'upstream'" in e for e in errors), \
        f"the gate did not report the unreadable edge: {errors}"


def test_real_manifest_passes_the_gate():
    m = tc.load_manifest(tc.DEFAULT_MANIFEST)
    errors = tc.validate_manifest(m)
    assert not errors, "the live manifest fails its own schema gate:\n  " + "\n  ".join(errors)


def test_every_entry_can_say_when_it_applies():
    m = tc.load_manifest(tc.DEFAULT_MANIFEST)
    for e in m["artifacts"]:
        app = e.get("applicability") or {}
        assert app.get("unconditional") or "applies_when" in app, \
            f"{e['name']}: no evaluable applicability"


def test_every_edge_carries_evidence():
    m = tc.load_manifest(tc.DEFAULT_MANIFEST)
    for e in m["artifacts"]:
        for d in e.get("depends_on") or []:
            assert d.get("evidence", "").strip(), \
                f"{e['name']} -> {d.get('upstream')}: edge without evidence"


def test_coverage_denominator_is_never_the_throughput_denominator_by_accident():
    """Where both axes share a denominator it must be stated, not silent."""
    m = tc.load_manifest(tc.DEFAULT_MANIFEST)
    for e in m["artifacts"]:
        s = e.get("sufficiency") or {}
        if s.get("throughput_eligible") and s.get("coverage_eligible"):
            if " ".join(s["throughput_eligible"].split()) ==                     " ".join(s["coverage_eligible"].split()):
                blob = (str(s.get("throughput_basis", "")) +
                        str(s.get("coverage_threshold_reasoning", ""))).lower()
                assert "coincide" in blob or "identical" in blob,                     f"{e['name']}: both axes share a denominator without saying so"


def test_sufficiency_queries_are_self_contained():
    """No sufficiency query may reference another TA; coverage may not be capped."""
    m = tc.load_manifest(tc.DEFAULT_MANIFEST)
    slugs = [s for s in m["ta_facts"]]
    for e in m["artifacts"]:
        s = e.get("sufficiency")
        if not s:
            continue
        for field in [f"{a}_{h}" for a in tc.AXES for h in ("covered", "eligible")
                      if f"{a}_{h}" in s]:
            q = s[field].lower()
            for slug in slugs:
                assert slug.lower() not in q, \
                    f"{e['name']}.{field}: hard-codes the TA slug {slug!r}"
            if field.startswith("coverage_"):
                # The coverage axis is the UNCAPPED population by definition. The throughput
                # axis is allowed a cap -- there the cap IS the queue being measured.
                assert "limit " not in q and "least(" not in q, \
                    f"{e['name']}.{field}: a coverage denominator must be uncapped"
        for axis in tc.AXES:
            th = s.get(f"{axis}_threshold")
            if th is not None:
                assert 0 < float(th) <= 1, f"{e['name']}.{axis}_threshold out of range"


def test_thresholds_are_marked_unratified_until_a_human_says_otherwise():
    m = tc.load_manifest(tc.DEFAULT_MANIFEST)
    for e in m["artifacts"]:
        s = e.get("sufficiency")
        if not s:
            continue
        for axis in tc.AXES:
            if f"{axis}_threshold" in s and not s.get(f"{axis}_ratified", False):
                assert str(s.get(f"{axis}_threshold_reasoning", "")).strip(), \
                    f"{e['name']}.{axis}: unratified threshold with no reasoning recorded"


def test_checker_holds_no_domain_knowledge():
    """The hard constraint, asserted rather than trusted."""
    import re
    src = Path(tc.__file__).read_text(encoding="utf-8")
    code = "\n".join(l.split("#")[0] for l in src.splitlines())
    m = tc.load_manifest(tc.DEFAULT_MANIFEST)
    for slug in m["ta_facts"]:
        assert slug not in code, f"checker hard-codes the TA slug {slug!r}"
    for e in m["artifacts"]:
        t = e.get("target_table")
        if t:
            assert t not in code, f"checker hard-codes the table {t!r}"
    assert not re.search(r"threshold\s*[=<>]\s*0\.\d", code), \
        "checker hard-codes a numeric threshold"


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS  {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL  {name}\n      {exc}")
    print(f"\n{'ALL PASS' if not failures else str(failures) + ' FAILED'}")
    sys.exit(1 if failures else 0)
