/* ==== 02. SUSPECTED IDENTITY PAIRS ====
   Written 2026-09-09, before the colorectal workstream B run.

   WHAT THIS IS. Two records that may be the same human. Not a duplicate register --
   nothing here is asserted to be a duplicate, and nothing in this table merges anything.
   The name says suspected, and the name is the contract.

   WHY IT HAS TO EXIST BEFORE THE RUN. nppes_workstream_b_ingest.py creates HCP records
   from the NPPES registry and does not identity-hash the NPPES side. For colorectal it
   will mint 6,369 records, and 819 of them share a first+last name key with an existing
   publication-derived colorectal HCP who has no NPI. Those 819 twins are created by the
   run whatever we do; what is optional is whether we can find them afterwards.

   AND DEDUP WILL NOT FIND THEM. Measured: of 843 such pairs on the six-code set, 818 are
   invisible to dedup_detect at any cycle position. Its three strong signals are
   shared_openalex_id, shared_coauthors and same_institution; a registry-native record has
   no OpenAlex id, no co-authors, and build_hcp_payload sets no institution at all. The
   stub path needs the publication side to clear 100 career pubs or 50 linked pubs, and
   97% of this population does not. So the evidence exists exactly once, at the moment of
   creation, and then only here.

   THE 61 ARE THE SAME CLASS OF FINDING. The 2026-09-08 enrichment run hit 61 duplicate-NPI
   conflicts: a publication-derived HCP matched an NPI already held by another record. That
   is stronger evidence than anything dedup produces -- an exact NPI identity plus an exact
   name match -- and it currently exists only as prose inside nppes_enrichment_log_v2
   match_reason strings, recoverable by regex. It is backfilled below.

   A RECORD, NOT A QUEUE. No status column that implies work, no assignee, no priority.
   But shaped so a merge process could read it: both ids, the evidence, and a resolution
   column that only a resolver writes. */

BEGIN;

CREATE TABLE IF NOT EXISTS public.hcp_suspected_identity_pair_v1 (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /* The two sides, named for their PROVENANCE rather than their role, because which one
     "wins" a merge is a decision this table does not make. */
  registry_hcp_id          uuid REFERENCES public.hcps_v2(id) ON DELETE CASCADE,
  publication_hcp_id       uuid REFERENCES public.hcps_v2(id) ON DELETE CASCADE,

  shared_name_key          text NOT NULL,   -- dedup_detect's name_key(strip_initials(first))|name_key(last)
  shared_npi               text,            -- set only for the npi_conflict class
  registry_npi             text,
  registry_taxonomies      text[],

  /* The publication side's weight, captured AT DETECTION -- these move over time and the
     pair should stay readable against what was true when it was found. */
  publication_career_pubs  integer,
  publication_cohort       text,

  pair_class               text NOT NULL,   -- 'npi_conflict' | 'name_key_on_create'
  evidence                 text NOT NULL,   -- what paired them, in words
  detected_by              text NOT NULL,   -- the script that found it
  detected_at              timestamptz NOT NULL DEFAULT now(),

  /* Only a resolver writes these. NULL means nobody has looked, NOT that it is fine. */
  resolution               text,            -- 'merged' | 'distinct_people' | 'unresolvable'
  resolved_at              timestamptz,
  resolution_note          text,

  CONSTRAINT hcp_suspected_pair_class_vocab
    CHECK (pair_class IN ('npi_conflict', 'name_key_on_create')),
  CONSTRAINT hcp_suspected_pair_resolution_vocab
    CHECK (resolution IS NULL OR resolution IN ('merged', 'distinct_people', 'unresolvable')),
  /* A pair is the unordered fact "these two records may be one person". */
  CONSTRAINT hcp_suspected_pair_unique UNIQUE (registry_hcp_id, publication_hcp_id),
  CONSTRAINT hcp_suspected_pair_not_self CHECK (registry_hcp_id IS DISTINCT FROM publication_hcp_id)
);

