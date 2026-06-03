/* Create hcp_research_themes_v2 table for storing NSCLC theme extraction output */

CREATE TABLE IF NOT EXISTS public.hcp_research_themes_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id uuid NOT NULL REFERENCES public.hcps_v2(id) ON DELETE CASCADE,
  theme_name text NOT NULL,
  centrality text NOT NULL CHECK (centrality IN ('core', 'supporting', 'peripheral')),
  paper_count integer NOT NULL DEFAULT 0,
  display_rank integer,
  example_pmids text[],
  therapeutic_area text NOT NULL DEFAULT 'NSCLC',
  extracted_at timestamp with time zone NOT NULL DEFAULT now(),
  extraction_run_id uuid NOT NULL
);

/* Index for fast HCP-level lookups (most common query: get themes for one HCP) */
CREATE INDEX IF NOT EXISTS idx_hcp_research_themes_v2_hcp_id ON public.hcp_research_themes_v2 (hcp_id);

/* Partial index for display-rank queries (UI only reads top 6 themes) */
CREATE INDEX IF NOT EXISTS idx_hcp_research_themes_v2_display_rank ON public.hcp_research_themes_v2 (hcp_id, display_rank) WHERE display_rank IS NOT NULL;

/* Index for extraction run tracking (allows finding all themes from a specific run) */
CREATE INDEX IF NOT EXISTS idx_hcp_research_themes_v2_extraction_run ON public.hcp_research_themes_v2 (extraction_run_id);
