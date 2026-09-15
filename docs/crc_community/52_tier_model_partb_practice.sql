/* ==== 52. partb_practice_v1 -- THE CRC PART B PRACTICE-PATTERN TIER MODEL ====
   The third tier model. Blocks 40 and 41 are the measurement; this is the
   implementation, and the composite is theirs unchanged:

       anchored    a VEGF code AND a backbone (oxaliplatin OR irinotecan) AND a
                   fluoropyrimidine, same hcp_id, same program_year, AND the
                   Med-Onc / Heme-Onc taxonomy gate
       supported   a backbone AND a fluoropyrimidine, no VEGF, same year, gated
       candidate   no Part B pattern, but a hcp_part_d_oncology_v1 row exists
       unresolved  neither

   SAME hcp_id + SAME program_year. This is a PRACTICE fingerprint, not a
   regimen: co-occurrence on a provider-year does not mean co-administration to
   a patient, and nothing downstream may claim it does. The tier words do not
   say "this physician gave FOLFOX"; they say "this physician's Part B year
   looks like colorectal practice".

   THIS DOES NOT CHANGE WHO IS ON THE BOARD. community_board_v1.qualifies is
   `patient_volume > 0 OR EXISTS(hcp_part_d_oncology_v1 row)` and never reads
   evidence_tier, so the 4,794 is untouched. What changes is what those 4,794
   carry. Block 53 verifies rather than assuming it.

   candidate AND unresolved KEEP THE partd_presence_v1 MEANINGS EXACTLY -- the
   same EXISTS against hcp_part_d_oncology_v1, character for character. Nobody
   on the board today loses standing; 4,474 of the 4,794 stay exactly where they
   are and 320 move up.

   ------------------------------------------------------------------------
   WHY THE VIEW IS REPLACED AND NOT DROPPED. Block 26 opened with
   DROP VIEW IF EXISTS because nothing depended on it yet. community_board_v1
   (block 27) now does, so a DROP would fail on the dependency -- and a CASCADE
   would silently take the board with it. CREATE OR REPLACE VIEW keeps the
   dependency intact and carries the grants forward, at the cost of requiring
   the column list to stay identical. It does: the same 15 columns in the same
   order with the same types. Branch 3 is added; branches 1 and 2 are
   transcribed from the live definition unchanged.

   BRANCH 2 STAYS EVEN THOUGH NO TA USES IT after this file runs. It is a
   working model, block 25's CHECK still admits it, and deleting a branch
   because today's two TAs happen not to point at it is how a dispatcher
   quietly becomes a CASE. It costs one UNION ALL arm over zero rows.
   ------------------------------------------------------------------------

   THE CODE LISTS ARE DATA, NOT LITERALS. Branch 3 reads pattern_role from
   ta_hcpcs_codes (block 51). No HCPCS code is spelled in this body -- a code
   list in a view body is the same defect as a slug in a function body: it makes
   the model unreadable from the data and unchangeable without a DDL deploy.

   never_upgrades IS ENFORCED AS A HARD STOP, not assumed away. J0640 and 96416
   carry pattern_role 'corroborator', so they could not satisfy a limb in any
   case; the `NOT k.never_upgrades` predicate is written anyway so the
   prohibition lives in the code that promotes, where a future role would also
   meet it, rather than depending on a role vocabulary staying tidy.

   valid_from / valid_to ARE APPLIED AT YEAR GRANULARITY, which is the finest
   the claims carry -- hcp_hcpcs_detail has program_year and no date. A code
   billable from 2023-04-01 is admitted for program year 2023, because a 2023
   claim can fall after April. What it stops is a 2021 or 2022 row for a code
   that did not exist then, which is the hindsight error the column was added
   for.

   THE ONE LITERAL SET LEFT IN THIS BODY IS THE TAXONOMY GATE, and that is worth
   naming rather than letting it pass. 207RX0202X, 207RH0000X and 207RH0003X are
   a SPECIALTY vocabulary, not per-TA clinical content, and ta_evidence_tier_config
   has no column for them today. Adding one for a single consumer would be
   guessing at the shape a second composite TA needs. Logged as an amendment;
   when a second TA gets a composite, the gate moves to config alongside
   pattern_role and this comment comes out. */


