/* ==== S1. NULL THE ARTIFACTS IN institution_state ====
   54 migrated values are not US state codes. Two kinds, both wrong here:

     PROVINCES, correct but not US   ON 9, BC 3, QLD 2, AP 1
     PARSE ARTIFACTS, not places     SAR 8, ABC 8, BG 6, CH 4, KP 4, CV 4,
                                     TS 2, ERN 2, KSA 1

   ERN is the tail of "CHU de Caen". ABC is a slice of an institution name.

   They are inert today because nothing reads institution_state. Once S2 ships
   they become a new false value in a new column, which is the defect this whole
   change exists to remove.

   ONE OF THE 54 IS 'institution_ror_confirmed' (a BC row): the ROR registry
   genuinely says British Columbia. Nulling it discards a true fact rather than
   a wrong one, but institution_state feeds a US state filter, and a Canadian
   province in it is a category error however it got there. The rollback table
   holds every value.

   Expect 54 rows updated. */

UPDATE public.hcps_v2
SET institution_state = NULL, institution_state_source = NULL
WHERE institution_state IS NOT NULL
  AND institution_state NOT IN ('AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID',
    'IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
    'WI','WY','DC','PR','VI','GU','AS','MP');
