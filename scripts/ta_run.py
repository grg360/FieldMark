#!/usr/bin/env python3
"""ta_run.py -- execute a TA completeness plan, one measured step at a time.

  python scripts/ta_run.py --ta <slug>              # dry run. ALWAYS the default.
  python scripts/ta_run.py --ta <slug> --execute    # actually run automatable producers

THE PLAN IS THE ORDERING; THE MEASUREMENT IS THE AUTHORITY. A plan file is a snapshot and
may be minutes or days old, so every step is re-measured immediately before it runs and again
immediately after. A producer exiting zero is NOT evidence that the artifact exists -- only the
target table is.

WHAT IT WILL NOT DO
  --allow-billed DOES NOT EXIST and must never be added. The runner executes AUTOMATABLE
  producers only. BILLED steps have their command printed and the run stops. FOUNDER_GATED
  steps have their requirement printed and the run stops. SCHEMA_GAP steps cannot be run at
  all. The runner never spends money and never invents content.

REFUSALS, checked before any step runs
  * the manifest fails its own schema gate
  * ANY entry for this TA measures UNKNOWN -- a TA that cannot be measured cannot be run
  * the dependency graph contains a cycle

PER STEP
  1. re-measure. Already SATISFIED -> skip, say so, do not run a producer against a state
     the plan predates.
  2. verify every upstream is SATISFIED NOW. If not, stop. Never reorder around a failed
     dependency.
  3. run the producer only if its plan group is the automatable one.
  4. re-measure against the target table. OK / SHORT / FAILED, the same three the cycle uses:
       OK      the entry now measures SATISFIED
       SHORT   the producer exited 0 but the artifact did not reach SATISFIED -- including
               exiting 0 having written nothing at all
       FAILED  the producer exited non-zero, or could not be launched
  5. SHORT or FAILED -> stop. Do not continue down the plan.

THE HARD CONSTRAINT, same as the checker: no TA slug, table name, producer path or threshold
in this file. Everything comes from the manifest. Asserted by test, not trusted.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ta_completeness as tc  # noqa: E402

REPO_ROOT = tc.REPO_ROOT

OK, SHORT, FAILED, SKIPPED, PRINTED = "OK", "SHORT", "FAILED", "SKIPPED", "PRINTED"

#: Placeholder the manifest writes in producer flags. Structural, not a TA fact.
SLUG_PLACEHOLDER = "<slug>"


class Halt(Exception):
    """A step said stop. Nothing after it is attempted."""


def build_argv(producer, ta_slug):
    """-> argv list, or None when the producer has no runnable script form."""
    if not producer or not producer.get("script"):
        return None
    argv = [sys.executable, str(producer["script"])]
    for flag in producer.get("flags") or []:
        argv.extend(str(flag).replace(SLUG_PLACEHOLDER, ta_slug).split())
    return argv


def spawn(argv, cwd):
    """Default process runner. Replaced in tests."""
    proc = subprocess.run(argv, cwd=str(cwd), capture_output=True, text=True)
    tail = ((proc.stdout or "") + (proc.stderr or "")).strip().splitlines()
    return proc.returncode, "\n".join(tail[-20:])


def automatable_group(manifest):
    """The plan group that may be executed, named by the manifest rather than by this file."""
    return manifest["plan_group_order"][0]


class Log:
    def __init__(self, path, header):
        self.path = path
        self.lines = []
        self.emit(header)

    def emit(self, text=""):
        for line in str(text).splitlines() or [""]:
            self.lines.append(line)
            print(line)

    def flush(self):
        if self.path:
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
            Path(self.path).write_text("\n".join(self.lines) + "\n", encoding="utf-8")


def measure_one(entry, manifest, ta_slug, reader, binds):
    return tc.assess(entry, manifest, ta_slug, reader, binds, None)


def run_plan(manifest, ta_slug, reader, binds, ref_binds, execute, log, spawn_fn=spawn,
             cwd=REPO_ROOT):
    by_name = {e["name"]: e for e in manifest["artifacts"]}
    results = [tc.assess(e, manifest, ta_slug, reader, binds, ref_binds)
               for e in manifest["artifacts"]]
    state_of = {r["name"]: r["state"] for r in results}

    # ---- refusals -----------------------------------------------------------------------
    unknown = [r["name"] for r in results if r["state"] == tc.UNKNOWN]
    if unknown:
        log.emit(f"REFUSED -- {len(unknown)} entr{'y' if len(unknown) == 1 else 'ies'} measure "
                 f"UNKNOWN for {ta_slug}. A TA that cannot be measured cannot be run.")
        for n in unknown:
            log.emit(f"    {n}: {next(r['reason'] for r in results if r['name'] == n)}")
        return 2, []

    plan, dangling = tc.build_plan(results, manifest)
    if plan.get("refused"):
        log.emit("REFUSED -- the dependency graph contains a cycle. No ordering exists.")
        for a, b in plan["cycles"]:
            log.emit(f"    {a} -> {b}")
        return 2, []
    if dangling:
        log.emit("REFUSED -- depends_on targets that are neither entries nor declared external:")
        for d in dangling:
            log.emit(f"    {d}")
        return 2, []

    runnable_group = automatable_group(manifest)
    steps = [(group, s) for group, group_steps in plan["groups"].items() for s in group_steps]
    if not steps:
        log.emit("Nothing to do: no gaps and nothing under-covered.")
        return 0, []

    log.emit(f"{len(steps)} step(s) in the plan. Executable group: {runnable_group}.")
    log.emit(f"Mode: {'EXECUTE' if execute else 'DRY RUN -- nothing will be run'}")
    log.emit("")

    outcomes = []
    would_stop = False
    for n, (group, step) in enumerate(steps, 1):
        name = step["name"]
        entry = by_name[name]
        log.emit("-" * 88)
        log.emit(f"STEP {n}/{len(steps)}  {name}   [{group} / {step['classification']}]")
        log.emit(f"  target        {step['target']}")

        # ---- 1. re-measure before ------------------------------------------------------
        before = measure_one(entry, manifest, ta_slug, reader, binds)
        log.emit(f"  before        {before['state']}: {before['reason']}")
        if before["state"] == tc.SATISFIED:
            log.emit("  -> SKIPPED. Already satisfied; the plan predates this state.")
            outcomes.append((name, SKIPPED))
            continue
        if before["state"] == tc.UNKNOWN:
            log.emit(f"  -> FAILED. Cannot measure this entry: {before['reason']}")
            outcomes.append((name, FAILED))
            log.emit("  STOPPING.")
            break

        # ---- 2. upstreams --------------------------------------------------------------
        unmet = []
        for dep in entry.get("depends_on") or []:
            up = dep["upstream"]
            if up not in by_name:
                continue  # declared external; validated by the schema gate
            fresh = measure_one(by_name[up], manifest, ta_slug, reader, binds)
            state_of[up] = fresh["state"]
            if fresh["state"] != tc.SATISFIED:
                unmet.append((up, fresh["state"], dep.get("gate")))
        if unmet:
            for up, st, gate in unmet:
                log.emit(f"  upstream      {up}: {st}  (gate: {gate})")
            if execute:
                log.emit("  -> STOPPING. Will not run past an unsatisfied dependency, and will "
                         "not reorder around it.")
                outcomes.append((name, FAILED))
                break
            log.emit("  -> execution WOULD STOP here: unsatisfied dependency.")
            would_stop = True
        else:
            log.emit("  upstreams     all SATISFIED")

        # ---- 3. run, or print and stop --------------------------------------------------
        # The DISPLAY group may be INSUFFICIENT while the entry's own classification decides
        # what kind of thing it is -- a billed stage that is under-covered is still billed.
        cls_group = manifest["classification_semantics"][step["classification"]].get("plan_group")
        if group != runnable_group:
            argv = build_argv(step.get("producer"), ta_slug)
            log.emit(f"  NOT EXECUTABLE -- group {group} (classification group: {cls_group}). "
                     f"The runner stops here.")
            if cls_group == "FOUNDER_GATED":
                log.emit(f"  requires      {entry.get('supplied_by', 'a human')}")
                for c in entry.get("consumers") or []:
                    log.emit(f"  consumer      [{c.get('on_missing')}] {c.get('consumer')}")
                if not (entry.get("consumers") or []):
                    log.emit("  consumer      NONE FOUND -- establish what would read it before "
                             "curating content for it")
            elif cls_group == "SCHEMA_GAP":
                log.emit(f"  create        {entry.get('to_create_for_a_new_ta', '(unspecified)')}")
                for row in entry.get("allowlist_rows") or []:
                    log.emit(f"  allowlist     {row}")
            else:
                log.emit(f"  command       {' '.join(argv) if argv else '(no runnable form)'}")
                if cls_group == "BILLED":
                    log.emit("  This costs money per invocation. Printed, never run. There is no "
                             "--allow-billed flag and there must not be one.")
            outcomes.append((name, PRINTED))
            break

        argv = build_argv(step.get("producer"), ta_slug)
        if not argv:
            # A derived object -- the manifest records its object_kind and no producer, because
            # it follows its dependencies rather than being built. Not runnable, NOT a failure:
            # it fills when its upstreams do, so the run continues past it.
            if entry.get("object_kind"):
                log.emit(f"  -> DERIVED. A {entry['object_kind']} with no producer of its own; "
                         f"it follows {', '.join(step['depends_on']) or 'its dependencies'}. "
                         f"Nothing to run.")
                outcomes.append((name, SKIPPED))
                continue
            # Classified automatable but the manifest records no runnable command -- e.g. a
            # producer described only as a library function invoked by another script. That is
            # a manifest defect, not a producer failure. Under --execute it halts; in a dry run
            # it is annotated so the whole plan stays visible.
            log.emit("  NOT RUNNABLE. Classified automatable, but the manifest records no "
                     "script to run.")
            prod = entry.get("producer") or {}
            for key in ("library", "invoked_by", "function", "sql"):
                if prod.get(key):
                    log.emit(f"  producer.{key}  {prod[key]}")
            if execute:
                log.emit("  -> FAILED. STOPPING.")
                outcomes.append((name, FAILED))
                break
            log.emit("  -> execution WOULD STOP here: no runnable producer.")
            would_stop = True
            outcomes.append((name, "DRY"))
            continue
        log.emit(f"  command       {' '.join(argv)}")

        # An unresolved <placeholder> means the manifest records a flag whose value this runner
        # cannot supply (a snapshot id, a file path). Passing it through literally would run a
        # producer with a nonsense argument, so refuse rather than guess.
        unresolved = sorted({t for t in argv if t.startswith("<") and t.endswith(">")})
        if unresolved:
            log.emit(f"  UNRESOLVED    {', '.join(unresolved)} -- the manifest records flags "
                     f"this runner cannot fill. Refusing to pass them through literally.")
            if execute:
                log.emit("  -> FAILED. STOPPING.")
                outcomes.append((name, FAILED))
                break
            log.emit("  -> execution WOULD STOP here: unresolved producer arguments.")
            would_stop = True
            outcomes.append((name, "DRY"))
            continue

        if not execute:
            log.emit("  -> DRY RUN. Not executed.")
            outcomes.append((name, "DRY"))
            continue

        started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        rc, tail = spawn_fn(argv, cwd)
        log.emit(f"  started       {started}")
        log.emit(f"  exit code     {rc}")
        if tail:
            for line in tail.splitlines():
                log.emit(f"    | {line}")

        # ---- 4. re-measure after --------------------------------------------------------
        after = measure_one(entry, manifest, ta_slug, reader, binds)
        log.emit(f"  after         {after['state']}: {after['reason']}")
        before_n = before["count"] or 0
        after_n = after["count"] or 0
        log.emit(f"  rows          {before_n:,} -> {after_n:,}")

        if rc != 0:
            verdict = FAILED
        elif after["state"] == tc.SATISFIED:
            verdict = OK
        else:
            verdict = SHORT
        log.emit(f"  -> {verdict}")
        outcomes.append((name, verdict))

        if verdict in (SHORT, FAILED):
            if verdict == SHORT and after_n <= before_n:
                log.emit("  The producer exited 0 and wrote nothing. Exit status is not "
                         "evidence; the target table is.")
            log.emit("  STOPPING. Not continuing down the plan.")
            break

    log.emit("-" * 88)
    if would_stop and not execute:
        log.emit("NOTE: in --execute this run would have stopped early (see above).")
    tally = {}
    for _, v in outcomes:
        tally[v] = tally.get(v, 0) + 1
    log.emit("outcome: " + (", ".join(f"{k}={v}" for k, v in sorted(tally.items())) or "none"))
    bad = any(v in (SHORT, FAILED) for _, v in outcomes)
    return (1 if bad else 0), outcomes


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ta", required=True, help="therapeutic area slug (no default, deliberately)")
    ap.add_argument("--execute", action="store_true",
                    help="actually run automatable producers. Absent = dry run, always.")
    ap.add_argument("--manifest", default=str(tc.DEFAULT_MANIFEST))
    ap.add_argument("--log-out", metavar="PATH",
                    help="run log path (default: beside the plan, docs/ta_run_<slug>.log)")
    args = ap.parse_args()

    try:
        manifest = tc.load_manifest(Path(args.manifest))
    except Exception as exc:  # noqa: BLE001
        print(f"MANIFEST UNREADABLE: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2

    errors = tc.validate_manifest(manifest)
    if errors:
        print(f"REFUSED -- the manifest fails its own schema gate ({len(errors)} errors):",
              file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
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

    log_path = args.log_out or (REPO_ROOT / "docs" / f"ta_run_{args.ta}.log")
    reg = manifest["registry"]
    reader = tc.Reader(dsn) if args.execute else tc.Reader(dsn)
    header = (
        "=" * 88 + f"\nTA RUN -- {args.ta}\n"
        f"manifest {os.path.relpath(args.manifest, REPO_ROOT)} "
        f"(rev {manifest['meta'].get('revision')})\n"
        f"started {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}\n"
        f"schema gate: PASSED ({len(manifest['artifacts'])} entries)\n" + "=" * 88)
    log = Log(log_path, header)

    try:
        sql = (f"select {reg['id_column']} as {reg['id_column']}, "
               f"{reg['slug_column']} as {reg['slug_column']} "
               f"from {reg['table']} where {reg['slug_column']} = %(slug)s")
        row = reader.one(sql, {"slug": args.ta})
        if not row:
            log.emit(f"no registry row for {args.ta!r}")
            return 2
        ref_slug = manifest["meta"].get("reference_ta")
        ref_row = reader.one(sql, {"slug": ref_slug}) if ref_slug else None
        binds = tc.resolve_binds(manifest, args.ta, row)
        ref_binds = (tc.resolve_binds(manifest, ref_slug, ref_row)
                     if ref_row and ref_slug != args.ta else None)
        code, _ = run_plan(manifest, args.ta, reader, binds, ref_binds, args.execute, log)
    except tc.ManifestError as exc:
        log.emit(f"MANIFEST ERROR: {exc}")
        code = 2
    finally:
        reader.close()
        log.emit(f"log written to {log_path}")
        log.flush()
    return code


if __name__ == "__main__":
    sys.exit(main())
