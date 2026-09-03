/* ==== S7. THE PROVENANCE COLUMN'S OWN INVARIANT ====
   FULLY VALID, no NOT VALID needed: measured 2026-09-02, zero rows have a value without a
   source and zero have a source without a value.

   BOTH DIRECTIONS, on purpose. A value with no source is a provenance split that has become
   decorative. A source with no value is the same failure inverted: a claim about the origin
   of nothing. The equality form states the pairing rather than testing one half of it. */

ALTER TABLE public.hcps_v2
  ADD CONSTRAINT institution_state_has_a_source
  CHECK ((institution_state IS NULL) = (institution_state_source IS NULL));
