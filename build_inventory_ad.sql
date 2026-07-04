SET statement_timeout = '30min';

INSERT INTO openalex_author_inventory (
  openalex_author_id, display_name, last_known_institution, last_known_institution_ror,
  orcid, corpus_pub_count, first_seen_pub_year, last_seen_pub_year,
  has_matching_hcp, matching_hcp_id, inventoried_at
)
WITH ad_authors AS (
  SELECT DISTINCT author_id
  FROM author_pub_flat
  WHERE source_ta_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1'
),
agg AS (
  SELECT
    f.author_id,
    COUNT(*)                          AS corpus_pub_count,
    MIN(f.pub_year)                   AS first_seen_pub_year,
    MAX(f.pub_year)                   AS last_seen_pub_year,
    MODE() WITHIN GROUP (ORDER BY f.display_name)     AS display_name,
    MODE() WITHIN GROUP (ORDER BY f.institution)      AS institution,
    MODE() WITHIN GROUP (ORDER BY f.institution_ror)  AS institution_ror,
    MODE() WITHIN GROUP (ORDER BY f.orcid)            AS orcid
  FROM author_pub_flat f
  WHERE f.author_id IN (SELECT author_id FROM ad_authors)
  GROUP BY f.author_id
  HAVING COUNT(*) >= 3
)
SELECT
  author_id, display_name, institution, institution_ror, orcid,
  corpus_pub_count, first_seen_pub_year, last_seen_pub_year,
  FALSE, NULL, NOW()
FROM agg
ON CONFLICT (openalex_author_id) DO UPDATE SET
  display_name               = EXCLUDED.display_name,
  last_known_institution     = EXCLUDED.last_known_institution,
  last_known_institution_ror = EXCLUDED.last_known_institution_ror,
  orcid                      = EXCLUDED.orcid,
  corpus_pub_count           = EXCLUDED.corpus_pub_count,
  first_seen_pub_year        = EXCLUDED.first_seen_pub_year,
  last_seen_pub_year         = EXCLUDED.last_seen_pub_year,
  inventoried_at             = EXCLUDED.inventoried_at;
