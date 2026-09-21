/* ==== 04. VALIDATE THE GUARD ====
   Run only after 03 reports clean. 02 added hcps_v2_country_not_usa NOT VALID, so it
   has been refusing new 'USA' writes since the moment the data was normalised; what
   it has not yet done is read the 400,372 existing rows and confirm none of them
   violates it.

   VALIDATE CONSTRAINT takes SHARE UPDATE EXCLUSIVE -- it does not block reads or
   writes, only other schema changes on this table. That is the whole reason for the
   two-step: adding a validated CHECK outright would have held ACCESS EXCLUSIVE for
   the length of a full scan, on the table every board reads.

   IF THIS FAILS, DO NOT RE-ADD THE CONSTRAINT AS NOT VALID AND MOVE ON. A failure
   means a row holds a USA spelling that 02's `WHERE country = 'USA'` did not match
   and 03's sweep did not see -- most likely written between the two by something
   still running, which is itself the finding. Find the row:

     SELECT id, country FROM public.hcps_v2
     WHERE upper(btrim(country)) = 'USA';

   and ask what wrote it before deciding anything. Forcing past this leaves a
   constraint that claims to be enforced and is not, which is worse than no
   constraint: it is a guard everyone will trust. */

ALTER TABLE public.hcps_v2 VALIDATE CONSTRAINT hcps_v2_country_not_usa;

/* EXPECT convalidated = true. */
SELECT 'validated' AS check,
       con.conname,
       con.convalidated AS validated_expect_true,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
WHERE con.conrelid = 'public.hcps_v2'::regclass
  AND con.conname = 'hcps_v2_country_not_usa';
