-- 64 — GRANT SELECT ON hcp_part_d_oncology_v1 TO service_role.
-- Authored 2026-09-18. NOT YET APPLIED.
--
-- THE DEFECT. hcp_part_d_oncology_v1 carries SELECT for anon and authenticated and
-- NOTHING for service_role:
--
--   anon           REFERENCES, SELECT, TRIGGER, TRUNCATE
--   authenticated  REFERENCES, SELECT, TRIGGER, TRUNCATE
--   service_role   (no rows)
--
-- Every backend script runs under SUPABASE_KEY, i.e. service_role, so every server-side
-- read of this table raises 42501. It went unnoticed because nothing server-side had read
-- it until the community narrative facts layer did, on 2026-09-18.
--
-- WHY IT MATTERED MORE THAN A FAILED QUERY. The facts layer caught the exception and
-- carried on, which turned "could not read" into "read and found nothing" -- the prompt
-- then stated "Part D oncology record: present, but none of the oral agents are specific
-- to this therapeutic area" for every HCP on the board. A fabricated negative about a
-- named physician, from a permissions error. The code half is fixed independently (a
-- failed read now withholds the scoped claim and falls back to the pan-oncology wording
-- that part_d_present actually supports), so this grant is what RESTORES the specific
-- claim rather than what prevents the false one.
--
-- This is the failure mode recorded for Supabase grants generally: a new table is created
-- with the API roles granted and service_role forgotten, and nothing complains until a
-- backend job needs it.
--
-- APPLY:
--   $env:PYTHONIOENCODING = "utf-8"
--   python scripts/utilities/run_sql.py --file docs/crc_community/64_part_d_service_role_grant.sql

GRANT SELECT ON public.hcp_part_d_oncology_v1 TO service_role;

-- SAME GAP, SAME INGEST. The sweep at the bottom of this file was run before writing it
-- and found exactly two tables in the community read path with authenticated SELECT and
-- no service_role SELECT -- both from the Part D oncology ingest. part_d_oncology_drugs_v1
-- is the stem/drug_group dictionary; nothing server-side reads it yet, which is the only
-- reason it has not failed too. Granted here rather than left for the next script to trip
-- over.
GRANT SELECT ON public.part_d_oncology_drugs_v1 TO service_role;

-- VERIFY. Expect one row per privilege for each of the three roles, service_role included.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('hcp_part_d_oncology_v1', 'part_d_oncology_drugs_v1')
  AND grantee IN ('anon', 'authenticated', 'service_role')
  AND privilege_type = 'SELECT'
ORDER BY table_name, grantee;

-- AND CHECK THE SIBLINGS WHILE YOU ARE HERE. Same creation pattern, same risk; any of
-- these missing a service_role SELECT is the same bug waiting for its first backend read.
SELECT c.relname AS table_name,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_can_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'v', 'm')
  AND c.relname IN ('hcp_part_d_oncology_v1', 'part_d_oncology_drugs_v1',
                    'hcp_hcpcs_detail', 'ta_hcpcs_codes', 'ta_evidence_tier_config',
                    'community_board_v1', 'hcp_evidence_tier_v1',
                    'hcp_medicare_by_ta_v2', 'hcp_community_scores_v2')
ORDER BY service_role_can_select, c.relname;