/* ---- 1. THE VOCABULARY GAINS A THIRD MODEL ----
   Block 25 chose a CHECK over an enum for exactly this moment, and said so:
   "adding a third model is one ALTER rather than a type migration". One ALTER.
   The nsclc_v1 singleton index is NOT touched -- it guards branch 1 and has
   nothing to do with this model. */
ALTER TABLE public.ta_evidence_tier_config
  DROP CONSTRAINT IF EXISTS ta_evidence_tier_config_known_model;
ALTER TABLE public.ta_evidence_tier_config
  ADD CONSTRAINT ta_evidence_tier_config_known_model
  CHECK (tier_model IN ('nsclc_v1', 'partd_presence_v1', 'partb_practice_v1'));

COMMENT ON COLUMN public.ta_evidence_tier_config.tier_model IS
  'nsclc_v1 = five-tier lung ladder, implemented by hcp_nsclc_evidence_tier_v1, singleton. '
  'partd_presence_v1 = two tiers, candidate if the HCP has any hcp_part_d_oncology_v1 row '
  'else unresolved. partb_practice_v1 = four tiers from a same-provider/same-year Part B '
  'co-occurrence composite (roles in ta_hcpcs_codes.pattern_role) over a Med-Onc/Heme-Onc '
  'taxonomy gate, falling back to the partd_presence_v1 meanings for candidate/unresolved.';


/* ---- 2. THE VIEW, WITH BRANCH 3 ---- */

CREATE OR REPLACE VIEW public.hcp_evidence_tier_v1 AS

