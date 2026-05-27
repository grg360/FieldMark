-- Migration: create hcp_author_metrics_v2 snapshot table
-- Purpose: time-series storage of OpenAlex author-level metrics (citations, h-index, works count)
-- Read pattern: latest snapshot per HCP via a view; refreshed after each enrichment run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.hcp_author_metrics_v2 (
  hcp_id UUID NOT NULL REFERENCES public.hcps_v2(id) ON DELETE CASCADE,
  openalex_author_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cited_by_count INTEGER,
  works_count INTEGER,
  h_index INTEGER,
  i10_index INTEGER,
  counts_by_year JSONB,
  two_yr_mean_citedness NUMERIC,
  enrichment_run_id UUID,
  fetch_status TEXT,
  fetch_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hcp_id, snapshot_date)
);

COMMENT ON TABLE public.hcp_author_metrics_v2 IS
  'Time-stamped snapshots of OpenAlex author metrics. Primary citation/h-index source for FieldMark. One row per HCP per enrichment run date.';

COMMENT ON COLUMN public.hcp_author_metrics_v2.cited_by_count IS
  'Lifetime citation count from OpenAlex. Source: author.cited_by_count';
COMMENT ON COLUMN public.hcp_author_metrics_v2.works_count IS
  'Lifetime peer-reviewed publication count from OpenAlex. Source: author.works_count';
COMMENT ON COLUMN public.hcp_author_metrics_v2.h_index IS
  'h-index from OpenAlex, computed on the peer-reviewed corpus. Source: author.summary_stats.h_index';
COMMENT ON COLUMN public.hcp_author_metrics_v2.i10_index IS
  'i10-index (publications with 10+ citations) from OpenAlex. Source: author.summary_stats.i10_index';
COMMENT ON COLUMN public.hcp_author_metrics_v2.counts_by_year IS
  'Per-year citation curve from OpenAlex, last 10 years. Source: author.counts_by_year (JSON array of {year, works_count, cited_by_count})';
COMMENT ON COLUMN public.hcp_author_metrics_v2.two_yr_mean_citedness IS
  '2-year mean citedness from OpenAlex. Source: author.summary_stats.2yr_mean_citedness';
COMMENT ON COLUMN public.hcp_author_metrics_v2.fetch_status IS
  'Status of this snapshot fetch: "ok", "not_found" (author ID returned 404), "error" (other failure). NULL means snapshot is valid.';
COMMENT ON COLUMN public.hcp_author_metrics_v2.fetch_error IS
  'Error detail when fetch_status is "error". For debugging failed enrichment runs.';

CREATE INDEX IF NOT EXISTS hcp_author_metrics_v2_hcp_idx
  ON public.hcp_author_metrics_v2 (hcp_id);

CREATE INDEX IF NOT EXISTS hcp_author_metrics_v2_snapshot_idx
  ON public.hcp_author_metrics_v2 (snapshot_date DESC);

CREATE INDEX IF NOT EXISTS hcp_author_metrics_v2_openalex_idx
  ON public.hcp_author_metrics_v2 (openalex_author_id);

CREATE INDEX IF NOT EXISTS hcp_author_metrics_v2_run_idx
  ON public.hcp_author_metrics_v2 (enrichment_run_id);

-- View: latest snapshot per HCP. Used by getRisingStars, getEstablished, getHCPDetail.
CREATE OR REPLACE VIEW public.hcp_author_metrics_latest_v2 AS
SELECT DISTINCT ON (hcp_id)
  hcp_id,
  openalex_author_id,
  snapshot_date,
  cited_by_count,
  works_count,
  h_index,
  i10_index,
  counts_by_year,
  two_yr_mean_citedness,
  enrichment_run_id,
  fetch_status,
  created_at
FROM public.hcp_author_metrics_v2
WHERE fetch_status IS NULL OR fetch_status = 'ok'
ORDER BY hcp_id, snapshot_date DESC;

COMMENT ON VIEW public.hcp_author_metrics_latest_v2 IS
  'Latest valid snapshot per HCP. Excludes rows with fetch_status indicating failure. Read by frontend API functions.';

COMMIT;

-- ROLLBACK (run if migration needs to be reversed):
-- BEGIN;
-- DROP VIEW IF EXISTS public.hcp_author_metrics_latest_v2;
-- DROP TABLE IF EXISTS public.hcp_author_metrics_v2;
-- COMMIT;
