WITH params AS (
  SELECT
    'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid AS ta_id,
    3 AS win_months,
    0 AS lag_months
),
bounds AS (
  SELECT
    ta_id,
    win_months,
    lag_months,
    (date_trunc('month', current_date) - (lag_months || ' months')::interval)::date AS cur_end,
    (date_trunc('month', current_date) - ((lag_months + win_months) || ' months')::interval)::date AS cur_start,
    (date_trunc('month', current_date) - ((lag_months + win_months) || ' months')::interval)::date AS prior_end,
    (date_trunc('month', current_date) - ((lag_months + 2 * win_months) || ' months')::interval)::date AS prior_start
  FROM params
),
labeled AS (
  SELECT
    pt.canonical_id,
    p.id AS publication_id,
    p.pub_date,
    p.publication_types
  FROM publication_theme_v1 pt
  JOIN publications_v2 p ON p.id = pt.publication_id
  CROSS JOIN bounds b
  WHERE pt.therapeutic_area_id = b.ta_id
    AND pt.is_primary
    AND p.pub_date IS NOT NULL
    AND p.pub_date <> date_trunc('year', p.pub_date)::date
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
  CROSS JOIN bounds b
  WHERE l.pub_date >= b.cur_start AND l.pub_date < b.cur_end
  GROUP BY l.canonical_id
),
prior AS (
  SELECT l.canonical_id, count(*) AS pubs
  FROM labeled l
  CROSS JOIN bounds b
  WHERE l.pub_date >= b.prior_start AND l.pub_date < b.prior_end
  GROUP BY l.canonical_id
),
lifetime AS (
  SELECT canonical_id, count(*) AS pubs FROM labeled GROUP BY canonical_id
),
totals AS (
  SELECT
    coalesce((SELECT sum(pubs) FROM cur), 0)::numeric AS cur_total,
    coalesce((SELECT sum(pubs) FROM prior), 0)::numeric AS prior_total
),
monthly AS (
  SELECT date_trunc('month', l.pub_date)::date AS month, count(*) AS pubs
  FROM labeled l
  CROSS JOIN bounds b
  WHERE l.pub_date >= b.prior_start AND l.pub_date < b.cur_end
  GROUP BY 1
),
events AS (
  SELECT
    l.canonical_id,
    p.title,
    p.pub_date,
    p.journal,
    CASE
      WHEN p.publication_types && ARRAY['Practice Guideline'] THEN 'guideline'
      WHEN p.publication_types && ARRAY['Consensus Statement'] THEN 'consensus'
      ELSE 'retraction'
    END AS event_type
  FROM labeled l
  JOIN publications_v2 p ON p.id = l.publication_id
  CROSS JOIN bounds b
  WHERE l.pub_date >= b.cur_start AND l.pub_date < b.cur_end
    AND p.publication_types && ARRAY['Practice Guideline','Consensus Statement','Retracted Publication']
)
SELECT jsonb_pretty(jsonb_build_object(
  'therapeutic_area', 'NSCLC',
  'generated_at', current_date,
  'grain', 'month',
  'window', jsonb_build_object(
    'current_start', (SELECT cur_start FROM bounds),
    'current_end',   (SELECT cur_end FROM bounds),
    'prior_start',   (SELECT prior_start FROM bounds),
    'prior_end',     (SELECT prior_end FROM bounds),
    'window_months', (SELECT win_months FROM bounds),
    'lag_months',    (SELECT lag_months FROM bounds)
  ),
  'totals', jsonb_build_object(
    'current_pubs', (SELECT cur_total FROM totals),
    'prior_pubs',   (SELECT prior_total FROM totals)
  ),
  'monthly', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'pubs', m.pubs) ORDER BY m.month), '[]'::jsonb)
    FROM monthly m
  ),
  'themes', (
    SELECT jsonb_agg(t ORDER BY t.cur_pubs DESC)
    FROM (
      SELECT jsonb_build_object(
        'name', tc.canonical_name,
        'description', tc.description,
        'cur_pubs', coalesce(c.pubs, 0),
        'prior_pubs', coalesce(pr.pubs, 0),
        'lifetime_pubs', coalesce(lt.pubs, 0),
        'cur_share', round(100.0 * coalesce(c.pubs, 0) / nullif((SELECT cur_total FROM totals), 0), 2),
        'prior_share', round(100.0 * coalesce(pr.pubs, 0) / nullif((SELECT prior_total FROM totals), 0), 2),
        'reviews', coalesce(c.reviews, 0),
        'trials', coalesce(c.trials, 0),
        'commentary', coalesce(c.commentary, 0),
        'guidance', coalesce(c.guidance, 0)
      ) AS t,
      coalesce(c.pubs, 0) AS cur_pubs
      FROM theme_canonical_v1 tc
      LEFT JOIN cur c ON c.canonical_id = tc.id
      LEFT JOIN prior pr ON pr.canonical_id = tc.id
      LEFT JOIN lifetime lt ON lt.canonical_id = tc.id
      WHERE tc.therapeutic_area = 'NSCLC'
    ) t
  ),
  'events', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'theme', tc.canonical_name,
      'type', e.event_type,
      'title', e.title,
      'journal', e.journal,
      'date', e.pub_date
    ) ORDER BY e.pub_date DESC), '[]'::jsonb)
    FROM events e
    JOIN theme_canonical_v1 tc ON tc.id = e.canonical_id
  ),
  'caveats', jsonb_build_array(
    'Month grain. 69 percent of publications carry month-precision dates only, so day-level windows are not supported.',
    'Year-only dates (Jan 1 exact) are excluded from all aggregation.',
    'Current calendar month is excluded as incomplete.'
  )
)) AS pulse_payload;
