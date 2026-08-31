-- Seed: ta_drug_keywords for Colorectal Cancer (29 rows: 14 primary, 15 secondary).
-- Date: 2026-08-28. Branch: foundation-rebuild.
-- Revert: sql/revert/2026_08_28_seed_ta_drug_keywords_crc_REVERT.sql
--
-- Clinical review validated through 2026-08-28. This list measures MANUFACTURER-HCP
-- RELATIONSHIPS THAT EVIDENCE CRC ENGAGEMENT -- it is not the treatment armamentarium.
--
-- CHEMOTHERAPY BACKBONE DELIBERATELY EXCLUDED: 5-FU, leucovorin, oxaliplatin, irinotecan,
-- capecitabine. Generic, largely off-patent, ubiquitous across GI, and poor discriminators of
-- CRC even when they do appear. NSCLC carries no backbone either; same philosophy.
--
-- ALSO EXCLUDED, deliberately: binimetinib (Mektovi). Part of the original BEACON triplet, but
-- current BRAF CRC practice is anchored on encorafenib + cetuximab, so Mektovi is not the
-- commercial CRC signal wanted -- despite 11,257 payments / $539k in 2022-24, which is exactly
-- why it needs saying out loud rather than being silently absent.
--
-- ── HOW THE MATCHER ACTUALLY WORKS (measured 2026-08-28; read before editing) ──────────────
-- open_payments_aggregator.py:482-485 is the only consumer that matches on these columns:
--     lower(fp.drug_name) = lower(dk.drug_name)                                    -- EXACT
--  OR lower(fp.drug_name) LIKE '%' || lower(dk.drug_brand_name) || '%'             -- SUBSTRING
--
-- 1. drug_generic_name IS NEVER MATCHED ON. It is loaded into the DuckDB temp table and used
--    by no predicate. It is documentation that survives a future matcher change.
-- 2. OPEN PAYMENTS RECORDS BRANDS, NOT GENERICS. Measured across op_general_pgyr2022-2024:
--       lower(drug_name) LIKE '%bevacizumab%'  -> 0 rows
--       lower(drug_name) LIKE '%aflibercept%'  -> 0 rows
--    So every row below puts a BRAND in drug_name, not the generic. A generic in drug_name
--    would simply never fire -- and worse, would be a live hazard the day CMS starts
--    recording generics (see the two traps).
-- 3. Substring matching gives subcutaneous aliases free: '%keytruda%' catches "Keytruda Qlex",
--    '%opdivo%' catches "Opdivo Qvantig". No separate rows needed.
-- 4. No brand alias below is a substring of another, so no cross-contamination.
--
-- ── TRAP 1: ziv-aflibercept must never normalise to "aflibercept" ──────────────────────────
-- Aflibercept is also the ophthalmology molecule behind Eylea. A row carrying the bare generic
-- in a MATCHED column would pull retina specialists onto a CRC board. So Zaltrap's row carries
-- 'Zaltrap' in BOTH drug_name and drug_brand_name; 'ziv-aflibercept' appears only in
-- drug_generic_name, which is inert. No row in this file contains the string "aflibercept" in
-- a matched column. Verified: '%zaltrap%' = 4 payments / $5,660.
--
-- ── TRAP 2: bevacizumab needs the oncology biosimilar family, and NOT Lytenava ─────────────
-- Because the generic never matches, one row per BRAND is the only thing that works. Seven
-- rows: Avastin, Mvasi, Zirabev, Alymsys, Vegzelma, Avzivi, Jobevee. Lytenava
-- (bevacizumab-vikg, intravitreal ophthalmic, approved July 2026) gets NO ROW, and no row
-- carries the bare generic -- so the ophthalmic product cannot enter by either arm.
-- Measured 2022-24: vegzelma 2,626 · avastin 1,358 · mvasi 128 · zirabev 46 · alymsys 16;
-- avzivi/jobevee/lytenava all 0 (approved after this data -- avzivi and jobevee are seeded
-- forward-looking, lytenava is excluded on purpose).
--
-- ACCEPTED MODELLING ARTIFACT: seven bevacizumab rows means an HCP paid on three of the
-- biosimilars counts as 3 toward ta_distinct_drugs_3yr, not 1. Accepted deliberately (ruling
-- 2026-08-28) because the single-row alternative -- brand 'bevacizumab' -- matches nothing at
-- all. Each bevacizumab row's notes repeats this so it is discoverable from the data.
--
-- ── WATCHLIST ─────────────────────────────────────────────────────────────────────────────
-- Two rows exist at is_primary_signal = false and are NOT active CRC attribution:
--   zanzalintinib -- cabozantinib successor, phase III STELLAR-303 in previously treated mCRC,
--     NDA accepted 2026-12-03. 0 payments today (pre-approval). If approved, expect PRIMARY:
--     CRC would be its defining launch indication.
--   Jemperli (dostarlimab) -- FDA priority review for untreated stage II/III dMMR/MSI-H locally
--     advanced rectal cancer, Feb 2027 PDUFA, on AZUR-1. Kept off active attribution because
--     its 11,648 payments / $2.8M today are dominated by non-CRC indications. Revisit on
--     approval. (Listed twice in the source brief -- once under primary, once as watchlist.
--     Watchlist is correct; there is ONE Jemperli row and it is false.)
--
-- ── RECIPIENT PROFILE, AND THE FALSIFIABLE CHECK ──────────────────────────────────────────
-- Medical oncologists overwhelmingly: academic GI/CRC and community medical oncologists for
-- the established agents, molecular/precision oncology specialists for the newer targeted
-- ones. COLORECTAL SURGEONS SHOULD NOT BE A MAJOR RECIPIENT POPULATION. If a drug-linked Open
-- Payments cohort fills with colorectal surgeons, the matching is wrong -- that is the test.
--
-- ── IDEMPOTENCY ───────────────────────────────────────────────────────────────────────────
-- The table had NO unique constraint beyond the PK on id, and id defaults to
-- gen_random_uuid() -- so a bare ON CONFLICT DO NOTHING would have collided on nothing and
-- DUPLICATED all 29 rows on a second run. Step 1 adds the natural key that makes the conflict
-- clause mean what it says. Verified before adding: 0 duplicate (therapeutic_area_id,
-- drug_name) groups across the existing 105 rows, case-insensitively too.

