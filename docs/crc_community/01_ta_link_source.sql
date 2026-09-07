/* ==== 01. PROVENANCE ON THE TA LINK ====
   CRC_COMMUNITY_BUILD.md phase 2. Must be applied BEFORE the first
   taxonomy-derived link is written, not after.

   A row in hcp_therapeutic_areas_v2 is a claim: *this physician is a <TA> HCP.*
   Today the table records who and when (assigned_at) but not HOW, so a link
   backed by forty colorectal papers and a link asserted from a specialty code
   are byte-identical. After phase 3 the CRC population would be overwhelmingly
   the second kind with nothing -- boards included -- able to tell them apart.

   This is institution_state_source again, for the same reason.

   THE VOCABULARY IS TWO VALUES BECAUSE THERE ARE TWO WRITERS.
     'publication'     scripts/classify/ta_tagging_rebuild_v2.py, which builds
                       links from publication concepts
     'nppes_taxonomy'  scripts/ingest/nppes_workstream_b_ingest.py, which
                       asserts them from an NPPES taxonomy code and nothing else
   NULL is UNKNOWN. It is never written deliberately and it is not a default.
   Nothing else writes this table (pubmed_pipeline.py declares the table name but
   its header states it does not write it; openalex_author_enrichment.py and
   trials_pipeline.py only read it), so a third value would be wider than the
   evidence supports. */

BEGIN;

ALTER TABLE public.hcp_therapeutic_areas_v2
  ADD COLUMN IF NOT EXISTS source text;

COMMENT ON COLUMN public.hcp_therapeutic_areas_v2.source IS
  'How this TA link was derived. publication = a publication of this HCP is '
  'tagged to this TA. nppes_taxonomy = asserted from an NPPES taxonomy code by '
  'nppes_workstream_b_ingest.py, with no publication, claim or drug behind it. '
  'NULL = unknown, not assumed.';

/* THE CONSTRAINT, AND WHAT IT DOES NOT SAY.

   The rule is "source is one of two known values, OR it is unknown". It is NOT
   "every link has a known source" -- 8,320 rows are genuinely undetermined and
   stay NULL, and a constraint forbidding NULL could not be created at all. The
   name says the weaker, true thing. A constraint whose name overstates what it
   checks is the same class of defect as a column whose name overstates what it
   holds; that is the lesson of 18_replace_constraint.sql and it applies here.

   NO NOT VALID. It is not needed and it would be a trap: NOT VALID does not
   police rows at rest but IS re-checked on any row a later write touches, which
   is how nppes_state_implies_npi aborted the city clear in 13b_clear_city.sql.
   Every one of the 392,364 rows satisfies this at creation (all NULL), so it
   validates immediately and is enforced from that moment for every future write.
   There is no cohort of grandfathered rows waiting to detonate. */
ALTER TABLE public.hcp_therapeutic_areas_v2
  DROP CONSTRAINT IF EXISTS hcp_ta_v2_source_known_value_or_unknown;
ALTER TABLE public.hcp_therapeutic_areas_v2
  ADD CONSTRAINT hcp_ta_v2_source_known_value_or_unknown
  CHECK (source IS NULL OR source IN ('publication', 'nppes_taxonomy'));

COMMIT;


/* ==== BACKFILL ====
   Two UPDATEs, in this order, each on POSITIVE evidence only. Anything neither
   statement touches stays NULL, and NULL is the honest answer: it means the
   evidence does not settle it, not that we have not looked.

   THIS IS AN UPDATE OF A NEW COLUMN, NOT AN INSERT. No row enters
   hcp_therapeutic_areas_v2 here. The script remains the only path into the
   table -- see CRC_COMMUNITY_BUILD.md, "WHAT THIS BUILD DELIBERATELY DOES NOT
   DO". */

BEGIN;

/* -- 1. publication-derived --------------------------------------------------
   Direct positive evidence: a publication authored by this HCP is tagged to
   THIS TA and not excluded. Expected ~343,925 rows. */
UPDATE public.hcp_therapeutic_areas_v2 t
SET source = 'publication'
WHERE t.source IS NULL
  AND EXISTS (
    SELECT 1
      FROM public.publication_authors_v2 pa
      JOIN public.publication_therapeutic_areas_v2 pt
        ON pt.publication_id = pa.publication_id
       AND pt.therapeutic_area_id = t.therapeutic_area_id
       AND COALESCE(pt.is_excluded, false) = false
     WHERE pa.hcp_id = t.hcp_id
  );

/* -- 2. taxonomy-derived -----------------------------------------------------
   Workstream B left no log row, so there is no direct record that it wrote a
   given link. This is an ELIMINATION, and it is only run where the elimination
   is airtight: the HCP has an NPI, has zero publications anywhere in the corpus
   and zero career pubs. Such a person cannot have been reached by
   ta_tagging_rebuild_v2.py, which builds links from publications. Workstream B
   is the only writer left.

   Deliberately NOT included: links whose HCP has publications but none tagged to
   this TA (8,219 rows). Those could equally be a taxonomy assertion onto a
   publishing physician or a publication tag rewritten since -- three of the
   backup tables in this schema are evidence that re-tagging happens. They stay
   NULL. Expected ~40,119 rows. */
UPDATE public.hcp_therapeutic_areas_v2 t
SET source = 'nppes_taxonomy'
FROM public.hcps_v2 h
WHERE h.id = t.hcp_id
  AND t.source IS NULL
  AND h.npi_number IS NOT NULL
  AND COALESCE(h.total_career_pubs, 0) = 0
  AND NOT EXISTS (
    SELECT 1 FROM public.publication_authors_v2 pa WHERE pa.hcp_id = t.hcp_id
  );

COMMIT;


/* ==== VERIFY ====
   Expected, measured read-only 2026-09-06 against live:
     publication      343,925
     nppes_taxonomy    40,119
     (null)             8,320
     total            392,364 */

SELECT COALESCE(t.source, '(null)') AS source, count(*) AS rows
FROM public.hcp_therapeutic_areas_v2 t
GROUP BY 1
ORDER BY 2 DESC;

SELECT ta.slug,
       count(*)                                          AS links,
       count(*) FILTER (WHERE t.source = 'publication')    AS publication,
       count(*) FILTER (WHERE t.source = 'nppes_taxonomy') AS nppes_taxonomy,
       count(*) FILTER (WHERE t.source IS NULL)            AS unknown
FROM public.hcp_therapeutic_areas_v2 t
JOIN public.therapeutic_areas ta ON ta.id = t.therapeutic_area_id
GROUP BY 1
ORDER BY 2 DESC;

/* No new grants are required: source is a column on an existing table and the
   table's ACL already covers it. Confirm anyway -- a lost read renders as an
   empty board, not as an error. */
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'hcp_therapeutic_areas_v2'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;
