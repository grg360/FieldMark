-- Mesothelioma corpus separation — mark, do not delete.
--
-- WHY: config/therapeutic_areas/nsclc.json's PubMed query ORed unanchored agent
-- and biomarker terms ("PD-L1", "pembrolizumab", "nivolumab", "durvalumab", ...)
-- with no disease conjunct. Mesothelioma immunotherapy trials (CheckMate 743,
-- DETERMINE, IFCT-1501) match those terms on Title/Abstract without ever naming
-- a lung cancer, so they were ingested and correctly tagged NSCLC by the
-- pipeline's own rules. ~1,435 publications in the NSCLC corpus are mesothelioma
-- with no NSCLC content.
--
-- The query itself is fixed in the same change set (nsclc.json, anchoring pass).
-- WITHOUT that fix these rows return on the next reingest; this migration only
-- corrects what is already held.
--
-- NOTHING IS DELETED. Not a publication, not a tag row. The incorrect NSCLC
-- association is retained and MARKED, so the decision is inspectable, auditable
-- and reversible by a single UPDATE (see ROLLBACK at the foot of this file).
--
-- NOT APPLIED. Authored for review. Applying this changes publication counts,
-- which feed hcp_publication_leadership_v2, hcp_scientific_momentum_v1 and
-- hcp_cohort_classification_v2 — i.e. BOARD MEMBERSHIP AND RANKS ON BOTH
-- COHORTS. Do not apply until the before/after board diff has been run and
-- accepted. See the CONSUMERS note below.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Mesothelioma as a real indication.
-- ─────────────────────────────────────────────────────────────────────────────
-- Modelled as a therapeutic_areas row rather than a bare string label so the
-- existing many-to-many tag table carries it with no new mechanism, and so a
-- future mesothelioma surface is possible instead of foreclosed. Parent is
-- Oncology, matching NSCLC.
--
-- The id is HARDCODED, not gen_random_uuid(): the migration must be idempotent,
-- and downstream config needs a stable uuid to reference.
INSERT INTO therapeutic_areas (id, name, slug, parent_ta_id, ta_level)
VALUES (
  'd7f3a1c8-6b2e-4e17-9a54-3c81b0e2f9d4',
  'Mesothelioma',
  'mesothelioma',
  '095bc902-c3dc-48a3-8167-52ee55795d60',  -- Oncology
  'indication'
)
ON CONFLICT (id) DO NOTHING;

-- therapeutic_areas has no UNIQUE on slug (PK is id alone), so guard the slug
-- separately — a second row with slug='mesothelioma' would silently fork every
-- slug-based lookup.
DO $$
BEGIN
  IF (SELECT count(*) FROM therapeutic_areas WHERE slug = 'mesothelioma') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 mesothelioma TA row, found %',
      (SELECT count(*) FROM therapeutic_areas WHERE slug = 'mesothelioma');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The exclusion marker.
-- ─────────────────────────────────────────────────────────────────────────────
-- One mechanism, on the association row, rather than a parallel exclusion table
-- that all thirteen consumers would have to learn independently. Default false
-- means every existing row keeps its current meaning; only rows this migration
-- touches change behaviour.
ALTER TABLE public.publication_therapeutic_areas_v2
  ADD COLUMN IF NOT EXISTS is_excluded      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclusion_reason text;

COMMENT ON COLUMN public.publication_therapeutic_areas_v2.is_excluded IS
  'True when this publication<->TA association is retained for audit but must '
  'not count toward the TA. Consumers filter with: AND NOT is_excluded. '
  'Never delete the row — the association is evidence of how it was ingested.';

COMMENT ON COLUMN public.publication_therapeutic_areas_v2.exclusion_reason IS
  'Free-text provenance for is_excluded. Required whenever is_excluded is true.';

-- A reason is mandatory whenever the flag is set: an unexplained exclusion is
-- indistinguishable from a bug six months later.
ALTER TABLE public.publication_therapeutic_areas_v2
  DROP CONSTRAINT IF EXISTS pta_v2_exclusion_reason_required;
ALTER TABLE public.publication_therapeutic_areas_v2
  ADD CONSTRAINT pta_v2_exclusion_reason_required
  CHECK (NOT is_excluded OR exclusion_reason IS NOT NULL);

-- Consumers all read the NOT-excluded side; index that, not the rare side.
CREATE INDEX IF NOT EXISTS idx_pub_ta_v2_active
  ON public.publication_therapeutic_areas_v2 (therapeutic_area_id, publication_id)
  WHERE NOT is_excluded;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The detector.
