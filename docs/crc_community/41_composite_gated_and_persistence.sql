/* ==== 41. THE COMPOSITE, WITH THE TAXONOMY GATE, AND CROSS-YEAR PERSISTENCE ====
   Read-only. Extends 40_composite_measurement.sql, which is the definition.

   TWO CHANGES FROM 40:
     * the Medical Oncology / Heme-Onc taxonomy gate the advisor requires, omitted from 40
     * the cross-year dimension: the same pattern in 1, 2 or 3 program years

   THE GATE READS THE FULL TAXONOMY SET, NOT THE PRIMARY CODE (changed 2026-09-09).

   hcps_v2.npi_taxonomy holds the PRIMARY code -- the one flagged primary_taxonomy_switch
   in NPPES -- and the primary is a proxy for the question this gate actually asks. The
   gate asks whether the provider practises oncology. The answer to that is the full set.
   Primary versus secondary in NPPES is closer to an administrative choice at registration
   than a statement of identity: a colorectal surgeon registered 208600000X primary with
   208C00000X secondary practises colorectal surgery either way, and reading only the
   primary silently fails them. 717 of the backfilled workstream-B records carry
   208600000X as primary, some with an oncology code sitting in a secondary slot.

   Safe, because of what this gate is for. It CORROBORATES a claims-based composite --
   VEGF plus a backbone plus a fluoropyrimidine, same provider, same year -- and never
   admits anyone on its own. Widening from primary to set cannot let a non-oncologist onto
   a board; it can only stop excluding an oncologist whose registration happens to lead
   with something else.

   ONE SHAPE, ON PURPOSE. This column briefly held two: an array of {code, desc, primary,
   ...} OBJECTS (41,674 rows, community_nppes_backfill.py / targeted_nppes_enrichment.py)
   and an array of bare code STRINGS (19,043 rows, the 2026-09-09 workstream-B backfill).
   The first reader written against it used jsonb_array_elements_text, which over the
   object form yields the object's JSON text and matches no code -- silently failing the
   gate for every pre-existing record and reporting a board of 199 that was really 323.

   The fix was NOT to make this reader tolerate both. A shape-tolerant reader survives the
   split and hides it: the column stays unreadable without a rulebook, and every future
   reader has to rediscover the rule or repeat the bug. The 19,043 rows were converted to
   object form and the producer changed to emit it, so this gate reads ONE shape. Same
   class as themes_tag's four spellings -- the answer is one spelling, not a reader that
   knows all four.

   SOURCE: hcp_nppes_detail_v2.nppes_taxonomies (jsonb array, written by
   nppes_workstream_b_ingest.py), FALLING BACK to hcps_v2.npi_taxonomy where no detail row
   exists -- so records that predate workstream B are not silently dropped by the change.
   The fallback coverage is reported below; it is a number to watch, not a detail.

   THE GATE includes 207RH0003X alongside 207RX0202X and 207RH0000X. 207RH0003X is
   the internal-medicine-subspecialty encoding of Hematology & Oncology -- the same practice
   under a different code -- and treating the two as different specialties is the accident
   that has now cost us three times: it blocked four correct enrichment writes, it is the
   fourth-largest specialty in hcp_hcpcs_detail, and it catches 198 of the 2,094 national
   bevacizumab billers against 85 for all four population codes combined.

   LEUCOVORIN (J0640) AND THE PUMP (96416) ARE OPTIONAL CORROBORATORS, NEVER GATES.
   Recorded because it will be re-litigated: requiring J0640 collapses the FOLFOX-like
   population roughly six-fold (23 against 140 on the same data). Leucovorin is cheap and
   frequently bundled into the administration rather than billed separately, so its ABSENCE
   from a claims row is weak evidence that it was not given. A gate built on it would be
   measuring billing practice, not clinical practice. They corroborate a pattern reached on
   the backbone; they never establish or block one.

   Everything is same hcp_id + same program_year. PRACTICE fingerprint, not regimen -- see
   40 and CRC_COMMUNITY_BUILD.md. */

