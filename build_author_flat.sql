SET statement_timeout = '30min';
DROP TABLE IF EXISTS author_pub_flat;
CREATE TABLE author_pub_flat AS
SELECT
  auth->'author'->>'id'                                AS author_id,
  p.id                                                 AS pub_id,
  p.pub_year                                           AS pub_year,
  p.source_therapeutic_area_id                         AS source_ta_id,
  auth->'author'->>'display_name'                      AS display_name,
  COALESCE(auth->'author'->>'orcid', auth->>'raw_orcid') AS orcid,
  auth->'institutions'->0->>'display_name'             AS institution,
  auth->'institutions'->0->>'ror'                      AS institution_ror
FROM publications_v2 p,
     jsonb_array_elements(p.authorships) auth
WHERE p.authorships IS NOT NULL
  AND jsonb_typeof(p.authorships) = 'array'
  AND auth->'author'->>'id' IS NOT NULL;

-- Recreate indexes. DROP TABLE removes ALL indexes with the table, so without this every rebuild
-- leaves a ~3.3M-row heap that every downstream consumer FULL-SCANS -- the ~21-min stages. Original
-- indexes (per index_and_verify.sql): author_id, source_ta_id. pub_id is ADDED here (was not on the
-- original) because ta_tagging Phase 3 scans the whole table ORDER BY pub_id (keyset pagination) and
-- Step F orders by pub_id -- both full-sort 3.3M rows without it. Confirmed consumer filter/order cols:
--   author_id    -- create_hcps + Step F (.in_) + ta_tagging scoped + inventory (IN / GROUP BY)
--   source_ta_id -- inventory (WHERE source_ta_id = ...) + create_hcps TA scoping
--   pub_id       -- ORDER BY pub_id in ta_tagging Phase 3 (whole corpus) and Step F
-- (Names match the ORIGINAL idx_author_pub_flat_* convention; IF NOT EXISTS keeps it idempotent.)
CREATE INDEX IF NOT EXISTS idx_author_pub_flat_author    ON author_pub_flat (author_id);
CREATE INDEX IF NOT EXISTS idx_author_pub_flat_source_ta ON author_pub_flat (source_ta_id);
CREATE INDEX IF NOT EXISTS idx_author_pub_flat_pub       ON author_pub_flat (pub_id);

-- DROP + CREATE TABLE AS above makes a BRAND-NEW table, which does NOT inherit the old table's
-- grants. The backend scripts that read author_pub_flat (create_hcps_v2 stage 2, ta_tagging scoped
-- mode, Step F) go through the Supabase API client, which executes as the `service_role` Postgres
-- role -- so without this the first rebuild causes "permission denied for table author_pub_flat"
-- (the error hint named service_role explicitly). Re-granting here restores it on EVERY rebuild.
-- (run_sql.py / the orchestrator's direct DATABASE_URL connection is the table owner and needs no
-- grant; only the service_role API path does. This is the only table this file recreates.)
GRANT SELECT ON public.author_pub_flat TO service_role;