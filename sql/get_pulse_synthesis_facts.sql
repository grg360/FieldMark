-- get_pulse_synthesis_facts — the fact set handed to the Pulse TA-synthesis
-- model, and NOTHING else (applied to the live DB 2026-07-27; see sql/README.md).
--
-- The AI synthesis that opens /pulse/:ta is generated ONLY from current-window
-- facts. This RPC is the enforcement point: it returns exactly the allowed
-- fields, so the excluded ones never leave the database. That is a stronger
-- guarantee than prompting the model to ignore them — the lesson from the
-- Community engagement-claim bug, where removing the fact worked and a
-- prohibition alone did not.
--
-- INCLUDED (current window only): per theme — name, cur_pubs, cur_share,
--   reviews, trials, commentary, guidance; plus totals.current_pubs, the window
--   dates, and the events array.
-- DELIBERATELY EXCLUDED: prior_pubs, prior_share, any movement / percentage-
--   change figure, the monthly series, and lifetime_pubs. Our movement figures
--   are flagged unreliable (June 2026 backfill recovery, deflated January 2026 —
--   the movement-reliability caveat), so a paragraph narrating change would be
--   asserting something we have explicitly labelled untrustworthy.
--
-- Window matches the Pulse page: the last 3 COMPLETE calendar months (current
-- calendar month excluded as incomplete). ta_slug is resolved to the TA's uuid
-- (for publication_theme_v1) and canonical label (for theme_canonical_v1).

-- SECURITY DEFINER: runs as the owner so it can read the underlying Pulse tables
-- regardless of the caller's grants (the Edge Function calls it as service_role,
-- which is not granted SELECT on those tables). Callers need only EXECUTE, and
-- since the function returns ONLY the curated fields, this reinforces rather than
-- weakens the guarantee that the excluded facts never leave the database.
-- search_path is pinned per SECURITY DEFINER best practice.
CREATE OR REPLACE FUNCTION public.get_pulse_synthesis_facts(p_ta_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
WITH ta AS (
  SELECT id AS ta_id, name AS ta_label
  FROM therapeutic_areas
  WHERE slug = p_ta_slug
),
bounds AS (
  SELECT
    (date_trunc('month', current_date))::date AS cur_end,
    (date_trunc('month', current_date) - interval '3 months')::date AS cur_start
),
labeled AS (
  SELECT pt.canonical_id, p.id AS publication_id, p.pub_date, p.publication_types
  FROM publication_theme_v1 pt
  JOIN publications_v2 p ON p.id = pt.publication_id
  CROSS JOIN ta
  CROSS JOIN bounds b
  WHERE pt.therapeutic_area_id = ta.ta_id
    AND pt.is_primary
    AND p.pub_date IS NOT NULL
    AND p.pub_date <> date_trunc('year', p.pub_date)::date
    AND p.pub_date >= b.cur_start AND p.pub_date < b.cur_end
),
cur AS (
  SELECT
    l.canonical_id,
    count(*) AS pubs,
    count(*) FILTER (WHERE l.publication_types && ARRAY['Review','Systematic Review','Meta-Analysis','Network Meta-Analysis']) AS reviews,
    count(*) FILTER (WHERE l.publication_types && ARRAY['Clinical Trial','Clinical Trial, Phase I','Clinical Trial, Phase II','Clinical Trial, Phase III','Randomized Controlled Trial','Clinical Trial Protocol']) AS trials,
    count(*) FILTER (WHERE l.publication_types && ARRAY['Editorial','Comment','Letter']) AS commentary,
    count(*) FILTER (WHERE l.publication_types && ARRAY['Practice Guideline','Consensus Statement']) AS guidance
  FROM labeled l
  GROUP BY l.canonical_id
),
cur_total AS (
  SELECT coalesce(sum(pubs), 0)::numeric AS total FROM cur
),
events AS (
  SELECT
    tc.canonical_name AS theme,
    CASE
      WHEN p.publication_types && ARRAY['Practice Guideline'] THEN 'guideline'
      WHEN p.publication_types && ARRAY['Consensus Statement'] THEN 'consensus'
      ELSE 'retraction'
    END AS type,
    p.title,
    p.journal,
    p.pub_date AS date
  FROM labeled l
  JOIN publications_v2 p ON p.id = l.publication_id
  JOIN theme_canonical_v1 tc ON tc.id = l.canonical_id
  WHERE p.publication_types && ARRAY['Practice Guideline','Consensus Statement','Retracted Publication']
)
SELECT jsonb_build_object(
  'therapeutic_area', (SELECT ta_label FROM ta),
  'window', jsonb_build_object(
    'current_start', (SELECT cur_start FROM bounds),
    'current_end',   (SELECT cur_end FROM bounds)
  ),
  'totals', jsonb_build_object(
    'current_pubs', (SELECT total FROM cur_total)
  ),
  'themes', (
    SELECT coalesce(jsonb_agg(t ORDER BY t_pubs DESC), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
        'name', tc.canonical_name,
        'cur_pubs', coalesce(c.pubs, 0),
        'cur_share', round(100.0 * coalesce(c.pubs, 0) / nullif((SELECT total FROM cur_total), 0), 2),
        'reviews', coalesce(c.reviews, 0),
        'trials', coalesce(c.trials, 0),
        'commentary', coalesce(c.commentary, 0),
        'guidance', coalesce(c.guidance, 0)
      ) AS t,
      coalesce(c.pubs, 0) AS t_pubs
      FROM theme_canonical_v1 tc
      LEFT JOIN cur c ON c.canonical_id = tc.id
      WHERE tc.therapeutic_area = (SELECT ta_label FROM ta)
    ) s
  ),
  'events', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'theme', e.theme, 'type', e.type, 'title', e.title, 'journal', e.journal, 'date', e.date
    ) ORDER BY e.date DESC), '[]'::jsonb)
    FROM events e
  )
)
$function$;

GRANT EXECUTE ON FUNCTION public.get_pulse_synthesis_facts(text) TO anon, authenticated, service_role;