BEGIN;

-- 1. The natural key. Makes ON CONFLICT DO NOTHING genuinely idempotent, here and for every
--    future TA seed. Safe: no existing duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS ta_drug_keywords_ta_drug_uniq
  ON public.ta_drug_keywords (therapeutic_area_id, drug_name);

-- 2. The rows.
INSERT INTO public.ta_drug_keywords
  (therapeutic_area_id, drug_name, drug_brand_name, drug_generic_name,
   is_primary_signal, market_position, expected_recipient_profile, notes)
VALUES
-- ── PRIMARY ───────────────────────────────────────────────────────────────────────────────
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Erbitux','Erbitux','cetuximab',true,
 'foundational anti-EGFR','medical oncologist (academic GI/CRC and community)',
 'Foundational anti-EGFR for RAS-WT mCRC; also the combination partner in BRAF V600E and KRAS G12C CRC. 19 payments / $18,236 in 2022-24.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Vectibix','Vectibix','panitumumab',true,
 'CRC-centred anti-EGFR','medical oncologist (academic GI/CRC and community)',
 'CRC-centred anti-EGFR; first-line/later-line RAS-WT mCRC and KRAS G12C combination partner. 2,645 payments / $133,279.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Avastin','Avastin','bevacizumab',true,
 'foundational anti-VEGF','medical oncologist (academic GI/CRC and community)',
 'Foundational anti-VEGF across mCRC lines. The hardest call on this list: primary because CRC is so foundational a commercial indication that a bevacizumab payment materially raises the probability of CRC practice -- analogous to pembrolizumab being primary for NSCLC. BEVACIZUMAB FAMILY EXPANDS TO 7 BRAND ROWS and therefore counts as up to 7 toward ta_distinct_drugs_3yr; known modelling artifact, accepted 2026-08-28 because the generic never matches. Lytenava (bevacizumab-vikg, ophthalmic) is deliberately excluded.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Mvasi','Mvasi','bevacizumab',true,
 'bevacizumab biosimilar','medical oncologist (academic GI/CRC and community)',
 'Bevacizumab biosimilar. Part of the 7-brand bevacizumab family; counts as up to 7 toward ta_distinct_drugs_3yr -- known artifact, accepted because the generic never matches. 128 payments.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Zirabev','Zirabev','bevacizumab',true,
 'bevacizumab biosimilar','medical oncologist (academic GI/CRC and community)',
 'Bevacizumab biosimilar. Part of the 7-brand bevacizumab family; counts as up to 7 toward ta_distinct_drugs_3yr -- known artifact, accepted because the generic never matches. 46 payments.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Alymsys','Alymsys','bevacizumab',true,
 'bevacizumab biosimilar','medical oncologist (academic GI/CRC and community)',
 'Bevacizumab biosimilar. Part of the 7-brand bevacizumab family; counts as up to 7 toward ta_distinct_drugs_3yr -- known artifact, accepted because the generic never matches. 16 payments.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Vegzelma','Vegzelma','bevacizumab',true,
 'bevacizumab biosimilar','medical oncologist (academic GI/CRC and community)',
 'Bevacizumab biosimilar and the HIGHEST-VOLUME bevacizumab brand in 2022-24 at 2,626 payments -- nearly double Avastin. Part of the 7-brand family; counts as up to 7 toward ta_distinct_drugs_3yr -- known artifact, accepted because the generic never matches.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Avzivi','Avzivi','bevacizumab',true,
 'bevacizumab biosimilar','medical oncologist (academic GI/CRC and community)',
 'Bevacizumab biosimilar. FORWARD-LOOKING: 0 payments in 2022-24, approved after this data. Part of the 7-brand family; counts as up to 7 toward ta_distinct_drugs_3yr -- known artifact, accepted because the generic never matches.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Jobevee','Jobevee','bevacizumab',true,
 'bevacizumab biosimilar','medical oncologist (academic GI/CRC and community)',
 'Bevacizumab biosimilar. FORWARD-LOOKING: 0 payments in 2022-24, approved after this data. Part of the 7-brand family; counts as up to 7 toward ta_distinct_drugs_3yr -- known artifact, accepted because the generic never matches.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Zaltrap','Zaltrap','ziv-aflibercept',true,
 'CRC-specific anti-VEGF','medical oncologist (academic GI/CRC and community)',
 'CRC-specific anti-VEGF with FOLFIRI after oxaliplatin failure; essentially a clean CRC oncology product. TRAP: must NOT normalise to generic "aflibercept" -- that is the Eylea ophthalmology molecule and would pull retina specialists onto a CRC board. Brand-only matching: ZALTRAP / ZIV-AFLIBERCEPT. 4 payments / $5,660.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Stivarga','Stivarga','regorafenib',true,
 'later-line multikinase','medical oncologist (academic GI/CRC and community)',
 'Established later-line multikinase therapy in refractory mCRC. 7,664 payments / $515,260.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Lonsurf','Lonsurf','trifluridine/tipiracil',true,
 'later-line oral','medical oncologist (academic GI/CRC and community)',
 'Major later-line mCRC therapy, now commonly used with bevacizumab. 7,584 payments / $945,538.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Braftovi','Braftovi','encorafenib',true,
 'BRAF V600E targeted','medical oncologist, molecular/precision oncology',
 'BRAF V600E-targeted with cetuximab; moved into first-line metastatic disease, traditional FDA approval February 2026. 12,393 payments / $1,335,541.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Fruzaqla','Fruzaqla','fruquintinib',true,
 'CRC-focused oral VEGFR','medical oncologist, molecular/precision oncology',
 'CRC-focused oral VEGFR inhibitor for previously treated mCRC. 4,339 payments / $1,534,490.'),
