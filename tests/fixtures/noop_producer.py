"""A producer that succeeds and writes nothing. Exit 0, no side effects.

Stands in for the real failure mode this fixture exists to prove: a pipeline script that
completes cleanly, reports nothing wrong, and leaves the target table exactly as it found it.
Exit status is not evidence; the target table is.
"""
print("noop_producer: pretending to work")
print("noop_producer: done, 0 rows written")
raise SystemExit(0)