WITH crc AS (
  SELECT x.hcp_id
  FROM public.hcp_therapeutic_areas_v2 x
  JOIN public.therapeutic_areas ta
    ON ta.id = x.therapeutic_area_id AND ta.slug = 'colorectal-cancer'
),
onc AS (  /* the taxonomy gate: full set, primary as fallback */
  SELECT h.id AS hcp_id
  FROM public.hcps_v2 h
  LEFT JOIN public.hcp_nppes_detail_v2 d ON d.hcp_id = h.id
  WHERE CASE
          WHEN d.nppes_taxonomies IS NULL
            THEN h.npi_taxonomy IN ('207RX0202X','207RH0000X','207RH0003X')
          ELSE EXISTS (SELECT 1 FROM jsonb_array_elements(d.nppes_taxonomies) e
                        WHERE e ->> 'code' IN ('207RX0202X','207RH0000X','207RH0003X'))
        END
),
yr AS (
  SELECT d.hcp_id, d.program_year,
         bool_or(d.hcpcs_code IN ('J9035','Q5107','Q5118','Q5126','Q5129')) AS vegf,
         bool_or(d.hcpcs_code = 'J9263') AS oxaliplatin,
         bool_or(d.hcpcs_code = 'J9206') AS irinotecan,
         bool_or(d.hcpcs_code = 'J9190') AS fluorouracil,
         bool_or(d.hcpcs_code = 'J0640') AS leucovorin,
         bool_or(d.hcpcs_code = '96416') AS pump
  FROM public.hcp_hcpcs_detail d
  JOIN crc ON crc.hcp_id = d.hcp_id
  GROUP BY d.hcp_id, d.program_year
),
flagged AS (
  SELECT yr.*,
         (onc.hcp_id IS NOT NULL) AS onc_taxonomy,
         (vegf AND oxaliplatin AND fluorouracil) AS anchor_a,
         (vegf AND irinotecan  AND fluorouracil) AS anchor_b,
         (oxaliplatin AND fluorouracil AND NOT vegf) AS supported_a,
         (irinotecan  AND fluorouracil AND NOT vegf) AS supported_b
  FROM yr LEFT JOIN onc ON onc.hcp_id = yr.hcp_id
)

/* -- 1. WHAT THE GATE COSTS ------------------------------------------------ */
SELECT 'ungated (as in 40)' AS variant,
       count(DISTINCT hcp_id) FILTER (WHERE anchor_a)    AS anchor_a,
       count(DISTINCT hcp_id) FILTER (WHERE anchor_b)    AS anchor_b,
       count(DISTINCT hcp_id) FILTER (WHERE supported_a) AS supported_a,
       count(DISTINCT hcp_id) FILTER (WHERE supported_b) AS supported_b
FROM flagged
UNION ALL
SELECT 'gated: Med Onc / Heme-Onc',
       count(DISTINCT hcp_id) FILTER (WHERE anchor_a    AND onc_taxonomy),
       count(DISTINCT hcp_id) FILTER (WHERE anchor_b    AND onc_taxonomy),
       count(DISTINCT hcp_id) FILTER (WHERE supported_a AND onc_taxonomy),
       count(DISTINCT hcp_id) FILTER (WHERE supported_b AND onc_taxonomy)
FROM flagged;

/* -- 2. CROSS-YEAR PERSISTENCE, gated -------------------------------------- */
WITH crc AS (
  SELECT x.hcp_id FROM public.hcp_therapeutic_areas_v2 x
  JOIN public.therapeutic_areas ta ON ta.id = x.therapeutic_area_id AND ta.slug = 'colorectal-cancer'
),
onc AS (SELECT h.id AS hcp_id FROM public.hcps_v2 h
        LEFT JOIN public.hcp_nppes_detail_v2 d ON d.hcp_id = h.id
        WHERE CASE WHEN d.nppes_taxonomies IS NULL
                   THEN h.npi_taxonomy IN ('207RX0202X','207RH0000X','207RH0003X')
                   ELSE EXISTS (SELECT 1 FROM jsonb_array_elements(d.nppes_taxonomies) e
                                 WHERE e ->> 'code' IN ('207RX0202X','207RH0000X','207RH0003X')) END),
yr AS (
  SELECT d.hcp_id, d.program_year,
         bool_or(d.hcpcs_code IN ('J9035','Q5107','Q5118','Q5126','Q5129')) AS vegf,
         bool_or(d.hcpcs_code = 'J9263') AS oxaliplatin,
         bool_or(d.hcpcs_code = 'J9206') AS irinotecan,
         bool_or(d.hcpcs_code = 'J9190') AS fluorouracil
  FROM public.hcp_hcpcs_detail d JOIN crc ON crc.hcp_id = d.hcp_id
  GROUP BY d.hcp_id, d.program_year
),
per_hcp AS (
  SELECT yr.hcp_id,
         count(*) FILTER (WHERE vegf AND oxaliplatin AND fluorouracil)      AS yrs_anchor_a,
         count(*) FILTER (WHERE vegf AND irinotecan  AND fluorouracil)      AS yrs_anchor_b,
         count(*) FILTER (WHERE oxaliplatin AND fluorouracil AND NOT vegf)  AS yrs_supported_a,
         count(*) FILTER (WHERE irinotecan  AND fluorouracil AND NOT vegf)  AS yrs_supported_b
  FROM yr JOIN onc ON onc.hcp_id = yr.hcp_id
  GROUP BY yr.hcp_id
)
SELECT years,
       count(*) FILTER (WHERE yrs_anchor_a    = years) AS anchor_a,
       count(*) FILTER (WHERE yrs_anchor_b    = years) AS anchor_b,
       count(*) FILTER (WHERE yrs_supported_a = years) AS supported_a,
       count(*) FILTER (WHERE yrs_supported_b = years) AS supported_b
FROM per_hcp CROSS JOIN (VALUES (1),(2),(3)) AS y(years)
GROUP BY years ORDER BY years;
