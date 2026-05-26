-- ============================================================
-- US institution → state inference for publication HCP NPPES enrichment
-- ============================================================
-- Purpose:
-- Populate hcps_v2.nppes_practice_state on US publication HCPs by
-- mapping their institution_normalized values to US states. This
-- unblocks targeted_nppes_enrichment.py which filters candidates
-- on nppes_practice_state IN US_STATES.
--
-- Scope:
-- - Only publication HCPs (cohort_classification IS NULL)
-- - Only HCPs where country = 'US'
-- - Only HCPs where nppes_practice_state IS currently NULL
--
-- Excluded categories:
-- - Pharma companies (Merck, Pfizer, Gilead, etc.) - industry
--   researchers without NPIs in NPPES
-- - Federal agencies (NIH, NCI, CDC, FDA) - mostly non-clinical
-- - International institutions
--
-- The mapping reflects each institution's PRIMARY US state. Some
-- institutions have multiple campuses (e.g. Cornell has NY + Qatar);
-- the primary US clinical campus state is used.
--
-- After running, hcps_v2.nppes_practice_state will be populated with
-- an inferred state. When targeted_nppes_enrichment.py later finds
-- a real NPI match, it overwrites this column with the actual NPPES
-- practice state (ground truth).
-- ============================================================


-- Step 1: Create temporary mapping table
DROP TABLE IF EXISTS us_institution_to_state;
CREATE TEMP TABLE us_institution_to_state (
  institution_normalized text PRIMARY KEY,
  state text NOT NULL
);


-- Step 2: Insert institution → state mappings
-- Order roughly by hcp_count from the top-100 US institutions query.
INSERT INTO us_institution_to_state (institution_normalized, state) VALUES
  -- Top tier (1000+ HCPs)
  ('The University of Texas MD Anderson Cancer Center', 'TX'),

  -- Top tier (500-999 HCPs)
  ('Johns Hopkins University', 'MD'),
  ('Memorial Sloan Kettering Cancer Center', 'NY'),
  ('Mayo Clinic', 'MN'),
  ('Yale University', 'CT'),
  ('Harvard University', 'MA'),
  ('University of California, San Francisco', 'CA'),
  ('University of California, Los Angeles', 'CA'),

  -- Tier 3 (300-499 HCPs)
  ('Stanford University', 'CA'),
  ('Emory University', 'GA'),
  ('Icahn School of Medicine at Mount Sinai', 'NY'),
  ('Massachusetts General Hospital', 'MA'),
  ('University of Michigan', 'MI'),
  ('University of Pennsylvania', 'PA'),
  ('University of California San Diego', 'CA'),
  ('Cleveland Clinic', 'OH'),
  ('University of Pittsburgh', 'PA'),
  ('Northwestern University', 'IL'),
  ('The University of Texas Southwestern Medical Center', 'TX'),
  ('Brigham and Women''s Hospital', 'MA'),
  ('University of Southern California', 'CA'),
  ('Baylor College of Medicine', 'TX'),
  ('Mayo Clinic in Arizona', 'AZ'),
  ('University of North Carolina at Chapel Hill', 'NC'),
  ('Cornell University', 'NY'),
  ('University of Washington', 'WA'),

  -- Tier 4 (200-299 HCPs)
  ('Washington University in St. Louis', 'MO'),
  ('Duke University', 'NC'),
  ('Cincinnati Children''s Hospital Medical Center', 'OH'),
  ('Beth Israel Deaconess Medical Center', 'MA'),
  ('Virginia Commonwealth University', 'VA'),
  ('Vanderbilt University Medical Center', 'TN'),
  ('Rutgers, The State University of New Jersey', 'NJ'),
  ('University of Maryland, Baltimore', 'MD'),
  ('Moffitt Cancer Center', 'FL'),
  ('University of Minnesota', 'MN'),
  ('University of Wisconsin–Madison', 'WI'),
  ('University of Florida', 'FL'),
  ('Dana-Farber Cancer Institute', 'MA'),
  ('Cedars-Sinai Medical Center', 'CA'),
  ('University of Miami', 'FL'),

  -- Tier 5 (100-199 HCPs)
  ('Indiana University School of Medicine', 'IN'),
  ('University of Alabama at Birmingham', 'AL'),
  ('The Ohio State University', 'OH'),
  ('University of Louisville', 'KY'),
  ('University of Colorado Anschutz Medical Campus', 'CO'),
  ('Boston University', 'MA'),
  ('Medical University of South Carolina', 'SC'),
  ('University of Chicago', 'IL'),
  ('University of Kentucky', 'KY'),
  ('The Ohio State University Wexner Medical Center', 'OH'),
  ('University of California, Davis', 'CA'),
  ('Columbia University Irving Medical Center', 'NY'),
  ('University of Illinois Chicago', 'IL'),
  ('NYU Langone Health', 'NY'),
  ('Georgetown University', 'DC'),
  ('Oregon Health & Science University', 'OR'),
  ('University of Utah', 'UT'),
  ('Mayo Clinic in Florida', 'FL'),
  ('Duke Medical Center', 'NC'),
  ('Albert Einstein College of Medicine', 'NY'),
  ('Southwestern Medical Center', 'TX'),
  ('University of Nebraska Medical Center', 'NE'),
  ('University of Pittsburgh Medical Center', 'PA'),
  ('Thomas Jefferson University', 'PA'),
  ('University of Massachusetts Chan Medical School', 'MA'),
  ('New York University', 'NY'),
  ('Boston Children''s Hospital', 'MA'),
  ('Medical College of Wisconsin', 'WI'),
  ('Children''s Hospital of Philadelphia', 'PA'),
  ('University of Iowa', 'IA'),
  ('University of Virginia', 'VA'),
  ('University of Kansas Medical Center', 'KS'),
  ('University of Arizona', 'AZ'),
  ('Brown University', 'RI'),
  ('Roswell Park Comprehensive Cancer Center', 'NY'),

  -- Tier 6 (80-99 HCPs)
  ('Wake Forest University', 'NC'),
  ('City Of Hope National Medical Center', 'CA'),
  ('Columbia University', 'NY'),
  ('University of Colorado Denver', 'CO'),
  ('Broad Institute', 'MA'),
  ('Saint Louis University', 'MO'),
  ('University of Arkansas for Medical Sciences', 'AR'),
  ('University of California, Irvine', 'CA'),
  ('University Hospitals of Cleveland', 'OH'),
  ('Texas A&M University', 'TX'),
  ('Stanford Medicine', 'CA'),
  ('Vanderbilt University', 'TN'),
  ('The University of Texas Health Science Center at Houston', 'TX'),
  ('Pennsylvania State University', 'PA');


