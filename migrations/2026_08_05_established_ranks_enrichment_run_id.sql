-- Established ranks provenance (2026-08-05).
--
-- hcp_established_ranks_v3 was the only scoring output with no run id: the
-- recompute script neither minted nor received one (the momentum scorer mints
-- its own uuid4 per run — scientific_momentum_scoring.py:349 — a pattern the
-- established recompute never adopted). Without it, narratives generated from
-- established rows cannot be stamped with the snapshot they read, leaving half
-- of narrative provenance permanently undetectable as stale.
--
-- recompute_established_ranks_v3.py now mints one run id per invocation and
-- writes it to every row it upserts. Rows are NULL until the first patched
-- recompute runs.

ALTER TABLE public.hcp_established_ranks_v3
  ADD COLUMN IF NOT EXISTS enrichment_run_id uuid;

COMMENT ON COLUMN public.hcp_established_ranks_v3.enrichment_run_id IS
  'uuid4 minted per recompute_established_ranks_v3.py invocation; every row written by one run carries the same id. NULL = row predates the 2026-08-05 provenance patch.';
