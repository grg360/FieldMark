"""Behavioural tests for scripts/ta_run.py.

Runs with pytest, or standalone:  python tests/test_ta_run.py

No database. A stub reader stands in for one, so the halt behaviour can be proved without
touching the live schema and without running a real producer against it. The producer IS real
-- tests/fixtures/noop_producer.py, a subprocess that exits 0 and writes nothing.
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import ta_completeness as tc  # noqa: E402
import ta_run as tr  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"


class StubReader:
    """Always reports an empty target. The producer cannot change that -- which is the point."""

    def __init__(self):
        self.queries = 0

    def one(self, sql, params=None):
        self.queries += 1
        return {"count": 0}

    def close(self):
        pass


class SilentLog(tr.Log):
    def __init__(self):
        self.path = None
        self.lines = []

    def emit(self, text=""):
        for line in str(text).splitlines() or [""]:
            self.lines.append(line)

    @property
    def text(self):
        return "\n".join(self.lines)


def _run_fixture(execute=True):
    m = tc.load_manifest(FIXTURES / "manifest_noop_producer.yaml")
    assert not tc.validate_manifest(m), "the fixture manifest must itself be valid"
    log = SilentLog()
    code, outcomes = tr.run_plan(m, "alpha", StubReader(), {"ta_id": "00000000"}, None,
                                 execute, log, cwd=REPO_ROOT)
    return code, outcomes, log


def test_producer_exiting_zero_without_writing_is_SHORT_and_halts():
    """ACCEPTANCE 3. Exit status is not evidence; the target table is.

    a_noop's producer exits 0 and writes nothing, so the after-measurement still reads 0 rows.
    That is SHORT, and SHORT stops the run -- b_never_reached must never be attempted.
    """
    code, outcomes, log = _run_fixture(execute=True)

    assert outcomes, "the runner attempted nothing"
    names = [n for n, _ in outcomes]
    verdicts = dict(outcomes)

    assert verdicts.get("a_noop") == tr.SHORT, \
        f"expected SHORT for a producer that wrote nothing, got {verdicts.get('a_noop')!r}"
    assert "b_never_reached" not in names, \
        f"the runner continued past a SHORT step; it reached {names}"
    assert code != 0, "a run that ended SHORT must not exit 0"
    assert "STOPPING" in log.text, "the runner did not say it was stopping"
    assert "exited 0 and wrote nothing" in log.text, \
        "the log does not explain that exit status is not evidence"


def test_dry_run_executes_nothing():
    code, outcomes, log = _run_fixture(execute=False)
    assert all(v == "DRY" for _, v in outcomes), f"dry run produced verdicts {outcomes}"
    assert "DRY RUN" in log.text
    assert code == 0


def test_before_and_after_measurements_are_both_logged():
    _, _, log = _run_fixture(execute=True)
    assert "  before " in log.text, "no before-measurement logged"
    assert "  after " in log.text, "no after-measurement logged"
    assert "  command " in log.text, "the producer command line was not logged"
    assert "  rows " in log.text, "the row delta was not logged"


def test_runner_refuses_when_an_entry_is_unknown():
    """A TA that cannot be measured cannot be run."""
    m = tc.load_manifest(FIXTURES / "manifest_noop_producer.yaml")
    m["artifacts"][0]["coverage_query_unsafe"] = True   # forces UNKNOWN
    log = SilentLog()
    code, outcomes = tr.run_plan(m, "alpha", StubReader(), {"ta_id": "0"}, None, True, log,
                                 cwd=REPO_ROOT)
    assert code == 2 and not outcomes
    assert "REFUSED" in log.text and "UNKNOWN" in log.text


def test_runner_refuses_on_a_dependency_cycle():
    m = tc.load_manifest(FIXTURES / "manifest_noop_producer.yaml")
    by = {e["name"]: e for e in m["artifacts"]}
    by["a_noop"]["depends_on"] = [{"upstream": "b_never_reached", "gate": "hard_fail",
                                   "evidence": "fixture"}]
    by["b_never_reached"]["depends_on"] = [{"upstream": "a_noop", "gate": "hard_fail",
                                            "evidence": "fixture"}]
    log = SilentLog()
    code, outcomes = tr.run_plan(m, "alpha", StubReader(), {"ta_id": "0"}, None, True, log,
                                 cwd=REPO_ROOT)
    assert code == 2 and not outcomes
    assert "cycle" in log.text.lower()


def test_there_is_no_allow_billed_flag():
    """It must never become possible to spend money from this runner."""
    src = Path(tr.__file__).read_text(encoding="utf-8")
    code_only = "\n".join(l.split("#")[0] for l in src.splitlines())
    assert "add_argument(\"--allow-billed\"" not in code_only
    assert "allow_billed" not in code_only


def test_runner_holds_no_domain_knowledge():
    """Same hard constraint as the checker, asserted rather than trusted."""
    import re
    src = Path(tr.__file__).read_text(encoding="utf-8")
    code = "\n".join(l.split("#")[0] for l in src.splitlines())
    m = tc.load_manifest(tc.DEFAULT_MANIFEST)
    for slug in m["ta_facts"]:
        assert slug not in code, f"runner hard-codes the TA slug {slug!r}"
    for e in m["artifacts"]:
        t = e.get("target_table")
        if t:
            assert t not in code, f"runner hard-codes the table {t!r}"
        prod = e.get("producer") or {}
        if prod.get("script"):
            assert prod["script"] not in code, f"runner hard-codes producer {prod['script']!r}"
    assert not re.search(r"[=<>]\s*0\.\d", code), "runner hard-codes a numeric threshold"


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