WITH partb_year AS (
  /* One row per (TA, HCP, program year) saying which limbs of that TA's composite
     the year contains. Roles come from ta_hcpcs_codes; this CTE names no code.
     Restricted to TAs actually on this model, so it is empty and free for every
     other TA rather than computing a fingerprint nobody reads. */
  SELECT cfg.therapeutic_area_id                          AS ta_id,
         d.hcp_id,
         d.program_year,
         bool_or(k.pattern_role = 'vegf')                 AS vegf,
         bool_or(k.pattern_role = 'backbone')             AS backbone,
         bool_or(k.pattern_role = 'fluoropyrimidine')     AS fluoropyrimidine
  FROM public.ta_evidence_tier_config cfg
  JOIN public.ta_hcpcs_codes k
    ON k.therapeutic_area_id = cfg.therapeutic_area_id
   AND k.pattern_role IS NOT NULL
   AND NOT k.never_upgrades          /* a corroborator can never satisfy a limb */
  JOIN public.hcp_hcpcs_detail d
    ON d.hcpcs_code = k.hcpcs_code
   AND (k.valid_from IS NULL OR d.program_year >= EXTRACT(YEAR FROM k.valid_from))
   AND (k.valid_to   IS NULL OR d.program_year <= EXTRACT(YEAR FROM k.valid_to))
  WHERE cfg.tier_model = 'partb_practice_v1'
  GROUP BY cfg.therapeutic_area_id, d.hcp_id, d.program_year
),
onc_taxonomy AS (
  /* THE GATE READS THE FULL SET, NOT THE PRIMARY CODE. hcps_v2.npi_taxonomy holds the
     primary, and primary-versus-secondary in NPPES is closer to an administrative choice
     at registration than a statement of identity: a colorectal surgeon registered
     208600000X primary with 208C00000X secondary practises colorectal surgery either way.

     ONE SHAPE, ON PURPOSE. nppes_taxonomies briefly held two -- arrays of objects and
     arrays of bare strings -- and the first reader written against it used
     jsonb_array_elements_text, which over the object form yields the object's JSON text,
     matches no code, and silently failed the gate for every pre-existing record,
     reporting a board of 199 that was really 323. The 19,043 string rows were converted
     and the producer changed, so this reads ONE shape and must keep doing so. Verified
     2026-09-14: 60,717 detail rows, 60,717 object-form, 0 string-form. DO NOT make this
     shape-tolerant -- a tolerant reader survives a split and hides it.

     THE FALLBACK to hcps_v2.npi_taxonomy is for records that predate workstream B and
     have no detail row at all, so the widening does not silently drop them.

     207RH0003X IS NOT OPTIONAL. It is the internal-medicine-subspecialty encoding of
     Hematology & Oncology -- the same practice under a different code -- and omitting it
     has cost us three times: it blocked four correct enrichment writes, it is the
     fourth-largest specialty in hcp_hcpcs_detail, and it catches 198 of the 2,094
     national bevacizumab billers against 85 for all four population codes combined.

     SAFE BY CONSTRUCTION. This gate CORROBORATES a claims pattern and admits nobody on
     its own -- every row it touches already satisfied a full limb set below. Widening it
     cannot let a non-oncologist onto the board; it can only stop excluding an oncologist
     whose registration happens to lead with something else. */
  SELECT h.id AS hcp_id
  FROM public.hcps_v2 h
  LEFT JOIN public.hcp_nppes_detail_v2 nd ON nd.hcp_id = h.id
  WHERE CASE
          WHEN nd.nppes_taxonomies IS NULL
            THEN h.npi_taxonomy IN ('207RX0202X', '207RH0000X', '207RH0003X')
          ELSE EXISTS (SELECT 1
                         FROM jsonb_array_elements(nd.nppes_taxonomies) e
                        WHERE e ->> 'code' IN ('207RX0202X', '207RH0000X', '207RH0003X'))
        END
),
partb_pattern AS (
  /* Collapse the years. A pattern in ANY single program year establishes the tier --
     persistence across years is a real signal (block 41 measures it: 43 HCPs hold
     anchor_a in all three years) but it is not part of this model, and inventing a
     persistence requirement here would move the numbers block 41 was reviewed against. */
  SELECT y.ta_id,
         y.hcp_id,
         bool_or(y.vegf AND y.backbone AND y.fluoropyrimidine)       AS anchored,
         bool_or(y.backbone AND y.fluoropyrimidine AND NOT y.vegf)   AS supported
  FROM partb_year y
  JOIN onc_taxonomy o ON o.hcp_id = y.hcp_id
  GROUP BY y.ta_id, y.hcp_id
)

/* ---- BRANCH 1: tier_model = 'nsclc_v1' ----
   Pass-through, transcribed unchanged. Every column comes from
   hcp_nsclc_evidence_tier_v1 untouched; the only thing added is ta_id, taken from the
   config row rather than from a slug lookup so that no TA literal appears in this body.

   The join is on tier_model, not on a slug, and it is safe to join that way ONLY because
   block 25's partial unique index makes nsclc_v1 a singleton. If that index is ever
   dropped, this branch starts multiplying lung rows across every nsclc_v1 TA. */
SELECT cfg.therapeutic_area_id      AS ta_id,
       e.hcp_id,
       e.npi,
       e.tier,
       e.years_anchored,
       e.recurrence_band,
       e.anchor_stem,
       e.anchor_stems,
       e.anchor_years,
       e.supported_evidence_rank,
       e.supported_evidence,
       e.lung_share,
       e.oral_denominator,
       e.oral_recent_year,
       e.lung_weighted
FROM public.hcp_nsclc_evidence_tier_v1 e
JOIN public.ta_evidence_tier_config cfg
  ON cfg.tier_model = 'nsclc_v1'

UNION ALL

/* ---- BRANCH 2: tier_model = 'partd_presence_v1' ----
   Transcribed unchanged. No TA points here after this file runs -- colorectal was the
   only one and it moves to branch 3 below -- and the branch stays anyway. See the header. */
