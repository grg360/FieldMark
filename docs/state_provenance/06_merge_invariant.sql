/* ==== S3. merge_hcp_pair: THE INVARIANT, NOT JUST THREE MORE COLUMNS ====
   CREATE OR REPLACE, no signature change, so no grant loss and no ambiguity
   window.

   The three new columns merge within their own lane, and institution_state is
   never copied into nppes_practice_state. The reasoning is written into the
   function body, next to the line it protects, so it survives this file.
   institution_state_source is resolved by a CASE rather than a COALESCE
   because it is a confidence order, not a presence test. */

CREATE OR REPLACE FUNCTION public.merge_hcp_pair(p_canonical_id uuid, p_merged_id uuid, p_pass_name text, p_signals jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$

DECLARE

  v_canonical_row hcps%ROWTYPE;

  v_merged_row hcps%ROWTYPE;

  v_fk_counts jsonb := '{}'::jsonb;

  v_remaining_refs int;

  v_log_id uuid;

BEGIN

/* Sanity checks */

  IF p_canonical_id = p_merged_id THEN

    RAISE EXCEPTION 'Cannot merge HCP into itself: %', p_canonical_id;

  END IF;

  

  SELECT * INTO v_canonical_row FROM hcps WHERE id = p_canonical_id;

  IF NOT FOUND THEN

    RAISE EXCEPTION 'Canonical HCP not found: %', p_canonical_id;

  END IF;

  

  SELECT * INTO v_merged_row FROM hcps WHERE id = p_merged_id;

  IF NOT FOUND THEN

    RAISE EXCEPTION 'Merged HCP not found: %', p_merged_id;

  END IF;

  

/* Capture pre-merge FK counts for log */

  v_fk_counts := jsonb_build_object(

    'publication_authors_canonical', (SELECT COUNT(*) FROM publication_authors WHERE hcp_id = p_canonical_id),

    'publication_authors_merged', (SELECT COUNT(*) FROM publication_authors WHERE hcp_id = p_merged_id),

    'publications_canonical', (SELECT COUNT(*) FROM publications WHERE hcp_id = p_canonical_id),

    'publications_merged', (SELECT COUNT(*) FROM publications WHERE hcp_id = p_merged_id),

    'hcp_therapeutic_areas_canonical', (SELECT COUNT(*) FROM hcp_therapeutic_areas WHERE hcp_id = p_canonical_id),

    'hcp_therapeutic_areas_merged', (SELECT COUNT(*) FROM hcp_therapeutic_areas WHERE hcp_id = p_merged_id),

    'hcp_scores_canonical', (SELECT COUNT(*) FROM hcp_scores WHERE hcp_id = p_canonical_id),

    'hcp_scores_merged', (SELECT COUNT(*) FROM hcp_scores WHERE hcp_id = p_merged_id),

    'hcp_open_payments_summary_canonical', (SELECT COUNT(*) FROM hcp_open_payments_summary WHERE hcp_id = p_canonical_id),

    'hcp_open_payments_summary_merged', (SELECT COUNT(*) FROM hcp_open_payments_summary WHERE hcp_id = p_merged_id),

    'hcp_open_payments_by_ta_canonical', (SELECT COUNT(*) FROM hcp_open_payments_by_ta WHERE hcp_id = p_canonical_id),

    'hcp_open_payments_by_ta_merged', (SELECT COUNT(*) FROM hcp_open_payments_by_ta WHERE hcp_id = p_merged_id),

    'hcp_medicare_summary_canonical', (SELECT COUNT(*) FROM hcp_medicare_summary WHERE hcp_id = p_canonical_id),

    'hcp_medicare_summary_merged', (SELECT COUNT(*) FROM hcp_medicare_summary WHERE hcp_id = p_merged_id),

    'hcp_medicare_by_ta_canonical', (SELECT COUNT(*) FROM hcp_medicare_by_ta WHERE hcp_id = p_canonical_id),

    'hcp_medicare_by_ta_merged', (SELECT COUNT(*) FROM hcp_medicare_by_ta WHERE hcp_id = p_merged_id),

    'hcp_narratives_canonical', (SELECT COUNT(*) FROM hcp_narratives WHERE hcp_id = p_canonical_id),

    'hcp_narratives_merged', (SELECT COUNT(*) FROM hcp_narratives WHERE hcp_id = p_merged_id),

    'trial_investigators_merged', (SELECT COUNT(*) FROM trial_investigators WHERE hcp_id = p_merged_id),

    'dol_matches_canonical', (SELECT COUNT(*) FROM dol_matches WHERE hcp_id = p_canonical_id),

    'dol_matches_merged', (SELECT COUNT(*) FROM dol_matches WHERE hcp_id = p_merged_id),

    'npi_match_proposals_canonical', (SELECT COUNT(*) FROM npi_match_proposals WHERE hcp_id = p_canonical_id),

    'npi_match_proposals_merged', (SELECT COUNT(*) FROM npi_match_proposals WHERE hcp_id = p_merged_id),

    'trial_match_proposals_merged', (SELECT COUNT(*) FROM trial_investigator_match_proposals WHERE proposed_hcp_id = p_merged_id)

  );

  

/* Step 1: Insert merge log entry */

  INSERT INTO dedup_merge_log (

    canonical_hcp_id, merged_hcp_id, merge_pass, merge_signals,

    original_canonical_data, original_merged_data, fk_updates_count

  )

  VALUES (

    p_canonical_id, p_merged_id, p_pass_name, p_signals,

    to_jsonb(v_canonical_row), to_jsonb(v_merged_row), v_fk_counts

  )

  RETURNING id INTO v_log_id;

  

/* Step 2: Resolve UNIQUE constraint conflicts */

/* For each table with UNIQUE involving hcp_id, delete merged's conflicting rows first */

  

/* hcp_therapeutic_areas: UNIQUE (hcp_id, therapeutic_area_id) */

  DELETE FROM hcp_therapeutic_areas

  WHERE hcp_id = p_merged_id

    AND therapeutic_area_id IN (

      SELECT therapeutic_area_id FROM hcp_therapeutic_areas WHERE hcp_id = p_canonical_id

    );

  

/* hcp_scores: UNIQUE (hcp_id, therapeutic_area_id) AND UNIQUE (hcp_id, therapeutic_area_id, score_version) */

/* Stricter constraint catches first; deleting by ta_id handles both */

  DELETE FROM hcp_scores

  WHERE hcp_id = p_merged_id

    AND therapeutic_area_id IN (

      SELECT therapeutic_area_id FROM hcp_scores WHERE hcp_id = p_canonical_id

    );

  

/* hcp_open_payments_summary: UNIQUE (hcp_id) */

  IF EXISTS (SELECT 1 FROM hcp_open_payments_summary WHERE hcp_id = p_canonical_id) THEN

    DELETE FROM hcp_open_payments_summary WHERE hcp_id = p_merged_id;

  END IF;

  

/* hcp_open_payments_by_ta: UNIQUE (hcp_id, therapeutic_area_id) */

  DELETE FROM hcp_open_payments_by_ta

  WHERE hcp_id = p_merged_id

    AND therapeutic_area_id IN (

      SELECT therapeutic_area_id FROM hcp_open_payments_by_ta WHERE hcp_id = p_canonical_id

    );

  

/* hcp_medicare_summary: UNIQUE (hcp_id) */

  IF EXISTS (SELECT 1 FROM hcp_medicare_summary WHERE hcp_id = p_canonical_id) THEN

    DELETE FROM hcp_medicare_summary WHERE hcp_id = p_merged_id;

  END IF;

  

/* hcp_medicare_by_ta: UNIQUE (hcp_id, therapeutic_area_id) */

  DELETE FROM hcp_medicare_by_ta

  WHERE hcp_id = p_merged_id

    AND therapeutic_area_id IN (

      SELECT therapeutic_area_id FROM hcp_medicare_by_ta WHERE hcp_id = p_canonical_id

    );

  

/* hcp_narratives: UNIQUE (hcp_id, therapeutic_area_id, model_version) */

  DELETE FROM hcp_narratives

  WHERE hcp_id = p_merged_id

    AND (therapeutic_area_id, model_version) IN (

      SELECT therapeutic_area_id, model_version FROM hcp_narratives WHERE hcp_id = p_canonical_id

    );

  

/* publication_authors: UNIQUE (publication_id, hcp_id) */

  DELETE FROM publication_authors

  WHERE hcp_id = p_merged_id

    AND publication_id IN (

      SELECT publication_id FROM publication_authors WHERE hcp_id = p_canonical_id

    );

  

/* publications: UNIQUE (hcp_id, pubmed_id) — newly handled */

  DELETE FROM publications

  WHERE hcp_id = p_merged_id

    AND pubmed_id IN (

      SELECT pubmed_id FROM publications WHERE hcp_id = p_canonical_id AND pubmed_id IS NOT NULL

    );

  

/* dol_matches: UNIQUE (hcp_id, social_user_id) */

  DELETE FROM dol_matches

  WHERE hcp_id = p_merged_id

    AND social_user_id IN (

      SELECT social_user_id FROM dol_matches WHERE hcp_id = p_canonical_id

    );

  

/* npi_match_proposals: UNIQUE (hcp_id) — newly handled */

  IF EXISTS (SELECT 1 FROM npi_match_proposals WHERE hcp_id = p_canonical_id) THEN

    DELETE FROM npi_match_proposals WHERE hcp_id = p_merged_id;

  END IF;

  

/* Step 3: Update FKs in remaining (non-conflicting) rows from merged_id to canonical_id */

  

  UPDATE publication_authors SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE publications SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_therapeutic_areas SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_scores SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_open_payments_summary SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_open_payments_by_ta SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_medicare_summary SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_medicare_by_ta SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_claims SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_narratives SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE trial_investigators SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE dol_matches SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE npi_match_proposals SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE trial_investigator_match_proposals SET proposed_hcp_id = p_canonical_id WHERE proposed_hcp_id = p_merged_id;

/* Empty tables (no rows currently) — safe to update for future-proofing */

  UPDATE hcp_watchlist SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE msl_contributions SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE cohort_overrides SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  

/* Step 4: Field merge — fill-if-null from merged into canonical for null fields, */

/* numeric maximums for count fields, numeric minimum for first_pub_year */

  UPDATE hcps c SET

    npi_number = COALESCE(c.npi_number, m.npi_number),

    middle_name = COALESCE(c.middle_name, m.middle_name),

    credentials = COALESCE(c.credentials, m.credentials),

    twitter_handle = COALESCE(c.twitter_handle, m.twitter_handle),

    bluesky_handle = COALESCE(c.bluesky_handle, m.bluesky_handle),

    orcid = COALESCE(c.orcid, m.orcid),

    nppes_enumeration_date = COALESCE(c.nppes_enumeration_date, m.nppes_enumeration_date),

    nppes_practice_address = COALESCE(c.nppes_practice_address, m.nppes_practice_address),

    nppes_practice_city = COALESCE(c.nppes_practice_city, m.nppes_practice_city),

    nppes_practice_state = COALESCE(c.nppes_practice_state, m.nppes_practice_state),

    /* ==== THE PROVENANCE INVARIANT (2026-09-02) ====
       A REAL NPPES STATE ALWAYS WINS, AND institution_state IS NEVER COPIED INTO
       nppes_practice_state. After the block-7 clear, "nppes_practice_state is populated"
       implies "NPPES sourced it", and merge is the ONLY path that can break that: it is the
       one place two rows with different provenance become one row. A COALESCE across the two
       columns here would put an institution's state into the NPPES column on the first merge
       and quietly undo the whole separation.

       The three columns below therefore merge WITHIN their own lane. They are listed
       immediately after nppes_practice_state so the pairing is visible to the next reader. */
    institution_state = COALESCE(c.institution_state, m.institution_state),
    institution_city  = COALESCE(c.institution_city,  m.institution_city),

    /* NOT A COALESCE, deliberately. The source is a CONFIDENCE ORDER, not a presence test:
       'institution_ror_confirmed' means a second registry agreed, 'legacy_nppes_column' means
       only that the value was found in the old column. A plain COALESCE takes whichever row
       happens to be canonical, so merging a confirmed row with a legacy row could DOWNGRADE a
       corroborated value to an uncorroborated one and lose the corroboration silently.

       The source must also follow the value it describes: if institution_state resolves to
       m's value, the source must be m's, or the merged row claims a confirmation that was
       about a different state. */
    institution_state_source = CASE
      WHEN c.institution_state IS NOT NULL AND m.institution_state IS NOT NULL THEN
        CASE WHEN 'institution_ror_confirmed' IN (c.institution_state_source, m.institution_state_source)
               AND c.institution_state = m.institution_state
             THEN 'institution_ror_confirmed'
             ELSE COALESCE(c.institution_state_source, m.institution_state_source)
        END
      WHEN c.institution_state IS NOT NULL THEN c.institution_state_source
      WHEN m.institution_state IS NOT NULL THEN m.institution_state_source
      ELSE NULL
    END,

    nppes_practice_zip = COALESCE(c.nppes_practice_zip, m.nppes_practice_zip),

    nppes_organization_name = COALESCE(c.nppes_organization_name, m.nppes_organization_name),

    nppes_organization_npi = COALESCE(c.nppes_organization_npi, m.nppes_organization_npi),

    nppes_career_stage = COALESCE(c.nppes_career_stage, m.nppes_career_stage),

    nppes_career_stage_years = COALESCE(c.nppes_career_stage_years, m.nppes_career_stage_years),

    nppes_enriched_at = COALESCE(c.nppes_enriched_at, m.nppes_enriched_at),

/* For count fields: numeric max via direct compare (cleaner than GREATEST with COALESCE) */

    total_career_pubs = CASE 

      WHEN c.total_career_pubs IS NULL THEN m.total_career_pubs

      WHEN m.total_career_pubs IS NULL THEN c.total_career_pubs

      ELSE GREATEST(c.total_career_pubs, m.total_career_pubs)

    END,

    scholar_citations_total = CASE 

      WHEN c.scholar_citations_total IS NULL THEN m.scholar_citations_total

      WHEN m.scholar_citations_total IS NULL THEN c.scholar_citations_total

      ELSE GREATEST(c.scholar_citations_total, m.scholar_citations_total)

    END,

/* For first_pub_year: minimum (earliest) */

    first_pub_year = CASE 

      WHEN c.first_pub_year IS NULL THEN m.first_pub_year

      WHEN m.first_pub_year IS NULL THEN c.first_pub_year

      ELSE LEAST(c.first_pub_year, m.first_pub_year)

    END

  FROM hcps m

  WHERE c.id = p_canonical_id AND m.id = p_merged_id;

  

/* Step 5: Verify zero remaining FK references */

  SELECT 

    (SELECT COUNT(*) FROM publication_authors WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM publications WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_therapeutic_areas WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_open_payments_summary WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_open_payments_by_ta WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_medicare_summary WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_medicare_by_ta WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_claims WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_scores WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_narratives WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM trial_investigators WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM dol_matches WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM npi_match_proposals WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM trial_investigator_match_proposals WHERE proposed_hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_watchlist WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM msl_contributions WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM cohort_overrides WHERE hcp_id = p_merged_id)

  INTO v_remaining_refs;

  

  IF v_remaining_refs > 0 THEN

    RAISE EXCEPTION 'Cannot delete merged HCP %: % FK refs still pointing at it', p_merged_id, v_remaining_refs;

  END IF;

  

/* Step 6: Delete merged hcp row */

  DELETE FROM hcps WHERE id = p_merged_id;

  

  RETURN jsonb_build_object(

    'success', true,

    'log_id', v_log_id,

    'canonical_id', p_canonical_id,

    'merged_id', p_merged_id,

    'fk_counts', v_fk_counts

  );

END;

$function$;
