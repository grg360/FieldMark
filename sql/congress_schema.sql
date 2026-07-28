-- Congress calendar — abstract metadata + confirmed-presenter matches.
-- Applied to the live DB 2026-07-27 (see sql/README.md).
--
-- SCOPE / LICENSING: this stores ASCO abstract BIBLIOGRAPHIC METADATA ONLY. The
-- AbstractBody column of the source CSV is copyrighted content under unreviewed
-- terms and is dropped at parse time (usecols) by the loader — there is
-- deliberately NO body column here, so it cannot enter the database, API, or client.
-- Titles, abstract numbers, speaker names, session titles/types, tracks, and
-- presentation times are metadata and are in scope.
--
-- Only presented abstracts are ingested (SessionType <> 'Publication Only').

CREATE TABLE IF NOT EXISTS public.congress_abstracts (
  abstract_number       text PRIMARY KEY,
  congress_slug         text NOT NULL,
  speaker_display_name  text,
  speaker_key           text,        -- normalized first-token|last-token for joins
  session_title         text,
  session_type          text,
  presentation_title    text,
  tracks                text,
  presentation_start    timestamptz, -- ~466 of the presented set carry a slot; rest NULL
  presentation_end      timestamptz,
  presentation_timezone text,
  is_lung               boolean NOT NULL DEFAULT false,
  is_breast             boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_congress_abstracts_slug        ON public.congress_abstracts (congress_slug);
CREATE INDEX IF NOT EXISTS idx_congress_abstracts_speaker_key ON public.congress_abstracts (congress_slug, speaker_key);

-- Confirmed presenters: a distinct speaker matched to EXACTLY ONE NSCLC board HCP
-- (ambiguous / zero-match speakers are never written here). This is a FACT, not an
-- inference — it upgrades the design's inference-only ASCO treatment.
CREATE TABLE IF NOT EXISTS public.congress_confirmed_presenters (
  congress_slug        text NOT NULL,
  speaker_key          text NOT NULL,
  speaker_display_name text NOT NULL,
  hcp_id               uuid NOT NULL REFERENCES public.hcps_v2(id) ON DELETE CASCADE,
  therapeutic_area_id  uuid NOT NULL,
  established_rank      integer,     -- hcp_established_ranks_v3.rank (US region) if on that board
  rising_rank          integer,     -- hcp_rising_star_ranks_v3.us_rank if on that board
  matched_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (congress_slug, speaker_key)
);
CREATE INDEX IF NOT EXISTS idx_congress_confirmed_hcp ON public.congress_confirmed_presenters (hcp_id);

ALTER TABLE public.congress_abstracts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.congress_confirmed_presenters  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS congress_abstracts_select_all ON public.congress_abstracts;
CREATE POLICY congress_abstracts_select_all ON public.congress_abstracts
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS congress_confirmed_select_all ON public.congress_confirmed_presenters;
CREATE POLICY congress_confirmed_select_all ON public.congress_confirmed_presenters
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.congress_abstracts            TO anon, authenticated;
GRANT SELECT ON public.congress_confirmed_presenters TO anon, authenticated;
-- Ingest/maintenance runs as service_role (per the Edge-Function grants convention).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.congress_abstracts            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.congress_confirmed_presenters TO service_role;