SELECT cfg.therapeutic_area_id      AS ta_id,
       c.hcp_id,
       h.npi_number                 AS npi,
       CASE
         WHEN EXISTS (SELECT 1
                        FROM public.hcp_part_d_oncology_v1 pd
                       WHERE pd.hcp_id = c.hcp_id)
         THEN 'candidate'::text
         ELSE 'unresolved'::text
       END                          AS tier,
       NULL::bigint                 AS years_anchored,
       NULL::text                   AS recurrence_band,
       NULL::text                   AS anchor_stem,
       NULL::text[]                 AS anchor_stems,
       NULL::integer[]              AS anchor_years,
       NULL::integer                AS supported_evidence_rank,
       NULL::text                   AS supported_evidence,
       NULL::numeric                AS lung_share,
       NULL::numeric                AS oral_denominator,
       NULL::integer                AS oral_recent_year,
       NULL::boolean                AS lung_weighted
FROM public.hcp_community_scores_v2 c
JOIN public.hcps_v2 h
  ON h.id = c.hcp_id
JOIN public.ta_evidence_tier_config cfg
  ON cfg.therapeutic_area_id = c.therapeutic_area_id
 AND cfg.tier_model = 'partd_presence_v1'
WHERE h.country = 'US'

UNION ALL

/* ---- BRANCH 3: tier_model = 'partb_practice_v1' ----
   THE COHORT BASE IS hcp_community_scores_v2 JOINED TO US HCPs -- identical to branch 2
   and to hcp_nsclc_evidence_tier_v1's own cohort CTE, so all three branches mean the same
   thing by "in this TA's community cohort". It is a LEFT JOIN onto the pattern, so every
   cohort member gets a row: an HCP with no Part B fingerprint falls through to the Part D
   test exactly as it did under partd_presence_v1, and nobody drops out of the board's
   LEFT JOIN and lands on a NULL tier.

   EVERY LUNG-MODEL COLUMN IS NULL, NEVER ZERO AND NEVER FALSE. They are nsclc_v1 outputs
   and under this model they are not merely absent, they are inapplicable. lung_weighted =
   false would assert that a test was run on this physician's prescribing and came back
   negative; no such test exists here. COMMUNITY_ROSTER_BUILD.md's rule is that a missing
   modality reads UNKNOWN and never zero, and the frontend already renders an absence for
   NULL.

   years_anchored STAYS NULL TOO, deliberately, even though partb_year could count years.
   Under nsclc_v1 it counts years at the ANCHORED tier of a different ladder. Filling it
   with a count from this composite would put two incompatible meanings in one column and
   the reader has no way to tell which one it is holding. Cross-year persistence is real
   and measured (block 41); it gets its own column when something displays it. */
SELECT cfg.therapeutic_area_id      AS ta_id,
       c.hcp_id,
       h.npi_number                 AS npi,
       CASE
         WHEN p.anchored  THEN 'anchored'::text
         WHEN p.supported THEN 'supported'::text
         WHEN EXISTS (SELECT 1
                        FROM public.hcp_part_d_oncology_v1 pd
                       WHERE pd.hcp_id = c.hcp_id)
         THEN 'candidate'::text
         ELSE 'unresolved'::text
       END                          AS tier,
       NULL::bigint                 AS years_anchored,
       NULL::text                   AS recurrence_band,
       NULL::text                   AS anchor_stem,
       NULL::text[]                 AS anchor_stems,
       NULL::integer[]              AS anchor_years,
       NULL::integer                AS supported_evidence_rank,
       NULL::text                   AS supported_evidence,
       NULL::numeric                AS lung_share,
       NULL::numeric                AS oral_denominator,
       NULL::integer                AS oral_recent_year,
       NULL::boolean                AS lung_weighted
