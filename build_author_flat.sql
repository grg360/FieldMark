SET statement_timeout = '30min';
DROP TABLE IF EXISTS author_pub_flat;
CREATE TABLE author_pub_flat AS
SELECT
  auth->'author'->>'id'                                AS author_id,
  p.id                                                 AS pub_id,
  p.pub_year                                           AS pub_year,
  p.source_therapeutic_area_id                         AS source_ta_id,
  auth->'author'->>'display_name'                      AS display_name,
  COALESCE(auth->'author'->>'orcid', auth->>'raw_orcid') AS orcid,
  auth->'institutions'->0->>'display_name'             AS institution,
  auth->'institutions'->0->>'ror'                      AS institution_ror
FROM publications_v2 p,
     jsonb_array_elements(p.authorships) auth
WHERE p.authorships IS NOT NULL
  AND jsonb_typeof(p.authorships) = 'array'
  AND auth->'author'->>'id' IS NOT NULL;