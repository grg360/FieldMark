-- HCPCS descriptor lookup — Option 1 of the overlay data task (KNOWN_ISSUES:
-- "Paid-vs-administered overlay"). Code → CMS official description, built from the
-- three local Medicare provider-service parquets (2021/2022/2023): DISTINCT pairs,
-- most-frequent description within a year, most-recent year wins across years.
-- Loaded by script (see scratchpad hcpcs_descriptors.csv build); this migration is
-- the DDL + grants only. Read-only reference data — no RLS needed, SELECT granted
-- to all roles. NOT yet wired into any profile surface (separate brief).
--
-- Join contract (verified 2026-07-30 against hcp_medicare_summary_v2.top_hcpcs_codes):
-- both sides are 5-char uppercase strings, no whitespace, leading zeros preserved —
-- exact equality joins with no normalization.

create table if not exists public.hcpcs_descriptors (
  hcpcs_code text primary key,
  description text not null,
  source_year int not null
);

grant select on public.hcpcs_descriptors to anon, authenticated, service_role;