-- ── SECONDARY ─────────────────────────────────────────────────────────────────────────────
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Tukysa','Tukysa','tucatinib',false,
 'HER2 targeted, breast-weighted','medical oncologist, molecular/precision oncology',
 'HER2-targeted with trastuzumab in CRC, but the commercial signal is massively breast-weighted. 20,153 payments / $3.6M.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Herceptin','Herceptin','trastuzumab',false,
 'HER2 backbone, breast/gastric-diluted','medical oncologist, molecular/precision oncology',
 'HER2 backbone with tucatinib in CRC; heavily diluted by breast and gastric. Brand row only -- biosimilars deliberately not enumerated for a secondary agent.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Enhertu','Enhertu','fam-trastuzumab deruxtecan',false,
 'tumour-agnostic HER2','medical oncologist, molecular/precision oncology',
 'Tumour-agnostic HER2 with documented HER2+ CRC activity, but a payment is far more likely to reflect breast/gastric/lung. 49,027 payments / $10.7M -- the largest volume on this list and the clearest case for secondary.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Keytruda','Keytruda','pembrolizumab',false,
 'MSI-H/dMMR immunotherapy','medical oncologist (academic GI/CRC and community)',
 'Major MSI-H/dMMR CRC immunotherapy; commercial signal massively diluted across cancers. Substring match also catches the subcutaneous alias "Keytruda Qlex". 75,067 payments / $8.2M.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Opdivo','Opdivo','nivolumab',false,
 'MSI-H/dMMR immunotherapy','medical oncologist (academic GI/CRC and community)',
 'MSI-H/dMMR CRC immunotherapy, alone or with ipilimumab. Substring match also catches "Opdivo Qvantig". 43,181 payments / $10.0M.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Yervoy','Yervoy','ipilimumab',false,
 'CTLA-4 combination partner','medical oncologist (academic GI/CRC and community)',
 'CTLA-4 partner with nivolumab for MSI-H/dMMR CRC. FDA approved the combination for unresectable/metastatic MSI-H/dMMR CRC April 2025 and converted nivolumab monotherapy CRC to regular approval. Only 52 payments in 2022-24 -- pre-dates the approval.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Lumakras','Lumakras','sotorasib',false,
 'KRAS G12C, lung-dominant','medical oncologist, molecular/precision oncology',
 'KRAS G12C with panitumumab in previously treated mCRC; product signal is lung-dominant. 10,621 payments / $1.5M.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Krazati','Krazati','adagrasib',false,
 'KRAS G12C, lung-contaminated','medical oncologist, molecular/precision oncology',
 'KRAS G12C with cetuximab in previously treated CRC; substantial lung contamination. 11,499 payments / $1.7M.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Vitrakvi','Vitrakvi','larotrectinib',false,
 'tumour-agnostic NTRK','medical oncologist, molecular/precision oncology',
 'Tumour-agnostic NTRK; rare CRC application. 6,884 payments / $866,698.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Rozlytrek','Rozlytrek','entrectinib',false,
 'tumour-agnostic NTRK','medical oncologist, molecular/precision oncology',
 'Tumour-agnostic NTRK; rare CRC application, substantial non-CRC use. 2,888 payments / $103,441.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Augtyro','Augtyro','repotrectinib',false,
 'tumour-agnostic NTRK','medical oncologist, molecular/precision oncology',
 'Newer tumour-agnostic NTRK; rare CRC relevance. 668 payments / $116,791.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Retevmo','Retevmo','selpercatinib',false,
 'tumour-agnostic RET','medical oncologist, molecular/precision oncology',
 'RET-fusion tumour-agnostic; exceptionally rare CRC niche. Tumour-agnostic RET indication received traditional FDA approval July 2026. 11,285 payments / $1.2M.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Cyramza','Cyramza','ramucirumab',false,
 'anti-VEGFR2, multi-tumour','medical oncologist (academic GI/CRC and community)',
 'Anti-VEGFR2 with FOLFIRI after bevacizumab-containing treatment; significant gastric, lung and HCC dilution. 2,370 payments / $77,207.'),
