-- Run each CREATE OR REPLACE below as a standalone statement in Supabase SQL editor.

-- =============================================================================
-- get_established_filtered
-- =============================================================================
CREATE OR REPLACE FUNCTION get_established_filtered(
  p_ta_id uuid,
  p_scope_type text,
  p_scope_values text[],
  p_states text[],
  p_canonical_theme_ids uuid[],
  p_limit int,
  p_offset int
) RETURNS TABLE(
  hcp_id uuid,
  rank int,
  scope_size int,
  normalized_score numeric,
  composite_score numeric,
  pub_volume_score numeric,
  recent_productivity_score numeric,
  lead_density_score numeric,
  trial_score numeric,
  career_length_score numeric,
  pharma_breadth_score numeric,
  country text,
  first_name text,
  last_name text,
  institution_normalized text,
  career_first_pub_year int,
  total_career_pubs int
) AS $$
  SELECT
    er.hcp_id,
    er.rank,
    er.scope_size,
    er.normalized_score,
    er.composite_score,
    er.pub_volume_score,
    er.recent_productivity_score,
    er.lead_density_score,
    er.trial_score,
    er.career_length_score,
    er.pharma_breadth_score,
    er.country,
    er.first_name,
    er.last_name,
    er.institution_normalized,
    er.career_first_pub_year,
    er.total_career_pubs
  FROM hcp_established_ranks_v2 er
  JOIN hcps_v2 h ON h.id = er.hcp_id
  WHERE er.therapeutic_area_id = p_ta_id
    AND er.scope_type = p_scope_type
    AND er.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = er.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    )
  ORDER BY er.rank ASC
  LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- get_established_filtered_count
-- =============================================================================
CREATE OR REPLACE FUNCTION get_established_filtered_count(
  p_ta_id uuid,
  p_scope_type text,
  p_scope_values text[],
  p_states text[],
  p_canonical_theme_ids uuid[]
) RETURNS int AS $$
  SELECT COUNT(*)::int
  FROM hcp_established_ranks_v2 er
  JOIN hcps_v2 h ON h.id = er.hcp_id
  WHERE er.therapeutic_area_id = p_ta_id
    AND er.scope_type = p_scope_type
    AND er.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = er.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    );
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- get_rising_star_filtered
-- =============================================================================
CREATE OR REPLACE FUNCTION get_rising_star_filtered(
  p_ta_id uuid,
  p_scope_type text,
  p_scope_values text[],
  p_states text[],
  p_canonical_theme_ids uuid[],
  p_limit int,
  p_offset int
) RETURNS TABLE(
  hcp_id uuid,
  rank int,
  percentile numeric,
  scope_size int,
  normalized_score numeric,
  score_at_rank numeric,
  composite_score numeric,
  pub_velocity_score numeric,
  citation_trajectory_score numeric,
  trial_investigator_score numeric,
  career_first_pub_year int,
  total_career_pubs int
) AS $$
  SELECT
    rs.hcp_id,
    rs.rank,
    rs.percentile,
    rs.scope_size,
    rs.normalized_score,
    rs.score_at_rank,
    rs.composite_score,
    rs.pub_velocity_score,
    rs.citation_trajectory_score,
    rs.trial_investigator_score,
    rs.career_first_pub_year,
    rs.total_career_pubs
  FROM hcp_rising_star_ranks_v2 rs
  JOIN hcps_v2 h ON h.id = rs.hcp_id
  WHERE rs.therapeutic_area_id = p_ta_id
    AND rs.scope_type = p_scope_type
    AND rs.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = rs.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    )
  ORDER BY rs.rank ASC
  LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- get_rising_star_filtered_count
-- =============================================================================
CREATE OR REPLACE FUNCTION get_rising_star_filtered_count(
  p_ta_id uuid,
  p_scope_type text,
  p_scope_values text[],
  p_states text[],
  p_canonical_theme_ids uuid[]
) RETURNS int AS $$
  SELECT COUNT(*)::int
  FROM hcp_rising_star_ranks_v2 rs
  JOIN hcps_v2 h ON h.id = rs.hcp_id
  WHERE rs.therapeutic_area_id = p_ta_id
    AND rs.scope_type = p_scope_type
    AND rs.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = rs.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    );
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- get_community_filtered
-- =============================================================================
CREATE OR REPLACE FUNCTION get_community_filtered(
  p_ta_id uuid,
  p_scope_type text,
  p_scope_values text[],
  p_states text[],
  p_canonical_theme_ids uuid[],
  p_limit int,
  p_offset int
) RETURNS TABLE(
  hcp_id uuid,
  rank int,
  scope_size int,
  normalized_score numeric,
  composite_score numeric,
  patient_volume numeric,
  pharma_engagement numeric,
  group_practice_signal numeric,
  career_years numeric,
  publication_signal numeric,
  country text,
  first_name text,
  last_name text,
  institution_normalized text,
  career_first_pub_year int,
  total_career_pubs int,
  nppes_career_stage_years numeric,
  nppes_practice_city text,
  nppes_practice_state text,
  nppes_practice_setting text,
  npi_specialty text
) AS $$
  SELECT
    cr.hcp_id,
    cr.rank,
    cr.scope_size,
    cr.normalized_score,
    cr.composite_score,
    cr.patient_volume,
    cr.pharma_engagement,
    cr.group_practice_signal,
    cr.career_years,
    cr.publication_signal,
    cr.country,
    cr.first_name,
    cr.last_name,
    cr.institution_normalized,
    cr.career_first_pub_year,
    cr.total_career_pubs,
    cr.nppes_career_stage_years,
    cr.nppes_practice_city,
    cr.nppes_practice_state,
    cr.nppes_practice_setting,
    cr.npi_specialty
  FROM hcp_community_ranks_v2 cr
  JOIN hcps_v2 h ON h.id = cr.hcp_id
  WHERE cr.therapeutic_area_id = p_ta_id
    AND cr.scope_type = p_scope_type
    AND cr.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = cr.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    )
  ORDER BY cr.rank ASC
  LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- get_community_filtered_count
-- =============================================================================
CREATE OR REPLACE FUNCTION get_community_filtered_count(
  p_ta_id uuid,
  p_scope_type text,
  p_scope_values text[],
  p_states text[],
  p_canonical_theme_ids uuid[]
) RETURNS int AS $$
  SELECT COUNT(*)::int
  FROM hcp_community_ranks_v2 cr
  JOIN hcps_v2 h ON h.id = cr.hcp_id
  WHERE cr.therapeutic_area_id = p_ta_id
    AND cr.scope_type = p_scope_type
    AND cr.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = cr.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    );
$$ LANGUAGE sql STABLE;