-- ─────────────────────────────────────────────────────────────────────────────
-- MEASURED, not assumed. Three candidates were tested against the live corpus:
--
--   A. MeSH-only     "Mesothelioma"[MeSH] AND NOT "Lung Neoplasms"[MeSH]   ->   498
--   B. title-only    title ~ mesotheli AND no NSCLC term in title          -> 1,319
--   C. union         (MeSH meso OR title meso) AND no NSCLC term in title  -> 1,435
--
-- A WAS REJECTED. MeSH indexes pleural mesothelioma under Lung Neoplasms very
-- often: 824 of the 1,319 title-identified mesothelioma-only papers ALSO carry
-- lung-cancer MeSH, so the "meso MeSH AND NOT lung MeSH" rule finds only 464 of
-- them and misses 855. MeSH lung headings cannot serve as the disease-context
-- discriminator here.
--
-- C IS USED. It keeps title as the context discriminator (which is what makes B
-- work) and adds MeSH purely as extra RECALL, catching 116 genuine mesothelioma
-- papers whose titles never spell the word — "MPM", "pleural subtypes",
-- asbestos-related disease, CRS+HIPEC series.
--
-- MESO-ONLY, BY CONSTRUCTION. The gate is "no NSCLC term in the title", so the
-- 53 genuinely dual-topic papers ("CAR T-cell therapy for lung cancer and
-- malignant pleural mesothelioma", the NCI consensus report) are NOT marked.
-- Verified: 0 of 53 selected. They remain full NSCLC corpus members.
CREATE TEMP TABLE meso_marked ON COMMIT DROP AS
SELECT p.id AS publication_id
FROM publications_v2 p
JOIN publication_therapeutic_areas_v2 t
  ON t.publication_id = p.id
 AND t.therapeutic_area_id = 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'  -- NSCLC
WHERE
  -- mesothelioma present, by either signal
  (
    lower(coalesce(p.title, '')) LIKE '%mesotheli%'
    OR EXISTS (
      SELECT 1 FROM unnest(coalesce(p.mesh_terms, ARRAY[]::text[])) m
      WHERE lower(m) LIKE '%mesotheli%'
    )
  )
  -- ...and no NSCLC content in the title. This clause is what makes it MESO-ONLY.
  AND NOT (
       lower(coalesce(p.title, '')) LIKE '%non-small cell%'
    OR lower(coalesce(p.title, '')) LIKE '%non small cell%'
    OR lower(coalesce(p.title, '')) LIKE '%nsclc%'
    OR lower(coalesce(p.title, '')) LIKE '%lung adenocarcinoma%'
    OR lower(coalesce(p.title, '')) LIKE '%lung squamous%'
    OR lower(coalesce(p.title, '')) LIKE '%large cell lung%'
    OR lower(coalesce(p.title, '')) LIKE '%lung cancer%'
    OR lower(coalesce(p.title, '')) LIKE '%lung carcinoma%'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Additive mesothelioma tag.
-- ─────────────────────────────────────────────────────────────────────────────
-- Purely additive — creates the correct association. Runs BEFORE the exclusion
-- so that at no point is a publication left with no TA at all.
INSERT INTO publication_therapeutic_areas_v2 (publication_id, therapeutic_area_id, source)
SELECT m.publication_id,
       'd7f3a1c8-6b2e-4e17-9a54-3c81b0e2f9d4',
       'meso_reclass_2026_08_14'
FROM meso_marked m
ON CONFLICT (publication_id, therapeutic_area_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Mark the incorrect NSCLC association.
-- ─────────────────────────────────────────────────────────────────────────────
-- The row survives. Only its is_excluded flag changes.
UPDATE publication_therapeutic_areas_v2 t
SET is_excluded      = true,
    exclusion_reason = 'mesothelioma-only; admitted by unanchored agent terms in '
                       'nsclc.json pubmed query prior to the 2026-08-14 anchoring fix'
FROM meso_marked m
WHERE t.publication_id = m.publication_id
  AND t.therapeutic_area_id = 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'
  AND NOT t.is_excluded;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Assertions. Any failure aborts the whole migration.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_marked      integer;
  v_excluded    integer;
  v_meso_tagged integer;
  v_dual_hit    integer;
  v_orphaned    integer;
BEGIN
  SELECT count(*) INTO v_marked FROM meso_marked;

  SELECT count(*) INTO v_excluded
  FROM publication_therapeutic_areas_v2
  WHERE therapeutic_area_id = 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d' AND is_excluded;

  SELECT count(*) INTO v_meso_tagged
  FROM publication_therapeutic_areas_v2
  WHERE therapeutic_area_id = 'd7f3a1c8-6b2e-4e17-9a54-3c81b0e2f9d4';

  -- The 53 dual-topic papers must be untouched.
  SELECT count(*) INTO v_dual_hit
  FROM publications_v2 p
  JOIN publication_therapeutic_areas_v2 t
    ON t.publication_id = p.id
   AND t.therapeutic_area_id = 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'
  WHERE lower(coalesce(p.title, '')) LIKE '%mesotheli%'
    AND (   lower(coalesce(p.title, '')) LIKE '%non-small cell%'
         OR lower(coalesce(p.title, '')) LIKE '%non small cell%'
         OR lower(coalesce(p.title, '')) LIKE '%nsclc%'
         OR lower(coalesce(p.title, '')) LIKE '%lung adenocarcinoma%'
         OR lower(coalesce(p.title, '')) LIKE '%lung squamous%'
         OR lower(coalesce(p.title, '')) LIKE '%large cell lung%'
         OR lower(coalesce(p.title, '')) LIKE '%lung cancer%'
         OR lower(coalesce(p.title, '')) LIKE '%lung carcinoma%')
    AND t.is_excluded;

  -- No publication may be left with zero live TA associations.
  SELECT count(*) INTO v_orphaned
  FROM meso_marked m
  WHERE NOT EXISTS (
    SELECT 1 FROM publication_therapeutic_areas_v2 t
    WHERE t.publication_id = m.publication_id AND NOT t.is_excluded
  );

  RAISE NOTICE 'meso_marked=%  nsclc_rows_excluded=%  meso_tag_rows=%  dual_wrongly_excluded=%  orphaned=%',
    v_marked, v_excluded, v_meso_tagged, v_dual_hit, v_orphaned;

  IF v_excluded <> v_marked THEN
    RAISE EXCEPTION 'Exclusion count % <> detector count %', v_excluded, v_marked;
  END IF;
  IF v_meso_tagged < v_marked THEN
    RAISE EXCEPTION 'Mesothelioma tag rows % < detector count %', v_meso_tagged, v_marked;
  END IF;
  IF v_dual_hit <> 0 THEN
    RAISE EXCEPTION 'Dual-topic papers wrongly excluded: %', v_dual_hit;
  END IF;
  IF v_orphaned <> 0 THEN
    RAISE EXCEPTION 'Publications left with no live TA association: %', v_orphaned;
  END IF;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONSUMERS — none are updated by this migration.
-- ─────────────────────────────────────────────────────────────────────────────
-- Applying the migration alone changes NOTHING downstream: every consumer still
-- reads the tag row, which still exists. Behaviour changes only when each is
-- given `AND NOT is_excluded`. That is a deliberate second step so the corpus
-- change and the scoring change can be diffed independently.
--
-- Scoring — these move board membership and ranks:
--   scripts/score/scientific_momentum_scoring.py     (feeds pub_velocity_delta,
--                                                     the Rising eligibility gate)
--   scripts/score/publication_leadership_scoring.py  (senior_pub_count; also quoted
--                                                     verbatim in narrative prose)
--   scripts/score/emergence_scoring.py
--   scripts/score/network_centrality_scoring.py
--   scripts/classify/cohort_classification_v2.py     (ta_pubs -> cohort assignment,
--                                                     upstream of BOTH boards)
-- Aggregation / classification:
--   scripts/aggregate/compute_top_collaborators.py
--   scripts/classify/extract_research_themes.py
--   scripts/label_pub_themes.py
--   scripts/dedup/dedup_detect.py
-- Writer:
--   scripts/ingest/pubmed_pipeline.py   (must also stamp is_excluded=false)
-- Frontend:
--   frontend/src/lib/api.ts, frontend/src/lib/theWeek.ts
--
-- Also pending, deliberately out of scope here:
--   extract_scientific_positions.py TOP_PAPERS_SQL has no TA join at all and will
--   still select mesothelioma (and hepatology) papers until it gains both the
--   positive TA join and `AND NOT is_excluded`.

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (reversible in full — nothing was destroyed)
-- ─────────────────────────────────────────────────────────────────────────────
-- BEGIN;
--   UPDATE publication_therapeutic_areas_v2
--   SET is_excluded = false, exclusion_reason = NULL
--   WHERE therapeutic_area_id = 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'
--     AND exclusion_reason LIKE 'mesothelioma-only;%';
--
--   DELETE FROM publication_therapeutic_areas_v2
--   WHERE therapeutic_area_id = 'd7f3a1c8-6b2e-4e17-9a54-3c81b0e2f9d4'
--     AND source = 'meso_reclass_2026_08_14';
--
--   -- The TA row and the two columns are additive and harmless; drop only if
--   -- the whole approach is abandoned:
--   -- DELETE FROM therapeutic_areas WHERE id = 'd7f3a1c8-6b2e-4e17-9a54-3c81b0e2f9d4';
--   -- ALTER TABLE publication_therapeutic_areas_v2
--   --   DROP COLUMN is_excluded, DROP COLUMN exclusion_reason;
-- COMMIT;
