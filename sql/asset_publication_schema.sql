-- Drug Intelligence — derived asset↔publication match table (Stage 2 foundation).
--
-- The vocabulary is the file (config/assets.json, source of record). This table
-- is DERIVED from it by scripts/assets/build_asset_matches.py — the matching is
-- too expensive to run at query time (the all-assets query times out as one
-- statement), and the asset page needs fast "papers on asset X". Same pattern as
-- the theme tables: config -> job -> _v1 table, rebuilt on reingest.
--
-- One edge per (publication, asset); matched_via records how it was found
-- (name > code > brand priority, so the strongest signal wins). Read-only:
-- RLS on, public SELECT, no write grants (the build job connects as owner).

BEGIN;

CREATE TABLE IF NOT EXISTS public.asset_publication_v1 (
  publication_id uuid NOT NULL REFERENCES public.publications_v2(id),
  asset_generic  text NOT NULL,            -- the asset key, = config generic
  matched_via    text NOT NULL CHECK (matched_via IN ('name','brand','code')),
  match_term     text NOT NULL,            -- the specific term that matched
  built_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (publication_id, asset_generic)
);
CREATE INDEX IF NOT EXISTS idx_asset_pub_asset ON public.asset_publication_v1(asset_generic);

-- Per-asset distinct mention count for the asset index (leads with non-backbone).
-- A plain view — cheap over the indexed edge table, always current with the build.
CREATE OR REPLACE VIEW public.asset_mention_v1 AS
  SELECT asset_generic, count(*) AS publication_count
  FROM public.asset_publication_v1
  GROUP BY asset_generic;

ALTER TABLE public.asset_publication_v1 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asset_publication_v1_read ON public.asset_publication_v1;
CREATE POLICY asset_publication_v1_read ON public.asset_publication_v1 FOR SELECT USING (true);

GRANT SELECT ON public.asset_publication_v1 TO anon, authenticated, service_role;
GRANT SELECT ON public.asset_mention_v1     TO anon, authenticated, service_role;

COMMIT;