COMMENT ON TABLE public.hcp_suspected_identity_pair_v1 IS
  'Pairs of hcps_v2 records that MAY be the same human. Suspected, not confirmed: nothing '
  'here is asserted to be a duplicate and nothing in this table merges anything. Written by '
  'nppes_workstream_b_ingest.py at record creation (name_key_on_create) and backfilled from '
  'targeted_nppes_enrichment.py duplicate-NPI conflicts (npi_conflict). Exists because '
  'dedup_detect cannot see this population: a registry-native record has no OpenAlex id, no '
  'co-authors and no institution, so none of its three strong signals can fire.';

COMMENT ON COLUMN public.hcp_suspected_identity_pair_v1.resolution IS
  'NULL means nobody has looked, not that the pair is fine.';

CREATE INDEX IF NOT EXISTS hcp_suspected_pair_unresolved_idx
  ON public.hcp_suspected_identity_pair_v1 (pair_class, detected_at)
  WHERE resolution IS NULL;
CREATE INDEX IF NOT EXISTS hcp_suspected_pair_pub_idx
  ON public.hcp_suspected_identity_pair_v1 (publication_hcp_id);

GRANT SELECT ON public.hcp_suspected_identity_pair_v1 TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.hcp_suspected_identity_pair_v1 TO service_role;

COMMIT;


/* ==== BACKFILL: the 61 duplicate-NPI conflicts from the 2026-09-08 enrichment run ====
   Reconstructed from nppes_enrichment_log_v2.match_reason, which is the only place this
   currently exists. The NPI is parsed out of
   'Duplicate NPI conflict: NPI 1234567890 already exists on another hcp_id.'

   SIDES: the log row's hcp_id is the PUBLICATION side (it was an enrichment candidate, so
   it had publications and no NPI). The record already holding that NPI is the REGISTRY
   side -- 57 of the 61 are pub-less registry shells, 4 are publication-derived fragments,
   and the pair_class does not distinguish them because the evidence is the same either way. */

BEGIN;

INSERT INTO public.hcp_suspected_identity_pair_v1
  (registry_hcp_id, publication_hcp_id, shared_name_key, shared_npi, registry_npi,
   publication_career_pubs, publication_cohort, pair_class, evidence, detected_by, detected_at)
SELECT
  holder.id,
  pub.id,
  lower(split_part(btrim(pub.first_name), ' ', 1)) || '|' || lower(btrim(pub.last_name)),
  d.npi,
  d.npi,
  coalesce(pub.total_career_pubs, 0),
  (SELECT string_agg(DISTINCT k.cohort, '/')
     FROM public.hcp_cohort_classification_v2 k
     JOIN public.therapeutic_areas ta ON ta.id = k.therapeutic_area_id
                                     AND ta.slug = 'colorectal-cancer'
    WHERE k.hcp_id = pub.id),
  'npi_conflict',
  'targeted_nppes_enrichment matched this publication-derived HCP to NPI ' || d.npi ||
    ', which is already held by another hcps_v2 record with the same name. Exact NPI '
    'identity plus exact first+last match -- stronger evidence than any dedup_detect signal.',
  'targeted_nppes_enrichment.py (2026-09-08 run)',
  d.enriched_at
FROM (
  SELECT l.hcp_id, l.enriched_at,
         substring(l.match_reason FROM 'NPI ([0-9]{10})') AS npi
  FROM public.nppes_enrichment_log_v2 l
  WHERE l.enriched_at >= '2026-09-07'
    AND l.match_reason LIKE 'Duplicate NPI conflict%'
) d
JOIN public.hcps_v2 pub    ON pub.id = d.hcp_id
JOIN public.hcps_v2 holder ON holder.npi_number = d.npi
WHERE holder.id <> pub.id
ON CONFLICT (registry_hcp_id, publication_hcp_id) DO NOTHING;

COMMIT;


/* ==== VERIFY ==== expected: 61 rows, all pair_class='npi_conflict', all unresolved */
SELECT pair_class, count(*) AS pairs,
       count(*) FILTER (WHERE resolution IS NULL) AS unresolved,
       count(DISTINCT publication_hcp_id) AS distinct_publication_side
FROM public.hcp_suspected_identity_pair_v1
GROUP BY 1 ORDER BY 1;