-- Step 3: Show what will be updated (pre-flight)
SELECT
  COUNT(*) FILTER (WHERE nppes_practice_state IS NULL) AS will_update,
  COUNT(*) AS total_us_publication_hcps_with_matched_institution
FROM hcps_v2 h
JOIN us_institution_to_state m
  ON h.institution_normalized = m.institution_normalized
WHERE h.cohort_classification IS NULL
  AND h.country = 'US';


-- Step 4: Apply the update
-- Only updates publication HCPs (cohort_classification IS NULL) where:
--   - institution matches one in our mapping
--   - country is US
--   - nppes_practice_state is currently NULL (don't overwrite real data)
UPDATE hcps_v2 h
SET nppes_practice_state = m.state,
    updated_at = NOW()
FROM us_institution_to_state m
WHERE h.institution_normalized = m.institution_normalized
  AND h.cohort_classification IS NULL
  AND h.country = 'US'
  AND h.nppes_practice_state IS NULL;


-- Step 5: Verify post-update state
SELECT
  COUNT(*) FILTER (WHERE nppes_practice_state IS NOT NULL) AS us_pub_hcps_with_state,
  COUNT(*) FILTER (WHERE nppes_practice_state IS NULL) AS us_pub_hcps_no_state,
  COUNT(*) AS us_pub_hcps_total
FROM hcps_v2
WHERE cohort_classification IS NULL
  AND country = 'US';


-- Step 6: State distribution check
SELECT
  nppes_practice_state,
  COUNT(*) AS hcps
FROM hcps_v2
WHERE cohort_classification IS NULL
  AND country = 'US'
  AND nppes_practice_state IS NOT NULL
GROUP BY nppes_practice_state
ORDER BY hcps DESC
LIMIT 20;
