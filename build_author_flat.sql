SET statement_timeout = '30min';

-- SWAP-IN REBUILD (read-availability). Build a full replacement table off to the side, then swap
-- it in under one atomic rename -- so the canonical author_pub_flat is never dropped or locked for
-- the duration of the rebuild (~1 min on the current ~3.4M-row corpus). The previous DROP TABLE +
-- CREATE TABLE AS took an ACCESS EXCLUSIVE lock on the canonical name for the whole rebuild, so
-- every live full-scan consumer (create_hcps stage 2, ta_tagging scoped mode, Step F) blocked
-- until it finished. Now those readers see the old table uninterrupted until a millisecond metadata
-- rename (under run_sql.py's whole-file transaction, the swap is invisible until the final commit,
-- so the lock window is only the rename + old-table drop + commit -- seconds, not the whole build).
--
-- SEMANTICS ARE UNCHANGED: identical SELECT, column list, index definitions, and grants. This
-- changes only WHEN the table is unavailable, not what it contains -- same rows, same shape, same
-- permissions. Deliberately still a FULL-CORPUS flatten (NOT scoped by TA); TA scoping / incremental
-- flatten is a separate decision, out of scope here.
--
-- DISK: both tables coexist during the rebuild, so peak disk ~= 2x the table's total size (see the
-- ticket's size report) until the old table is dropped at the end.
--
-- FAILURE SAFETY (bonus of the side-build): if the build or the swap fails, the canonical
-- author_pub_flat is left exactly as it was -- the swap is the only step that touches it, and it is
-- atomic. A crashed run leaves a stale author_pub_flat_new (or _old), which the leading cleanup
-- drops on the next run.

-- Clean any leftovers from a previously-failed run. IF EXISTS keeps this idempotent.
DROP TABLE IF EXISTS author_pub_flat_new;
DROP TABLE IF EXISTS author_pub_flat_old;

-- 1. Build the replacement off to the side. IDENTICAL SELECT / columns to the original; the
--    canonical author_pub_flat is untouched and fully readable throughout the rebuild.
CREATE TABLE author_pub_flat_new AS
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

-- 2. Same indexes as the original (author_id, source_ta_id, pub_id -- confirmed consumer
--    filter/order cols: author_id = create_hcps + Step F + ta_tagging + inventory; source_ta_id =
--    inventory + create_hcps TA scoping; pub_id = ta_tagging Phase 3 + Step F keyset order). Built
--    here as idx_author_pub_flat_NEW_* so they can be renamed to the canonical idx_author_pub_flat_*
--    names inside the swap (freeing the _new_* names for the next rebuild). Definitions are
--    byte-identical to the original.
CREATE INDEX idx_author_pub_flat_new_author    ON author_pub_flat_new (author_id);
CREATE INDEX idx_author_pub_flat_new_source_ta ON author_pub_flat_new (source_ta_id);
CREATE INDEX idx_author_pub_flat_new_pub       ON author_pub_flat_new (pub_id);

-- 3. Same grant as the original: the service_role API path (create_hcps stage 2, ta_tagging scoped,
--    Step F) reads this table, and a fresh CREATE TABLE does not inherit the old table's grants.
--    (The rename in step 4 carries this grant onto the canonical table, since grants follow the OID.
--    anon/authenticated REFERENCES/TRIGGER/TRUNCATE come from the DB's default privileges on any
--    new table, matching the original.)
GRANT SELECT ON public.author_pub_flat_new TO service_role;

-- 4. ATOMIC SWAP. A single DO block executes as one transaction, so there is never a moment where
--    neither table holds the canonical name -- true whether the runner wraps the whole file in a
--    transaction (run_sql.py does: one cur.execute of the file, commit at end) or autocommits per
--    statement (psql -f). The outgoing table's indexes are renamed out of the way first so the
--    incoming table can take the canonical index names. The table rename is metadata-only (a brief
--    ACCESS EXCLUSIVE lock, milliseconds). The IF guard makes the first-ever build (no canonical
--    table yet) work too.
DO $$
BEGIN
  IF to_regclass('public.author_pub_flat') IS NOT NULL THEN
    ALTER INDEX IF EXISTS idx_author_pub_flat_author    RENAME TO idx_author_pub_flat_old_author;
    ALTER INDEX IF EXISTS idx_author_pub_flat_source_ta RENAME TO idx_author_pub_flat_old_source_ta;
    ALTER INDEX IF EXISTS idx_author_pub_flat_pub       RENAME TO idx_author_pub_flat_old_pub;
    ALTER TABLE author_pub_flat RENAME TO author_pub_flat_old;
  END IF;
  ALTER TABLE author_pub_flat_new RENAME TO author_pub_flat;
  ALTER INDEX idx_author_pub_flat_new_author    RENAME TO idx_author_pub_flat_author;
  ALTER INDEX idx_author_pub_flat_new_source_ta RENAME TO idx_author_pub_flat_source_ta;
  ALTER INDEX idx_author_pub_flat_new_pub       RENAME TO idx_author_pub_flat_pub;
END
$$;

-- 5. Drop the superseded old table (and its _old_* indexes); frees the doubled disk.
DROP TABLE IF EXISTS author_pub_flat_old;