FROM public.hcp_community_scores_v2 c
JOIN public.hcps_v2 h
  ON h.id = c.hcp_id
JOIN public.ta_evidence_tier_config cfg
  ON cfg.therapeutic_area_id = c.therapeutic_area_id
 AND cfg.tier_model = 'partb_practice_v1'
LEFT JOIN partb_pattern p
  ON p.hcp_id = c.hcp_id
 AND p.ta_id  = c.therapeutic_area_id
WHERE h.country = 'US';

COMMENT ON VIEW public.hcp_evidence_tier_v1 IS
  'Evidence tier per (therapeutic area, HCP). Dispatches on '
  'ta_evidence_tier_config.tier_model: nsclc_v1 passes through '
  'hcp_nsclc_evidence_tier_v1; partd_presence_v1 emits candidate/unresolved on Part D '
  'presence alone; partb_practice_v1 adds anchored/supported from a same-provider/'
  'same-year Part B co-occurrence composite (ta_hcpcs_codes.pattern_role) behind a '
  'Med-Onc/Heme-Onc taxonomy gate, and keeps the partd_presence_v1 meanings for '
  'candidate and unresolved. Columns named lung_* are nsclc_v1 outputs and are NULL '
  'under any other model.';

/* Grants are carried through CREATE OR REPLACE rather than restored. Block 53 checks
   them anyway -- a lost grant here renders as an empty Community tab, not an error. */


/* ---- 3. REPOINT COLORECTAL ----
   LAST, deliberately: the view above already understands partb_practice_v1 before any
   row names it, so there is no ordering in which a config value exists that the
   dispatcher cannot serve. The nsclc row is not touched.

   THE CLINICAL-CONTENT COLUMNS STAY NULL, and that is now a statement rather than a
   placeholder. Block 25 left partb_anchor_codes and the floors NULL for CRC meaning
   "not curated". They are curated now -- and they live in ta_hcpcs_codes, one row per
   code with a grade, a role, a validity window and an attribution flag, which is more
   than a text[] of codes can carry. Filling the arrays here would create a second,
   poorer copy of the same facts and nothing reads them. The direction of travel is the
   opposite one: E.3 Phase 3 moves the nsclc content INTO ta_hcpcs_codes too, and these
   columns come out. */
UPDATE public.ta_evidence_tier_config cfg
SET tier_model = 'partb_practice_v1',
    notes = 'partb_practice_v1 (block 52, 2026-09-14). anchored = VEGF + backbone + '
            'fluoropyrimidine in one provider-year behind the Med-Onc/Heme-Onc taxonomy '
            'gate; supported = backbone + fluoropyrimidine, no VEGF; candidate and '
            'unresolved keep the partd_presence_v1 meanings exactly. The code content is '
            'in ta_hcpcs_codes (pattern_role, specificity_grade, never_upgrades, '
            'standalone_attribution_eligible, valid_from) -- NOT in the partb_/floor '
            'columns here, which stay NULL because a text[] cannot carry a grade, a role '
            'and a validity window. No code is standalone_attribution_eligible: '
            'colorectal has no single-molecule anchor, which is what forced this model.'
FROM public.therapeutic_areas ta
WHERE ta.id = cfg.therapeutic_area_id
  AND ta.slug = 'colorectal-cancer';


/* ==== SHAPE CHECK ====
   Expect nsclc's five tiers unchanged, colorectal's four, and no other slug present.
   Full expectations are in block 53. */
SELECT ta.slug, cfg.tier_model
FROM public.ta_evidence_tier_config cfg
JOIN public.therapeutic_areas ta ON ta.id = cfg.therapeutic_area_id
ORDER BY ta.slug;

SELECT ta.slug, e.tier, count(*) AS rows
FROM public.hcp_evidence_tier_v1 e
JOIN public.therapeutic_areas ta ON ta.id = e.ta_id
GROUP BY ta.slug, e.tier
ORDER BY ta.slug, count(*) DESC;
