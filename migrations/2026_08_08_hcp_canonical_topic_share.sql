-- 2026_08_08 — per-HCP canonical-topic shares for the ledger drawer's
-- practice-differentiation layer.
--
-- Source chain: publication_authors_v2 -> publication_theme_v1 (the
-- label_pub_themes.py labeler, 64,155 labels / 46,264 pubs at write time)
-- -> theme_canonical_v1 (25 authored NSCLC classes). NOT the empty
-- theme_to_canonical_v1 string-mapping route — pub-level labels already
-- exist, so per-HCP shares are a derivation, not a new pipeline.
--
-- SHAPE (one row per hcp x TA x canonical class):
--   hcp_id, therapeutic_area_id, canonical_id, canonical_name, short_name,
--   labeled_pubs_in_class    - distinct labeled pubs of theirs in this class
--   primary_pubs_in_class    - subset where the label is is_primary
--   total_labeled_pubs       - distinct labeled pubs of theirs, ANY class
--                              (the drawer's low-corpus floor input)
--   share                    - labeled_pubs_in_class / total_labeled_pubs
--
-- HONESTY NOTES for consumers:
--   * Publications carry MULTIPLE labels (64k labels on 46k pubs), so an
--     HCP's shares across classes sum to MORE than 1. Render as "n of m
--     labeled publications", never as a pie.
--   * The denominator is LABELED pubs only — unlabeled work is invisible
--     here; the drawer's floor should read total_labeled_pubs, not career
--     pub count.
--   * LATERAL formulation on purpose: hcp_id pushes down (measured 252ms
--     single-HCP). Designed for per-HCP drawer reads; a full-corpus scan
--     of this view is NOT the intended access path.

CREATE OR REPLACE VIEW public.hcp_canonical_topic_share_v1 AS
SELECT pa.hcp_id,
       pt.therapeutic_area_id,
       tc.id AS canonical_id,
       tc.canonical_name,
       tc.short_name,
       COUNT(DISTINCT pt.publication_id) AS labeled_pubs_in_class,
       COUNT(DISTINCT pt.publication_id) FILTER (WHERE pt.is_primary) AS primary_pubs_in_class,
       t.total_labeled_pubs,
       ROUND(COUNT(DISTINCT pt.publication_id)::numeric / t.total_labeled_pubs, 4) AS share
FROM publication_authors_v2 pa
JOIN publication_theme_v1 pt ON pt.publication_id = pa.publication_id
JOIN theme_canonical_v1 tc ON tc.id = pt.canonical_id
JOIN LATERAL (
  SELECT COUNT(DISTINCT pt2.publication_id) AS total_labeled_pubs
  FROM publication_authors_v2 pa2
  JOIN publication_theme_v1 pt2 ON pt2.publication_id = pa2.publication_id
  WHERE pa2.hcp_id = pa.hcp_id
    AND pt2.therapeutic_area_id = pt.therapeutic_area_id
) t ON true
GROUP BY pa.hcp_id, pt.therapeutic_area_id, tc.id, tc.canonical_name, tc.short_name, t.total_labeled_pubs;

GRANT SELECT ON public.hcp_canonical_topic_share_v1 TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
