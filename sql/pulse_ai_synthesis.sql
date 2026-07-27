-- pulse_ai_synthesis — cache for the Pulse TA-level AI synthesis paragraph
-- (applied to the live DB 2026-07-27; see sql/README.md).
--
-- One row per (ta_slug, window_start, window_end): the paragraph that opens
-- /pulse/:ta, generated once per TA per window by the generate-pulse-synthesis
-- Edge Function and read on page load. Structure mirrors hcp_ai_overviews.
-- SELECT is open to anon + authenticated (read on load); writes happen only
-- through the Edge Function's service-role client, so no write policy is
-- granted to anon/authenticated.

CREATE TABLE IF NOT EXISTS public.pulse_ai_synthesis (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ta_slug           text NOT NULL,
  window_start      date NOT NULL,
  window_end        date NOT NULL,
  body              text NOT NULL,
  model_used        text,
  prompt_tokens     integer,
  completion_tokens integer,
  generated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ta_slug, window_start, window_end)
);

ALTER TABLE public.pulse_ai_synthesis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pulse_ai_synthesis_select_all ON public.pulse_ai_synthesis;
CREATE POLICY pulse_ai_synthesis_select_all
  ON public.pulse_ai_synthesis
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.pulse_ai_synthesis TO anon, authenticated;

-- The generate-pulse-synthesis Edge Function reads and upserts the cache with a
-- service_role client, so service_role needs table DML (mirrors hcp_ai_overviews).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_ai_synthesis TO service_role;
