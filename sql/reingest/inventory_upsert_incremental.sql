-- FieldMark incremental reingest — stage 1d: openalex_author_inventory upsert (per-TA).
--
-- Refreshes openalex_author_inventory for THIS therapeutic area's authors from author_pub_flat
-- (which stage 1c has just rebuilt from the freshly OpenAlex-enriched publications_v2.authorships).
-- create_hcps_v2 (stage 2) clusters this inventory, so it MUST be current before stage 2 runs.
--
-- ============================================================================================
-- GATE-B (correctness — the load-bearing property; ref INCREMENTAL_REINGEST_SEQUENCE §31u / §3b):
--   corpus_pub_count = GREATEST(existing, EXCLUDED)  —  NOT a blind `= EXCLUDED` clobber.
--
--   author_pub_flat is a DERIVED table rebuilt from publications_v2.authorships. Pubs that lack
--   authorships (never OpenAlex-enriched — e.g. too-new-for-OpenAlex) are ABSENT from the flat, so a
--   flat-derived COUNT can be LOWER than an author's true corpus count. The original build_inventory_
--   ad.sql used `corpus_pub_count = EXCLUDED.corpus_pub_count`, which therefore LOWERED established
--   KOLs' counts on every cycle — the documented "buried 34% of the established cohort / 933-KOL
--   degradation" bug. GREATEST() makes the upsert NEVER lower a count. first_seen_pub_year /
--   last_seen_pub_year use LEAST / GREATEST for the same never-lose-information reason.
--
--   corpus_pub_count is the author's FULL cross-TA footprint (COUNT over ALL their author_pub_flat
--   rows), NOT TA-scoped — scoping the count would clobber cross-TA authors' true totals.
--
--   has_matching_hcp / matching_hcp_id are deliberately OMITTED from the DO UPDATE set, to preserve
--   the Step B/C linkage that create_hcps established (never overwrite it here).
-- ============================================================================================
--
-- Param:   %(ta_id)s  — the therapeutic_areas.id UUID, passed as a BOUND parameter
--          (run_sql.py --param ta_id=<uuid>), never string-interpolated.
-- Runtime: this is a heavy aggregate over the full author_pub_flat — the caller raises
--          statement_timeout (run_sql.py --statement-timeout 30min); single statement (parametrized).

INSERT INTO openalex_author_inventory (
  openalex_author_id, display_name, last_known_institution, last_known_institution_ror,
  orcid, corpus_pub_count, first_seen_pub_year, last_seen_pub_year,
  has_matching_hcp, matching_hcp_id, inventoried_at
)
WITH ta_authors AS (
  SELECT DISTINCT author_id
  FROM author_pub_flat
  WHERE source_ta_id = %(ta_id)s
),
agg AS (
  SELECT
    f.author_id,
    COUNT(*)                                          AS corpus_pub_count,
    MIN(f.pub_year)                                   AS first_seen_pub_year,
    MAX(f.pub_year)                                   AS last_seen_pub_year,
    MODE() WITHIN GROUP (ORDER BY f.display_name)     AS display_name,
    MODE() WITHIN GROUP (ORDER BY f.institution)      AS institution,
    MODE() WITHIN GROUP (ORDER BY f.institution_ror)  AS institution_ror,
    MODE() WITHIN GROUP (ORDER BY f.orcid)            AS orcid
  FROM author_pub_flat f
  WHERE f.author_id IN (SELECT author_id FROM ta_authors)
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
  corpus_pub_count           = GREATEST(openalex_author_inventory.corpus_pub_count, EXCLUDED.corpus_pub_count),
  first_seen_pub_year        = LEAST(openalex_author_inventory.first_seen_pub_year, EXCLUDED.first_seen_pub_year),
  last_seen_pub_year         = GREATEST(openalex_author_inventory.last_seen_pub_year, EXCLUDED.last_seen_pub_year),
  inventoried_at             = EXCLUDED.inventoried_at;