-- ── WATCHLIST (false; not active CRC attribution) ─────────────────────────────────────────
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Jemperli','Jemperli','dostarlimab',false,
 'WATCHLIST -- pending rectal indication','medical oncologist (academic GI/CRC and community)',
 'WATCHLIST -- NOT ACTIVE CRC ATTRIBUTION. FDA accepted for priority review for previously untreated stage II/III dMMR/MSI-H locally advanced rectal cancer, February 2027 PDUFA, based on AZUR-1. Held at secondary because current payments (11,648 / $2.8M) are far too dominated by existing non-CRC indications. Revisit if the rectal indication is approved.'),
('a2b28e54-0e0e-48a7-98e1-504f48e45d81','Zanzalintinib','Zanzalintinib','zanzalintinib',false,
 'WATCHLIST -- pre-approval','medical oncologist, molecular/precision oncology',
 'WATCHLIST -- NOT ACTIVE CRC ATTRIBUTION. The biggest omission looking forward: cabozantinib successor, phase III STELLAR-303 in previously treated mCRC, FDA accepted the NDA 2026-12-03 with a PDUFA date. 0 payments in 2022-24 (pre-approval). If approved, expect this to become PRIMARY -- CRC would be its defining launch indication.')
ON CONFLICT (therapeutic_area_id, drug_name) DO NOTHING;

COMMIT;

-- ROW COUNT, reconciled against the source brief:
--   PRIMARY   7 single-brand agents (cetuximab, panitumumab, ziv-aflibercept, regorafenib,
--             trifluridine/tipiracil, encorafenib, fruquintinib) + 7 bevacizumab brands = 14
--   SECONDARY 13 agents. NOTE: the brief's heading said "12 agents" but enumerated 13
--             (tucatinib, trastuzumab, fam-trastuzumab deruxtecan, pembrolizumab, nivolumab,
--             ipilimumab, sotorasib, adagrasib, larotrectinib, entrectinib, repotrectinib,
--             selpercatinib, ramucirumab). All 13 are seeded; the heading undercounted.
--   WATCHLIST 2 (Jemperli, Zanzalintinib), both false, counted in the 15 below.
--   TOTAL     29 rows -- 14 true, 15 false.
--
-- Verify:
--   SELECT is_primary_signal, count(*) FROM ta_drug_keywords
--    WHERE therapeutic_area_id='a2b28e54-0e0e-48a7-98e1-504f48e45d81' GROUP BY 1;
--   expect: true 14, false 15
