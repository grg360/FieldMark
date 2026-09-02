/* ============================================================================
   RESEARCH THEMES: THE TAG BECOMES A COLUMN
   2026-09-02

   hcp_research_themes_v2.therapeutic_area holds a display label, an acronym and
   an upper-slug. The authoritative value lives in a Python dict
   (extract_research_themes.py TA_CONFIGS[slug]['tag']) that the frontend cannot
   read, so three read sites each invented their own derivation. This moves the
   tag to therapeutic_areas.themes_tag, which both sides can read.

   Run the blocks in order. Block 2 and block 7 are SELECTs and must be read,
   not just executed. Nothing here is destructive; block 1 is additive and
   blocks 3 and 4 write only where themes_tag IS NULL.
   ============================================================================ */


/* ==== 1. ADD THE COLUMN ====
   Nullable at first, on purpose: the NOT NULL goes on in block 6, after the
   backfill has proved every live TA can be given a value. */

ALTER TABLE public.therapeutic_areas
  ADD COLUMN IF NOT EXISTS themes_tag text;


/* ==== 2. PRE-CHECK, READ THIS BEFORE RUNNING BLOCK 3 ====
   The backfill derives the mapping instead of hand-writing it, so the
   derivation has to be proved 1:1 first. Every row must show matches = 1.

   A row showing matches = 0 means a stored tag names no live TA. A row showing
   matches > 1 means the tag is ambiguous and block 3 would pick arbitrarily.
   Either way: STOP, and resolve that tag by hand.

   Measured 2026-09-02: exactly three tags, each matching exactly one TA.
     Atopic Dermatitis  -> atopic-dermatitis
     COLORECTAL-CANCER  -> colorectal-cancer
     NSCLC              -> nsclc */

SELECT m.tag,
       count(ta.id)              AS matches,
       string_agg(ta.slug, ', ') AS slugs
FROM (SELECT DISTINCT therapeutic_area AS tag FROM public.hcp_research_themes_v2) m
LEFT JOIN public.therapeutic_areas ta
  ON lower(replace(m.tag, '-', ' ')) IN (lower(ta.name), lower(replace(ta.slug, '-', ' ')))
GROUP BY m.tag
ORDER BY m.tag;


/* ==== 3. BACKFILL FROM THE VALUES ACTUALLY STORED ====
   Source of truth is hcp_research_themes_v2 itself, not the three literals
   named in the header comment. If a fourth tag was written since, this picks
   it up and block 2 would have shown it. Expect 3 rows updated. */

UPDATE public.therapeutic_areas ta
SET themes_tag = m.tag
FROM (SELECT DISTINCT therapeutic_area AS tag FROM public.hcp_research_themes_v2) m
WHERE ta.themes_tag IS NULL
  AND lower(replace(m.tag, '-', ' ')) IN (lower(ta.name), lower(replace(ta.slug, '-', ' ')));


/* ==== 4. THE TAs THAT HAVE NEVER BEEN EXTRACTED ====
   These have no stored tag to measure, so a convention has to be chosen.
   upper(slug) is chosen because it is what bucket_themes.py computes
   independently (ta.upper()), so a future extraction of one of these TAs
   agrees with the bucketing step by construction rather than by luck. It is
   also what the two most recent TAs already spell.

   This does NOT retag atopic-dermatitis, whose stored tag is
   'Atopic Dermatitis' and whose divergence from ATOPIC-DERMATITIS is the known
   AD bucketing defect. That defect is recorded, not silently rewritten here:
   changing it would orphan 3,499 existing rows.

   Expect 5 rows updated: hepatology, immunology, mesothelioma, oncology,
   rare-disease. */

UPDATE public.therapeutic_areas
SET themes_tag = upper(slug)
WHERE themes_tag IS NULL;


/* ==== 5. ONE TAG, ONE TA ====
   The frontend predicate is .eq("therapeutic_area", themes_tag). If two TAs
   ever shared a tag, that predicate would silently return the other TA's
   themes, which is the exact defect this change exists to close. */

CREATE UNIQUE INDEX IF NOT EXISTS therapeutic_areas_themes_tag_key
  ON public.therapeutic_areas (themes_tag);


/* ==== 6. NO TA WITHOUT A TAG ====
   A null themes_tag renders as an empty RESEARCH INVOLVEMENT section with no
   explanation, which reads as broken. Failing at TA-creation time is better.

   Consequence to know about: any future INSERT INTO therapeutic_areas must
   supply themes_tag. One such statement exists in the repo
   (migrations/2026_08_14_mesothelioma_corpus_separation.sql:37) and is already
   applied, so nothing in tree breaks. */

ALTER TABLE public.therapeutic_areas
  ALTER COLUMN themes_tag SET NOT NULL;


/* ==== 7. VERIFY, AND READ THE OUTPUT ====
   Every live TA must appear with a non-null themes_tag.

   theme_rows is the count under that tag. Non-zero for nsclc,
   atopic-dermatitis and colorectal-cancer; zero for the other five, which is
   correct and means "never extracted", not "miskeyed".

   tag_equals_upper_slug is FALSE for atopic-dermatitis only. That is the known
   bucketing defect, carried forward deliberately, not introduced here. */

SELECT ta.slug,
       ta.name,
       ta.themes_tag,
       (ta.themes_tag = upper(ta.slug)) AS tag_equals_upper_slug,
       (SELECT count(*) FROM public.hcp_research_themes_v2 t
         WHERE t.therapeutic_area = ta.themes_tag) AS theme_rows,
       (SELECT count(DISTINCT t.hcp_id) FROM public.hcp_research_themes_v2 t
         WHERE t.therapeutic_area = ta.themes_tag) AS theme_hcps
FROM public.therapeutic_areas ta
ORDER BY theme_rows DESC, ta.slug;


/* ==== 8. ORPHAN CHECK ====
   Must return zero rows. A row here is a stored tag that block 3 failed to
   place on any TA, which would mean those theme rows are unreachable from the
   frontend predicate. */

SELECT t.therapeutic_area AS orphan_tag, count(*) AS rows
FROM public.hcp_research_themes_v2 t
WHERE NOT EXISTS (SELECT 1 FROM public.therapeutic_areas ta
                   WHERE ta.themes_tag = t.therapeutic_area)
GROUP BY t.therapeutic_area;
